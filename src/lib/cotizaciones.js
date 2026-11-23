import { avisosCotizacion, calcularCotizacion } from './calc.js'
import { escalasInvalidas } from './escalas-cotizaciones.js'
import { hoy } from './format.js'

export const itemVacio = () => ({
  descripcion: '', lineaId: '', cantidad: 1, materiales: [], maquinas: [],
  minutosDiseno: null, minutosProduccion: null, mermaPct: null, extras: [],
  margenPct: null, descuentoPct: null, escalasCantidad: [],
})

export function itemDesdePlantilla(plantilla, cantidad = 1) {
  const { id: _id, nombre, ...receta } = structuredClone(plantilla)
  return { ...itemVacio(), ...receta, descripcion: receta.descripcion?.trim() || nombre || '', cantidad }
}

export function borradorCotizacion() {
  return {
    fecha: hoy(), estado: 'borrador', cliente: '', contactoCliente: '',
    items: [], envio: null, metodoPagoIdx: 0, aplicarIva: false,
    tasa: null, tipoTasa: 'bcv_usd', tasaDetalle: null, notas: '', calculo: null,
  }
}

export function resumenCalculo(r) {
  return {
    total: r.total, totalBs: r.totalBs, subtotal: r.subtotal, envio: r.envio, comision: r.comision, iva: r.iva,
    costoTotal: r.costoTotal, ganancia: r.ganancia, margenReal: r.margenReal,
    renglones: r.renglones.map(x => ({ precio: x.precio, precioUnitario: x.precioUnitario, descuento: x.descuento,
      descuentoCantidadPct: x.descuentoCantidadPct, umbralCantidad: x.umbralCantidad })),
  }
}

export function calcularCotizacionRapida(plantilla, cantidad, datos) {
  if (!Number.isSafeInteger(cantidad) || cantidad < 1)
    return { avisos: ['Indica una cantidad entera mayor que cero.'] }

  const item = itemDesdePlantilla(plantilla, cantidad)
  const cotizacion = { ...borradorCotizacion(), items: [item] }
  const { config, activos, productos } = datos
  const materiales = item.materiales || []
  const maquinas = item.maquinas || []
  const usaMermaPorDefecto = item.mermaPct == null && materiales.length > 0
  const avisos = avisosCotizacion(cotizacion, datos).filter(aviso => !aviso.startsWith('No hay tasa de cambio') &&
    (usaMermaPorDefecto || !aviso.startsWith('Falta el % de merma')) &&
    !aviso.startsWith('Falta el margen de la línea'))

  if (!item.descripcion.trim()) avisos.push('Ponle un nombre al servicio en Plantillas de trabajo.')
  const linea = (config.lineas || []).find(l => l.id === Number(item.lineaId))
  const margen = item.margenPct === '' ? linea?.margenPct : item.margenPct ?? linea?.margenPct
  if (margen == null || margen === '' || !Number.isFinite(Number(margen)) || margen < 0 || margen >= 100)
    avisos.push('Configura un margen válido para este servicio.')
  const positivo = valor => Number.isFinite(Number(valor)) && Number(valor) > 0
  if (materiales.some(m => !productos.some(p => p.id === Number(m.productoId) && positivo(p.costoPromedio)) || !positivo(m.cantidad)))
    avisos.push('Revisa los materiales y sus cantidades en la plantilla.')
  if (maquinas.some(m => !activos.some(a => a.id === Number(m.activoId) && positivo(a.horasUsoMes)) || !positivo(m.minutos)))
    avisos.push('Revisa los equipos y sus tiempos en la plantilla.')
  if (escalasInvalidas(item.escalasCantidad || [])) avisos.push('Corrige los descuentos por cantidad de la plantilla.')

  if (avisos.length) return { avisos }
  const resultado = calcularCotizacion(cotizacion, datos)
  if (!Number.isFinite(resultado.total) || resultado.total < 0.005 || !(resultado.costoTotal > 0))
    return { avisos: ['Revisa el costo y el precio de este servicio en la plantilla.'] }
  return { cotizacion: { ...cotizacion, calculo: resumenCalculo(resultado) }, avisos: [] }
}
