// Vercel serverless; opt-in feed de referencia, sin acceder a cuentas bancarias.
// La clave NUNCA se entrega al navegador; configurar REFERENCIASVE_API_KEY en Vercel.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })
  const key = process.env.REFERENCIASVE_API_KEY
  if (!key) return res.status(503).json({
    error: 'La integración con agregadores bancarios requiere una clave de API autorizada.',
    configurada: false,
  })
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 8500)
  try {
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
