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
  if (/^(?:bcv\s*)?(?:euro|eur)$/.test(fuente)) return 'bcv_eur'
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
  // Evitar residuos binarios como 240.00000000000003 al congelar la tasa.
  const tasaEfectiva = Number((Number(tasa) / usdUnidad).toFixed(10))
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

/** Guarda la referencia observada aun sin USD/EUR o USD/USDT.
 *  La equivalencia sí es obligatoria al APLICAR una referencia a importes USD. */
export function crearRegistroTasa(f) {
  if (!TIPOS_TASA[f?.tipo]) throw new Error('Tipo de tasa inválido.')
  if (!positivo(f.tasa)) throw new Error('Indica una tasa positiva.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) throw new Error('Fecha inválida.')
  const [anio, mes, dia] = f.fecha.split('-').map(Number)
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia) throw new Error('Fecha de calendario inválida.')
  if (f.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.hora))
    throw new Error('Hora inválida.')
  const necesitaEquivalencia = TIPOS_TASA[f.tipo].unidad !== 'USD'
  const ratio = f.usdPorUnidad == null || f.usdPorUnidad === '' ? null : Number(f.usdPorUnidad)
  if (necesitaEquivalencia && ratio !== null && !positivo(ratio))
    throw new Error('Equivalencia USD por unidad inválida.')
  const entidad = String(f.entidad || '').trim()
  const sentido = f.sentido || ''
  if (f.tipo === 'menudeo' && (!entidad || !['compra', 'venta'].includes(sentido)))
    throw new Error('Menudeo necesita banco y operación de compra o venta.')
  const comisionPct = Number(f.comisionPct || 0)
  if (!Number.isFinite(comisionPct) || comisionPct < 0 || comisionPct > 100)
    throw new Error('Comisión inválida.')
  return {
    fecha: f.fecha, hora: f.hora || '',
    tipo: f.tipo, tasa: Number(f.tasa),
    unidad: TIPOS_TASA[f.tipo].unidad,
    usdPorUnidad: necesitaEquivalencia ? ratio : 1,
    fuente: TIPOS_TASA[f.tipo].nombre,
    entidad, sentido: f.tipo === 'menudeo' ? sentido : '',
    comisionPct,
  }
}
