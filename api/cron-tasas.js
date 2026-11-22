import { interpretarBCV, URL_BCV } from '../src/lib/tasas-automaticas.js'

// Vercel Cron: solo servidor, solo con CRON_SECRET, sin sesión del navegador.
// La tabla compartida es append-only y los datos personales no se actualizan.
const nombreEnv = re => {
  const key = Object.keys(process.env).find(x => re.test(x) && process.env[x])
  return key ? process.env[key] : ''
}
const fail = (res,code,error) => res.status(code).json({error})

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')
  if (req.method !== 'GET') return fail(res,405,'Método no permitido')
  const secreto=process.env.CRON_SECRET
  if (!secreto || req.headers.authorization !== 'Bearer ' + secreto)
    return fail(res,401,'Cron no autorizado')
  const supaUrl=nombreEnv(/(?:^|_)SUPABASE_URL$/)
  const servicio=process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supaUrl || !servicio)
    return fail(res,503,'Falta configurar Supabase Service Role o URL. No se ha guardado nada.')
  const ctrl=new AbortController()
  const reloj=setTimeout(()=>ctrl.abort(),9000)
  try {
    const respuesta=await fetch(URL_BCV,{signal:ctrl.signal,headers:{Accept:'application/json'}})
    if (!respuesta.ok) throw new Error('BCV Today HTTP ' + respuesta.status)
    const hoy=new Date().toISOString().slice(0,10)
    const registros=interpretarBCV(await respuesta.json(),hoy)
    const endpoint=supaUrl.replace(/\/+$/,'')+'/rest/v1/atelune_tasas_automaticas'
    const guardar=await fetch(endpoint,{
      method:'POST',signal:ctrl.signal,
      headers:{
        apikey:servicio,Authorization:'Bearer '+servicio,
        'Content-Type':'application/json',
        Prefer:'resolution=ignore-duplicates,return=minimal',
      },
      body:JSON.stringify(registros),
    })
    if (!guardar.ok) {
      const detalle=(await guardar.text()).slice(0,200)
      throw new Error('No se guardaron referencias: '+guardar.status+' '+detalle)
    }
    return res.status(200).json({
      estado:'ok',recibidas:registros.length,tipos:registros.map(x=>x.tipo),
      fecha_valor:registros[0].fecha_valor,
      mensaje:'Referencias verificadas e insertadas sin modificar valores anteriores; duplicados ignorados.',
    })
  } catch(e) {
    return fail(res,502,String(e?.message || 'Error de proveedor').slice(0,230))
  } finally {clearTimeout(reloj)}
}
