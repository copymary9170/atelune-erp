export const URL_BCV = 'https://bcv.today/api/v1/rate.json'
const fechaIso = x => /^\d{4}-\d{2}-\d{2}$/.test(x || '')
const numeroPositivo = x => x !== null && x !== undefined && x !== '' &&
  Number.isFinite(Number(x)) && Number(x) > 0

export function validarReferenciaAutomatica(r, hoy) {
  if (!r || !['bcv_usd','bcv_eur','usdt','calle','menudeo'].includes(r.tipo))
    throw new Error('Tipo de referencia no permitido')
  if (!numeroPositivo(r.bs_por_unidad) || Number(r.bs_por_unidad) > 1e10)
    throw new Error('Valor de referencia inválido')
  if (!fechaIso(r.fecha_valor) || !fechaIso(hoy) || r.fecha_valor > hoy)
    throw new Error('Fecha valor futura o inválida')
  const antiguedad = Math.floor((Date.parse(hoy + 'T12:00:00Z') -
    Date.parse(r.fecha_valor + 'T12:00:00Z')) / 86400000)
  if (!Number.isFinite(antiguedad) || antiguedad < 0 || antiguedad > 7)
    throw new Error('Referencia externa demasiado antigua')
  if (r.tipo === 'bcv_eur' && r.moneda !== 'EUR')
    throw new Error('BCV euro tiene que estar expresada en EUR')
  if (r.tipo === 'bcv_usd' && r.moneda !== 'USD')
    throw new Error('BCV dólar tiene que estar expresada en USD')
  if (r.tipo === 'usdt' && r.moneda !== 'USDT')
    throw new Error('La referencia USDT debe estar en USDT')
  if (r.tipo === 'menudeo' && (!r.entidad ||
    !['compra','venta'].includes(r.sentido)))
    throw new Error('Menudeo sin banco o sin sentido compra/venta verificable')
  if (!/^https:\/\//.test(r.url_fuente || '')) throw new Error('Fuente sin URL HTTPS')
  return Object.freeze({
    tipo:r.tipo,fuente:String(r.fuente),entidad:String(r.entidad || ''),
    sentido:String(r.sentido || ''),moneda:r.moneda,
    bs_por_unidad:Number(r.bs_por_unidad),fecha_valor:r.fecha_valor,
    instante_fuente:r.instante_fuente || null,
    url_fuente:r.url_fuente,confirmado:true,
  })
}

export function interpretarBCV(datos, hoy) {
  if (!datos || typeof datos !== 'object') throw new Error('BCV sin datos')
  const fecha = datos.effective_date || datos.date
  if (!fechaIso(fecha)) throw new Error('BCV sin fecha valor verificable')
  return [
    {tipo:'bcv_usd',moneda:'USD',bs_por_unidad:datos.USD},
    {tipo:'bcv_eur',moneda:'EUR',bs_por_unidad:datos.EUR},
  ].map(x => validarReferenciaAutomatica({...x,fuente:'BCV Today',
    fecha_valor:fecha,url_fuente:URL_BCV},hoy))
}

export function elegirAutomaticas(registros) {
  // No asociar registros sin sentido a menudeo de compra/venta.
  const lista=(registros || []).filter(r => r?.confirmado)
  return lista.reduce((acc,r) => {
    const k=[r.tipo,r.entidad || '',r.sentido || ''].join('|')
    const anterior=acc.get(k)
    if (!anterior || (r.fecha_valor + '|' + (r.registrado_en || '')) >
      (anterior.fecha_valor + '|' + (anterior.registrado_en || ''))) acc.set(k,r)
    return acc
  },new Map())
}


// La API de Referencias VE expone precio en Bs por USDT, pero su fecha valor
// es el momento de publicación (createdAt), no la fecha efectiva BCV.
// El campo fuente debe declarar BINANCE, sin inferir tasa "calle".
export function interpretarUSDTReferenciasVE(datos, hoy) {
  if (!Array.isArray(datos)) throw new Error('Referencias VE devolvió estructura inválida')
  const elegibles = datos.filter(x => x?.type === 'CRYPTO' &&
    x.currency === 'USDT' && x.source === 'BINANCE' &&
    typeof x.createdAt === 'string' && !Number.isNaN(Date.parse(x.createdAt)))
  if (!elegibles.length) return []
  elegibles.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
  const r=elegibles[0], fecha=r.createdAt.slice(0,10)
  if (Date.parse(r.createdAt)>Date.now()+60000)
    throw new Error('Referencia USDT con fecha futura')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha USDT inválida')
  return [validarReferenciaAutomatica({
    tipo:'usdt',moneda:'USDT',bs_por_unidad:r.price,
    fuente:'Referencias VE · BINANCE',fecha_valor:fecha,
    instante_fuente:r.createdAt,
    url_fuente:'https://referenciasve.com/developers',
  },hoy)]
}
