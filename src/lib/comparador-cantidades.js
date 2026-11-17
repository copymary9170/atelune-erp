import { calcularCotizacion, faltantesDeCosto, avisosCotizacion, redondear } from './calc.js'
import { escalasInvalidas } from './escalas-cotizaciones.js'

export const CANTIDADES_COMPARADOR = Object.freeze([10, 50, 100])

/**
 * Escenarios de precio calculados por el MISMO motor de cotización utilizado
 * para guardar pedidos. No modifica la cotización ni crea datos persistentes.
 * Mantiene los demás renglones y las condiciones de pago sin cambios.
 * Por ello la parte de costos fijos del renglón puede variar con la cantidad.
 */
export function compararCantidadesCotizacion(cotizacion, indice, datos, cantidades = CANTIDADES_COMPARADOR) {
  if (!Array.isArray(cotizacion?.items) || !Number.isInteger(indice) || indice < 0 || indice >= cotizacion.items.length)
    throw new Error('Trabajo de cotización inválido.')
  if (!Array.isArray(cantidades) || !cantidades.length || cantidades.length > 12)
    throw new Error('Indica entre 1 y 12 cantidades para comparar.')
  if (!cantidades.every(q => Number.isSafeInteger(q) && q > 0))
    throw new Error('Las cantidades deben ser enteros positivos.')
  const item = cotizacion.items[indice]
  if (escalasInvalidas(item.escalasCantidad || [])) throw new Error('Corrige los descuentos por cantidad antes de comparar.')
  const filas = cantidades.map(cantidad => {
    const escenario = {
      ...cotizacion,
      items: cotizacion.items.map((it, i) => i === indice ? { ...it, cantidad } : it),
    }
    const resultado = calcularCotizacion(escenario, datos)
    const renglon = resultado.renglones[indice]
    const avisos = [
      ...faltantesDeCosto(escenario, datos),
      ...avisosCotizacion(escenario, datos),
    ]
    const costoUnitario = renglon.costo / cantidad
    const precioUnitario = renglon.precio / cantidad
    const utilidad = renglon.precio - renglon.costo
    return {
      cantidad,
      costoTotal: redondear(renglon.costo, 4),
      costoUnitario: redondear(costoUnitario, 4),
      precioUnitario: redondear(precioUnitario, 4),
      precioTotal: redondear(renglon.precio, 4),
      utilidad: redondear(utilidad, 4),
      margenRealPct: renglon.precio > 0 ? redondear(utilidad / renglon.precio * 100, 2) : null,
      materiales: redondear(renglon.materiales, 4),
      merma: redondear(renglon.merma, 4),
      maquinas: redondear(renglon.maquinas, 4),
      manoObra: redondear(renglon.manoObra, 4),
      otrosCostos: redondear(renglon.extras, 4),
      fijos: redondear(renglon.fijos, 4),
      descuentoCantidadPct: renglon.descuentoCantidadPct,
      precioCotizacionCompleta: redondear(resultado.total, 4),
      datosIncompletos: avisos.length > 0,
      avisos,
      porDebajoDeCosto: renglon.precio < renglon.costo - 0.000001,
    }
  })
  return {
    filas,
    tieneCostosPendientes: filas.some(f => f.datosIncompletos),
    hayPerdida: filas.some(f => f.porDebajoDeCosto),
  }
}
