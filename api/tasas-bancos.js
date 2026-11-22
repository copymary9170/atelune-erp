// Consulta opt-in de un proveedor de referencias bancarias.
// Requiere API key contratada y sesión Supabase REAL; no expone claves al navegador.
function envPublica(regex) {
  const name = Object.keys(process.env).find(k => regex.test(k) && process.env[k])
  return name ? process.env[name] : ''
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })
  const key = process.env.REFERENCIASVE_API_KEY
  if (!key) return res.status(503).json({
    error: 'La consulta de bancos requiere una clave de API autorizada. Puedes ingresar tasas manualmente y verificar cada banco en su página oficial.',
    configurada: false,
  })
  const url = envPublica(/(?:^|_)SUPABASE_URL$/)
  const anon = envPublica(/(?:^|_)SUPABASE_(?:ANON_KEY|PUBLISHABLE_KEY)$/)
  if (!url || !anon) return res.status(503).json({ error: 'No se configuró autenticación Supabase para este servicio.' })
  const bearer = req.headers.authorization
  if (typeof bearer !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(bearer))
    return res.status(401).json({ error: 'Inicia sesión en Atelune para consultar referencias de bancos.' })

  // Verifica el JWT contra Supabase Auth. Nunca aceptar un UID enviado por el cliente.
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 9000)
  try {
    const auth = await fetch(url.replace(/\/+$/, '') + '/auth/v1/user', {
      headers: { Authorization: bearer, apikey: anon },
      signal: ctrl.signal,
    })
    if (!auth.ok) return res.status(401).json({ error: 'Sesión no válida; inicia sesión nuevamente.' })
    const user = await auth.json()
    if (!user?.id) return res.status(401).json({ error: 'No se pudo autenticar el usuario.' })
    const remote = await fetch('https://api.referenciasve.com/rates/banks?currency=USD', {
      headers: { 'x-api-key': key, Accept: 'application/json' },
      signal: ctrl.signal,
    })
    if (!remote.ok) throw new Error('El proveedor bancario no respondió correctamente (' + remote.status + ').')
    const payload = await remote.json()
    if (!Array.isArray(payload)) throw new Error('Formato bancario no compatible.')
    return res.status(200).json({ fuente: 'Referencias VE', datos: payload
      .filter(x => x && x.type === 'BANK' && x.currency === 'USD')
      .slice(0, 80).map(x => ({ type: 'BANK', currency: 'USD',
        entityName: String(x.entityName || '').slice(0, 90),
        price: String(x.price ?? ''), createdAt: String(x.createdAt || ''),
      })) })
  } catch (e) {
    return res.status(502).json({ error: e?.message || 'No se pudo obtener el listado bancario.' })
  } finally {
    clearTimeout(timeout)
  }
}
