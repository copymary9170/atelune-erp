// Todas las tasas se expresan en bolívares por UNA unidad de la referencia.
// El ERP sigue valorando costos, deudas e ingresos en USD. Para EUR y USDT,
// se exige además el equivalente USD por unidad; no asumir paridad ni mezclar divisas.
export const TIPOS_TASA = Object.freeze({
  bcv_usd: { nombre: 'BCV dólar', unidad: 'USD' },
  bcv_eur: { nombre: 'BCV euro', unidad: 'EUR' },
  usdt: { nombre: 'USDT', unidad: 'USDT' },
  calle: { nombre: 'Calle / paralelo', unidad: 'USD' },
  menudeo: { nombre: 'Menudeo bancario', unidad: 'USD' },
  personalizada: { nombre: 'Personalizada', unidad: 'USD' },
})

const positivo = v => v !== null && v !== undefined && v !== '' &&
  Number.isFinite(Number(v)) && Number(v) > 0
export const tasaEsValida = positivo

export function tipoTasaHistorica(registro) {
  if (TIPOS_TASA[registro?.tipo]) return registro.tipo
  const fuente = String(registro?.fuente || '').trim().toLowerCase()
  if (/^bcv(?: dólar| dolar| usd)?$/.test(fuente)) return 'bcv_usd'
  if (/^(?:bcv )?euro|eur$/.test(fuente)) return 'bcv_eur'
  if (fuente === 'usdt') return 'usdt'
  if (/calle|paralelo/.test(fuente)) return 'calle'
  if (/menudeo/.test(fuente)) return 'menudeo'
  return null // Una fuente antigua ambigua no se selecciona automáticamente.
}

export function seleccionarTasa(tasas = [], tipo = 'bcv_usd', fechaMax = '9999-12-31') {
  if (!TIPOS_TASA[tipo]) return null
  const elegibles = tasas.filter(r => tipoTasaHistorica(r) === tipo &&
    typeof r.fecha === 'string' && r.fecha <= fechaMax && positivo(r.tasa))
  elegibles.sort((a, b) => b.fecha.localeCompare(a.fecha) ||
    String(b.hora || '').localeCompare(String(a.hora || '')) ||
    (Number(b.id) || 0) - (Number(a.id) || 0))
  return elegibles[0] ?? null
}

export function crearDetalleTasa({ tipo, tasa, usdPorUnidad, fecha, hora, entidad = '',
  sentido = '', comisionPct = 0, referenciaId = null }) {
  if (!TIPOS_TASA[tipo]) throw new Error('Selecciona un tipo de tasa válido.')
  if (!positivo(tasa)) throw new Error('La tasa debe ser mayor que cero.')
  const unidad = TIPOS_TASA[tipo].unidad
  const requiereEquivalencia = unidad !== 'USD'
  if (requiereEquivalencia && !positivo(usdPorUnidad))
    throw new Error('Para EUR o USDT indica cuánto USD equivale a una unidad de esa moneda.')
  const usdUnidad = requiereEquivalencia ? Number(usdPorUnidad) : 1
  const tasaEfectiva = Number(tasa) / usdUnidad
  if (!Number.isFinite(tasaEfectiva) || tasaEfectiva <= 0)
    throw new Error('La conversión a Bs/USD no es válida.')
  const pct = Number(comisionPct || 0)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Comisión inválida.')
  if (tipo === 'menudeo' && !String(entidad).trim())
    throw new Error('Indica el banco o entidad del menudeo.')
  if (tipo === 'menudeo' && !['compra', 'venta'].includes(sentido))
    throw new Error('Indica si la cotización bancaria es de compra o venta de divisas.')
  return {
    tipo, unidad, bsPorUnidad: Number(tasa), usdPorUnidad: usdUnidad,
    efectivaBsPorUsd: tasaEfectiva,
    fecha: fecha || null, hora: hora || null, entidad: String(entidad).trim(),
    sentido: tipo === 'menudeo' ? sentido : '',
    comisionPct: pct,
    referenciaId,
  }
}

export function convertirUsdABs(usd, detalle) {
  if (!detalle || !Number.isFinite(Number(usd))) return null
  return Number(usd) * detalle.efectivaBsPorUsd
}
