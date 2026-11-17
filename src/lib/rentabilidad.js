import { resumenTiempos } from './tiempos.js'

const importe = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null
const sumar = lista => lista.reduce((a, b) => a + b, 0)

/**
 * Diagnóstico comparativo que NO modifica la contabilidad ni los precios.
 * La mano de obra observada reemplaza la presupuestada; nunca se suma dos veces.
 * El resto del costo continúa siendo el presupuesto original, no un costo real medido.
 */
export function fichaRentabilidad(pedido) {
  const items = Array.isArray(pedido?.items) ? pedido.items : []
  const precios = Array.isArray(pedido?.precios) ? pedido.precios : []
  const tiempos = pedido?.tiemposProduccion || {}
  const avisos = []
  const costoPresupuestado = importe(pedido?.costoTotal)
  const precioTrabajos = importe(pedido?.subtotal)
  const gananciaPresupuestada = importe(pedido?.ganancia)
  const tienePrecios = items.length > 0 && items.every((_, i) => importe(precios[i]?.costo) !== null && importe(precios[i]?.manoObra) !== null)
  if (!items.length) avisos.push('Este pedido no tiene trabajos registrados.')
  if (!tienePrecios) avisos.push('No todos los trabajos conservan costos y mano de obra presupuestados por separado.')
  if (costoPresupuestado === null || precioTrabajos === null) avisos.push('Faltan importes presupuestados del pedido.')
  const lineas = items.map((item, i) => {
    const registros = Array.isArray(tiempos[String(i)]) ? tiempos[String(i)] : []
    const r = resumenTiempos(registros)
    const costoPlan = importe(precios[i]?.costo)
    const manoPlan = importe(precios[i]?.manoObra)
    if (!registros.length) avisos.push(`Trabajo ${i + 1}: falta registrar tiempo de producción.`)
    if (r.sinTarifa) avisos.push(`Trabajo ${i + 1}: ${r.sinTarifa} sesión(es) sin tarifa por hora.`)
    return { descripcion: item.descripcion || `Trabajo ${i + 1}`, minutos: r.minutos, sesiones: r.registros,
      sinTarifa: r.sinTarifa, manoObraPresupuestada: manoPlan, manoObraRegistrada: r.costoConocido,
      costoPresupuestado: costoPlan }
  })
  if (pedido?.costoIncompleto?.length) avisos.push(...pedido.costoIncompleto.map(a => `Cotización: ${a}`))
  if (pedido?.estado !== 'entregado') avisos.push('El pedido todavía no está entregado: podrían faltar sesiones de trabajo.')
  const manoObraPresupuestada = tienePrecios ? sumar(lineas.map(l => l.manoObraPresupuestada)) : null
  const manoObraRegistrada = sumar(lineas.map(l => l.manoObraRegistrada))
  const minutosRegistrados = sumar(lineas.map(l => l.minutos))
  const coberturaCompleta = lineas.length > 0 && lineas.every(l => l.sesiones > 0 && l.sinTarifa === 0)
  const aptoProyeccion = costoPresupuestado !== null && precioTrabajos !== null && tienePrecios && coberturaCompleta && !pedido?.costoIncompleto?.length
  // Esto sigue siendo PROYECCIÓN: otros costes permanecen presupuestados.
  const costoAjustado = aptoProyeccion ? costoPresupuestado - manoObraPresupuestada + manoObraRegistrada : null
  const utilidadAjustada = aptoProyeccion ? precioTrabajos - costoAjustado : null
  const variacionManoObra = manoObraPresupuestada === null ? null : manoObraRegistrada - manoObraPresupuestada
  return { lineas, avisos, costoPresupuestado, precioTrabajos, gananciaPresupuestada,
    manoObraPresupuestada, manoObraRegistrada, minutosRegistrados,
    variacionManoObra, costoAjustado, utilidadAjustada, aptoProyeccion,
    pendienteConfirmacion: pedido?.estado !== 'entregado' }
}
