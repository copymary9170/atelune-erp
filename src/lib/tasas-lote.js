import { crearRegistroTasa } from './tasas-multiples.js'

export const BANCOS_VENEZUELA = Object.freeze([
  { nombre: 'Banco de Venezuela (BDV)', url: 'https://www.bancodevenezuela.com/operaciones-cambiarias/' },
  { nombre: 'Mercantil', url: 'https://www.mercantilbanco.com/personas/servicios-digitales/otros/operaciones-compra-venta-divisas' },
  { nombre: 'Banesco', url: 'https://www.banesco.com/informacion-de-interes/sistema-mercado-cambiario/' },
  { nombre: 'Banplus', url: 'https://www.banplus.com/servicios-personas/' },
  { nombre: 'BNC', url: 'https://www.bncenlinea.com/productos-y-servicios/servicios' },
])

export const BANCOS_MENUDEO_PRINCIPALES = Object.freeze(['Mercantil', 'Banesco', 'Banco de Venezuela (BDV)'])

export const TIPOS_LOTE = Object.freeze(['bcv_usd', 'bcv_eur', 'usdt', 'calle', 'menudeo'])
export const filasLoteIniciales = () => [
  ...TIPOS_LOTE.filter(tipo => tipo !== 'menudeo').map(crearFilaLote),
  ...BANCOS_MENUDEO_PRINCIPALES.map(entidad => ({ ...crearFilaLote('menudeo'), entidad })),
]
export const crearFilaLote = tipo => ({
  tipo, tasa: null, usdPorUnidad: null, entidad: tipo === 'menudeo' ? BANCOS_VENEZUELA[0].nombre : '',
  sentido: 'compra', comisionPct: 0, origen: 'manual', enlace: '',
})

/**
 * Validación completa ANTES de abrir una transacción RW sobre la tabla tasas.
 * Las referencias faltantes no se guardan con tasa cero. No se altera lo histórico.
 * El historial añade filas; las dos direcciones de cada banco son independientes.
 */
export function prepararLoteTasas(filas, fecha, hora = '') {
  if (!Array.isArray(filas) || filas.length < 1 || filas.length > 40)
    throw new Error('Introduce entre 1 y 40 referencias.')
  const registros = []
  const claves = new Set()
  for (const fila of filas) {
    if (fila.tasa === null || fila.tasa === '' || fila.tasa === undefined) continue
    const registro = crearRegistroTasa({ ...fila, fecha, hora })
    const key = [registro.tipo, registro.entidad.toLowerCase(), registro.sentido].join('|')
    if (claves.has(key)) throw new Error('El lote repite ' + registro.tipo + ' ' + registro.entidad + ' ' + registro.sentido + '.')
    claves.add(key)
    registros.push({ ...registro, origen: fila.origen || 'manual', enlace: fila.enlace || '' })
  }
  if (!registros.length) throw new Error('Introduce al menos una tasa válida antes de guardar.')
  return registros
}

/**
 * La API BCV Today es una fuente tercera que reproduce referencias BCV.
 * Los valores deben ser revisados antes de confirmarlos como tasas históricas.
 * Verifica fecha, formato e importes; nunca usa tarifas de un día futuro.
 */
export function analizarRespuestaBCV(data, fechaCorte) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Respuesta BCV inválida.')
  const fecha = data.effective_date || data.date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || fecha > fechaCorte)
    throw new Error('La tasa BCV corresponde a una fecha posterior o no identificada.')
  const usd = Number(data.USD), eur = Number(data.EUR)
  if (!(usd > 0 && eur > 0 && Number.isFinite(usd) && Number.isFinite(eur)))
    throw new Error('La fuente BCV no devolvió tasas válidas para USD y EUR.')
  return { fecha, usd, eur, fuente: 'bcv.today (referencia secundaria; comprobar con BCV)', enlace: 'https://bcv.today/api/v1/rate.json' }
}

export function analizarRespuestaBancos(data, fechaCorte, maxDias = 3) {
  if (!Array.isArray(data)) throw new Error('La fuente no devolvió una lista de bancos.')
  return data.flatMap(r => {
    if (!r || r.type !== 'BANK' || r.currency !== 'USD') return []
    const tasa = Number(r.price)
    const fecha = typeof r.createdAt === 'string' ? r.createdAt.slice(0, 10) : ''
    if (!(tasa > 0 && Number.isFinite(tasa) && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= fechaCorte)) return []
    const dias = (Date.parse(fechaCorte + 'T12:00:00Z') - Date.parse(fecha + 'T12:00:00Z')) / 86400000
    if (!Number.isFinite(dias) || dias < 0 || dias > maxDias) return []
    const entidad = String(r.entityName || '').trim().slice(0, 90)
    if (!entidad) return []
    // La API no especifica en este endpoint si es precio de compra o venta.
    // No se transforma directamente en tasa de MEN UDEO: solo sugerencia.
    return [{ entidad, tasa, fecha, origen: 'Referencias VE (agregador de bancos)',
      enlace: 'https://referenciasve.com/', sentidoConocido: false }]
  })
}
