import { redondear } from './calc.js'

export function centavosMoneda(valor) {
  let texto = String(valor ?? '').trim()
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(texto)) texto = texto.replaceAll('.', '')
  if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(texto)) texto = texto.replaceAll(',', '')
  if (!/^(?:\d+(?:[.,]\d{1,2})?|[.,]\d{1,2})$/.test(texto)) return null
  const [entero, decimal = ''] = texto.split(/[.,]/)
  const centavos = Number(entero + decimal.padEnd(2, '0'))
  return Number.isSafeInteger(centavos) ? centavos : null
}

export function monedaMetodoPago(metodo) {
  const nombre = String(metodo || '')
  const bolivares = /\b(?:bs|ves|bol[ií]var(?:es)?)\b|\bpago\s*m[oó]vil\b/i.test(nombre)
  const dolares = /\$|\b(?:usd|d[oó]lar(?:es)?)\b/i.test(nombre)
  if (bolivares === dolares) return null
  return bolivares ? 'Bs' : 'USD'
}

export function equivalenteBs(monto, tasa) {
  if (monto == null || monto === '' || !Number.isFinite(Number(monto)) ||
      !Number.isFinite(Number(tasa)) || !(Number(tasa) > 0)) return null
  const bruto = Number(monto) * Number(tasa)
  return Number.isSafeInteger(Math.round(bruto * 100)) ? redondear(bruto) : null
}

export function congelarConversion(monto, tasa, metodo) {
  const montoBs = equivalenteBs(monto, tasa)
  if (montoBs === null && (monedaMetodoPago(metodo) === 'Bs' || (tasa != null && tasa !== '')))
    throw new Error('Indica una tasa válida para convertir el importe a bolívares.')
  return montoBs
}

export function validarFechaOperacion(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
      new Date(fecha + 'T00:00:00Z').toJSON()?.slice(0, 10) !== fecha)
    throw new Error('Indica una fecha de operación válida.')
}

export function detalleTasaOperacion(tasa, fecha, detalle) {
  return tasa > 0 ? {
    unidad: 'USD', bsPorUnidad: Number(tasa), usdPorUnidad: 1, ...detalle,
    fecha: detalle?.fecha || fecha,
    origen: detalle?.origen || (detalle?.fuenteExterna ? 'referencia externa' : 'manual'),
    efectivaBsPorUsd: Number(tasa),
  } : null
}
