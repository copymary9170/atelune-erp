import { timingSafeEqual } from 'node:crypto'
import {
  fechaCaracas, interpretarBCV, interpretarUSDTReferenciasVE, interpretarBancosReferenciasVE, URL_BCV,
} from '../src/lib/tasas-automaticas.js'

const fail = (res, code, error) => res.status(code).json({ error })

function cronAutorizado(header, secreto) {
  if (!secreto || typeof header !== 'string') return false
  const recibido = Buffer.from(header)
  const esperado = Buffer.from('Bearer ' + secreto)
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado)
}

async function consultarFuente({ nombre, url, interpretar, clave, hoy, ahora }) {
  try {
    const headers = { Accept: 'application/json' }
    if (clave) headers['x-api-key'] = clave
    const respuesta = await fetch(url, {
      headers, redirect: 'error', signal: AbortSignal.timeout(8000),
    })
    if (!respuesta.ok) return { nombre, estado: 'error_http', codigo: respuesta.status, registros: [] }
    const registros = interpretar(await respuesta.json(), hoy, ahora)
    return { nombre, estado: registros.length ? 'ok' : 'sin_datos_validos', registros }
  } catch {
    return { nombre, estado: 'error_de_consulta_o_validacion', registros: [] }
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return fail(res, 405, 'Método no permitido')
  }
  if (!cronAutorizado(req.headers?.authorization, process.env.CRON_SECRET))
    return fail(res, 401, 'Cron no autorizado')

  let endpoint
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY
  try {
    const url = new URL(process.env.SUPABASE_URL)
    if (!servicio || url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) throw new Error()
    endpoint = new URL('/rest/v1/atelune_tasas_automaticas', url).href
  } catch {
    return fail(res, 503, 'Configuración de Supabase incompleta o inválida')
  }

  const ahora = Date.now()
  const hoy = fechaCaracas(new Date(ahora))
  const clave = process.env.REFERENCIASVE_API_KEY
  const fuentes = [
    { nombre: 'bcv', url: URL_BCV, interpretar: interpretarBCV },
    { nombre: 'usdt', url: 'https://api.referenciasve.com/rates/latest?currency=USDT&source=BINANCE',
      interpretar: interpretarUSDTReferenciasVE, requiereClave: true },
    { nombre: 'bancos', url: 'https://api.referenciasve.com/rates/banks?currency=USD',
      interpretar: interpretarBancosReferenciasVE, requiereClave: true },
  ]
  const resultados = await Promise.all(fuentes.map(fuente => fuente.requiereClave && !clave
    ? { nombre: fuente.nombre, estado: 'sin_clave', registros: [] }
    : consultarFuente({ ...fuente, hoy, ahora, clave: fuente.requiereClave ? clave : undefined })))
  const registros = resultados.flatMap(r => r.registros)
  const estados = resultados.map(({ nombre, estado, codigo }) => ({ nombre, estado, codigo }))
  if (!registros.length) return res.status(502).json({ error: 'Sin referencias válidas', fuentes: estados })

  try {
    const guardar = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: {
        apikey: servicio, Authorization: 'Bearer ' + servicio,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(registros),
    })
    if (!guardar.ok) return fail(res, 502, 'Supabase rechazó la inserción de referencias')
  } catch {
    return fail(res, 502, 'No se pudo confirmar la inserción de referencias')
  }
  return res.status(200).json({
    estado: estados.some(r => r.estado !== 'ok' && r.estado !== 'sin_clave') ? 'parcial' : 'ok',
    recibidas: registros.length, tipos: [...new Set(registros.map(x => x.tipo))], fuentes: estados,
  })
}
