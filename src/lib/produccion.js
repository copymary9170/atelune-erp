// Seguimiento independiente por renglón; no altera los estados del pedido,
// inventario, precios, pagos ni contabilidad.
export const ETAPAS = Object.freeze({
  archivo: 'Revisar archivo / indicaciones',
  diseno: 'Diseño y aprobación',
  impresion: 'Impresión',
  corte: 'Corte (manual o máquina)',
  armado: 'Armado y acabados',
  planchado: 'Planchado / sublimación',
  calidad: 'Control de calidad y empaque',
})

export const RUTAS = Object.freeze({
  impresion: { nombre: 'Impresión', etapas: ['archivo', 'impresion', 'calidad'] },
  topper: { nombre: 'Topper o papelería creativa', etapas: ['archivo', 'diseno', 'impresion', 'corte', 'armado', 'calidad'] },
  sublimacion: { nombre: 'Sublimación', etapas: ['archivo', 'diseno', 'impresion', 'corte', 'planchado', 'calidad'] },
  personalizado: { nombre: 'Personalizado / vinil', etapas: ['archivo', 'diseno', 'corte', 'armado', 'calidad'] },
  reventa: { nombre: 'Producto de reventa', etapas: ['calidad'] },
})

export const obtenerRuta = (produccion = {}, indice) => produccion[String(indice)] ?? null

export function crearRuta(preset, fecha = new Date().toISOString()) {
  const ruta = RUTAS[preset]
  if (!ruta) throw new Error('Ruta de producción no reconocida')
  return { preset, etapas: ruta.etapas.map(id => ({ id, completada: false, fecha: null })), creada: fecha }
}

export function marcarEtapa(ruta, id, completada, fecha = new Date().toISOString()) {
  if (!ruta || !ruta.etapas?.some(e => e.id === id)) throw new Error('Etapa no encontrada')
  if (completada && ruta.etapas.some(e => e.id !== id && !e.completada && ruta.etapas.findIndex(x => x.id === e.id) < ruta.etapas.findIndex(x => x.id === id))) {
    throw new Error('Completa primero las etapas anteriores')
  }
  const posicion = ruta.etapas.findIndex(e => e.id === id)
  // Si se reabre una etapa, las posteriores también se reabren para evitar un historial inconsistente.
  return { ...ruta, etapas: ruta.etapas.map((e, i) => i === posicion
    ? { ...e, completada: !!completada, fecha: completada ? fecha : null }
    : !completada && i > posicion ? { ...e, completada: false, fecha: null } : { ...e }) }
}

export function progresoRuta(ruta) {
  const total = ruta?.etapas?.length || 0
  const hechas = (ruta?.etapas || []).filter(e => e.completada).length
  return { hechas, total, porcentaje: total ? Math.round(hechas * 100 / total) : 0, completa: total > 0 && hechas === total }
}

export function resumenProduccion(pedidos = []) {
  let sinRuta = 0, enProceso = 0, terminados = 0
  for (const p of pedidos) {
    if (['cancelado', 'entregado'].includes(p.estado)) continue
    for (let i = 0; i < (p.items || []).length; i++) {
      const ruta = obtenerRuta(p.produccionEtapas, i)
      if (!ruta) sinRuta++
      else if (progresoRuta(ruta).completa) terminados++
      else enProceso++
    }
  }
  return { sinRuta, enProceso, terminados }
}
