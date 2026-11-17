// Operaciones puras para la Etapa 10: nunca modifican la cotización original.
// Una copia es siempre borrador, con número nuevo y sin cálculo guardado.
export function prepararDuplicadoCotizacion(origen, numero, fecha) {
  if (!origen || !Number.isInteger(origen.id)) throw new Error('Cotización original inválida.')
  if (!Number.isSafeInteger(numero) || numero < 1) throw new Error('Número de cotización inválido.')
  const copia = structuredClone(origen)
  delete copia.id
  delete copia.calculo
  delete copia.pedidoId
  delete copia.fechaAprobacion
  delete copia.fechaEnvio
  return {
    ...copia,
    numero,
    fecha,
    estado: 'borrador',
    cotizacionOrigenId: origen.id,
    items: Array.isArray(copia.items) ? copia.items : [],
  }
}

// Porcentaje por cantidad: gana el escalón de umbral más alto alcanzado.
// Se descartan filas incompletas durante la edición; los descuentos no se
// acumulan entre escalones. Los rangos válidos son 1..n y 0..100 %.
export function descuentoPorCantidad(cantidad, escalas = []) {
  const q = Number(cantidad)
  if (!Number.isFinite(q) || q <= 0 || !Array.isArray(escalas)) return { descuentoPct: 0, desde: null }
  let elegida = null
  for (const e of escalas) {
    const desde = Number(e?.desde)
    const descuentoPct = Number(e?.descuentoPct)
    if (e?.desde == null || e?.desde === '' || e?.descuentoPct == null || e?.descuentoPct === '') continue
    if (!Number.isSafeInteger(desde) || desde < 1 || !Number.isFinite(descuentoPct) || descuentoPct < 0 || descuentoPct > 100 || desde > q) continue
    if (!elegida || desde >= elegida.desde) elegida = { desde, descuentoPct }
  }
  return elegida || { descuentoPct: 0, desde: null }
}

export function escalasInvalidas(escalas) {
  if (!Array.isArray(escalas)) return true
  const vistos = new Set()
  return escalas.some(e => {
    const desde = Number(e?.desde), pct = Number(e?.descuentoPct)
    if (e?.desde == null || e?.desde === '' || e?.descuentoPct == null || e?.descuentoPct === ''
      || !Number.isSafeInteger(desde) || desde < 1
      || !Number.isFinite(pct) || pct < 0 || pct > 100 || vistos.has(desde)) return true
    vistos.add(desde)
    return false
  })
}
