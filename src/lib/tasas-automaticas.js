export const URL_BCV = 'https://bcv.today/api/v1/rate.json'
const fechaIso = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  new Date(x + 'T00:00:00Z').toJSON()?.slice(0,10) === x
const numeroPositivo = x => (typeof x === 'number' ||
  (typeof x === 'string' && /^\d+(?:\.\d+)?$/.test(x.trim()))) &&
  Number.isFinite(Number(x)) && Number(x) > 0
const caracas = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Caracas',
  year:'numeric',month:'2-digit',day:'2-digit'})
export const fechaCaracas = instante => caracas.format(instante)
const diasEntre = (posterior, anterior) => (Date.parse(posterior) - Date.parse(anterior)) / 86400000
const instanteValido = x => typeof x === 'string' &&
  /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(x) &&
  fechaIso(x.slice(0,10)) && Number.isFinite(Date.parse(x))

export function validarReferenciaAutomatica(r, hoy) {
  if (!r || !['bcv_usd','bcv_eur','usdt','calle','menudeo'].includes(r.tipo))
    throw new Error('Tipo de referencia no permitido')
  if (!numeroPositivo(r.bs_por_unidad) || Number(r.bs_por_unidad) > 1e10)
    throw new Error('Valor de referencia inválido')
  if (!fechaIso(r.fecha_valor) || !fechaIso(hoy))
    throw new Error('Fecha valor inválida')
  const deltaDias = diasEntre(hoy,r.fecha_valor)
  const maxFuturo = r.tipo === 'bcv_usd' || r.tipo === 'bcv_eur' ? 5 : 0
  if (!Number.isFinite(deltaDias) || deltaDias < -maxFuturo || deltaDias > 7)
    throw new Error('Referencia con vigencia futura excesiva o demasiado antigua')
  if (r.tipo === 'bcv_eur' && r.moneda !== 'EUR')
    throw new Error('BCV euro tiene que estar expresada en EUR')
  if (r.tipo === 'bcv_usd' && r.moneda !== 'USD')
    throw new Error('BCV dólar tiene que estar expresada en USD')
  if (r.tipo === 'usdt' && r.moneda !== 'USDT')
    throw new Error('La referencia USDT debe estar en USDT')
  if (r.tipo === 'menudeo' && (!r.entidad ||
    !['compra','venta','referencia'].includes(r.sentido)))
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
  const fecha = datos.effective_date
  if (!fechaIso(fecha)) throw new Error('BCV sin fecha valor verificable')
  return [
    {tipo:'bcv_usd',moneda:'USD',bs_por_unidad:datos.USD},
    {tipo:'bcv_eur',moneda:'EUR',bs_por_unidad:datos.EUR},
  ].map(x => validarReferenciaAutomatica({...x,fuente:'BCV Today',
    fecha_valor:fecha,url_fuente:URL_BCV},hoy))
}

export function seleccionarReferenciaAutomatica(registros, tipo, fecha, hoy = fechaCaracas(new Date())) {
  if (!['bcv_usd','bcv_eur','usdt'].includes(tipo) || !fechaIso(fecha)) return null
  const fechaLimite = fecha < hoy ? fecha : hoy
  const intervalo = tipo === 'usdt' ? 0 : 7
  return registros.find(r => {
    if (!r?.confirmado || r.tipo !== tipo) return false
    try {
      validarReferenciaAutomatica(r,fechaLimite)
      const dias = diasEntre(fechaLimite,r.fecha_valor)
      return dias >= 0 && dias <= intervalo
    } catch {
      return false
    }
  }) ?? null
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
export function interpretarUSDTReferenciasVE(datos, hoy, ahora = Date.now()) {
  if (!Array.isArray(datos)) throw new Error('Referencias VE devolvió estructura inválida')
  const elegibles = datos.filter(x => x?.type === 'CRYPTO' &&
    x.currency === 'USDT' && x.source === 'BINANCE' &&
    instanteValido(x.createdAt))
  if (!elegibles.length) return []
  elegibles.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
  const r=elegibles[0], fecha=fechaCaracas(new Date(r.createdAt))
  if (Date.parse(r.createdAt)>ahora+60000)
    throw new Error('Referencia USDT con fecha futura')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha USDT inválida')
  return [validarReferenciaAutomatica({
    tipo:'usdt',moneda:'USDT',bs_por_unidad:r.price,
    fuente:'Referencias VE · BINANCE',fecha_valor:fecha,
    instante_fuente:r.createdAt,
    url_fuente:'https://referenciasve.com/developers',
  },hoy)]
}


// Un precio bancario publicado SIN sentido no es una tasa real de menudeo
// comprada/vendida. Se conserva solo como referencia informativa, sin poder
// aplicarlo como "compra" o "venta" a los pedidos.
export function interpretarBancosReferenciasVE(datos, hoy, ahora = Date.now()) {
  if (!Array.isArray(datos)) throw new Error('Referencias bancarias sin lista')
  const bancos=[
    ['Mercantil',/\bmercantil\b/i],
    ['Banesco',/\bbanesco\b/i],
    ['Banco de Venezuela (BDV)',/banco\s+de\s+venezuela|\bbdv\b/i],
    ['Banplus',/\bbanplus\b/i],
  ]
  const elegidos=[]
  for (const [entidad,patron] of bancos) {
    const disponibles=datos.filter(r => r?.type==='BANK' && r.currency==='USD' && r.source==='EXCHANGE_MONITOR' &&
      patron.test(String(r.entityName||'')) &&
      instanteValido(r.createdAt))
    disponibles.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
    const dato=disponibles[0]
    if (!dato) continue
    if (Date.parse(dato.createdAt)>ahora+60000) continue
    try {
      const r=validarReferenciaAutomatica({
        tipo:'menudeo',fuente:'Referencias VE · EXCHANGE_MONITOR',
        entidad,sentido:'referencia',moneda:'USD',
        bs_por_unidad:dato.price,fecha_valor:fechaCaracas(new Date(dato.createdAt)),
        instante_fuente:dato.createdAt,
        url_fuente:'https://referenciasve.com/developers',
      },hoy)
      // Solo datos recientes; una tasa antigua no se anuncia como vigente.
      const dias=diasEntre(hoy,r.fecha_valor)
      if (dias>=0 && dias<=3) elegidos.push(r)
    } catch {
      // Descartar cifras sin validar, fecha vencida o malformadas.
    }
  }
  return elegidos
}
