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
