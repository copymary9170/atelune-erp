import test from 'node:test'
import assert from 'node:assert/strict'
import { fechaCaracas, interpretarBCV, interpretarUSDTReferenciasVE, interpretarBancosReferenciasVE,
  elegirAutomaticas, seleccionarReferenciaAutomatica } from '../src/lib/tasas-automaticas.js'
import cron from '../api/cron-tasas.js'

const r=()=>({statusCode:null,body:null,headers:{},setHeader(k,v){this.headers[k]=v},
  status(v){this.statusCode=v;return this},json(v){this.body=v;return this}})
test('BCV automático valida EUR/USD, fecha, no importa valores futuros o inválidos',()=>{
  const x=interpretarBCV({USD:240.5,EUR:280.2,effective_date:'2026-11-20'},'2026-11-22')
  assert.equal(x.length,2)
  assert.deepEqual(x.map(x=>x.tipo),['bcv_usd','bcv_eur'])
  assert.ok(x.every(x=>x.fecha_valor==='2026-11-20' && x.confirmado))
  assert.equal(interpretarBCV({USD:240,EUR:281,effective_date:'2026-11-23'},'2026-11-22')[0].fecha_valor,'2026-11-23')
  assert.throws(()=>interpretarBCV({USD:240,EUR:281,effective_date:'2026-12-02'},'2026-11-22'),/vigencia futura/)
  assert.throws(()=>interpretarBCV({USD:240,EUR:0,effective_date:'2026-11-22'},'2026-11-22'),/Valor/)
  assert.throws(()=>interpretarBCV({USD:240,EUR:281,effective_date:'2026-10-01'},'2026-11-22'),/antigua/)
  assert.throws(()=>interpretarBCV({USD:240,EUR:281,date:'2026-11-22'},'2026-11-22'),/fecha valor/)
  assert.throws(()=>interpretarBCV({USD:240,EUR:281,effective_date:'2026-02-30'},'2026-03-01'),/fecha valor/)
  assert.throws(()=>interpretarBCV({USD:true,EUR:281,effective_date:'2026-11-22'},'2026-11-22'),/Valor/)
})
test('historial automático selecciona referencia más reciente por tipo sin cruzar euros y dólares',()=>{
  const a=[{tipo:'bcv_usd',fecha_valor:'2026-11-21',confirmado:true,bs_por_unidad:240},
    {tipo:'bcv_usd',fecha_valor:'2026-11-22',confirmado:true,bs_por_unidad:250},
    {tipo:'bcv_eur',fecha_valor:'2026-11-22',confirmado:true,bs_por_unidad:280},
    {tipo:'bcv_usd',fecha_valor:'2026-11-23',confirmado:false,bs_por_unidad:999}]
  const m=elegirAutomaticas(a)
  assert.equal(m.get('bcv_usd||').bs_por_unidad,250)
  assert.equal(m.get('bcv_eur||').bs_por_unidad,280)
})
test('cron no funciona sin CRON_SECRET y no revela secretos',async()=>{
  const old=process.env.CRON_SECRET
  delete process.env.CRON_SECRET
  try{
    const res=r()
    await cron({method:'GET',headers:{}},res)
    assert.equal(res.statusCode,401)
    const post=r()
    await cron({method:'POST',headers:{}},post)
    assert.equal(post.statusCode,405)
  }finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old}
})
test('cron escribe 2 referencias con service key server-side; reintentos ignoran duplicados',async t=>{
  t.mock.method(Date,'now',()=>Date.parse('2026-11-22T23:00:00Z'))
  const save={secret:process.env.CRON_SECRET,svc:process.env.SUPABASE_SERVICE_ROLE_KEY,
    url:process.env.SUPABASE_URL}
  const original=globalThis.fetch
  try{
    process.env.CRON_SECRET='secret-ficticio'
    process.env.SUPABASE_SERVICE_ROLE_KEY='service-ficticio'
    process.env.SUPABASE_URL='https://ejemplo.supabase.co'
    const llamadas=[]
    globalThis.fetch=async(url,opt)=>{
      llamadas.push({url,opt})
      if(url.includes('bcv.today')) return {ok:true,json:async()=>({
        USD:250,EUR:280,effective_date:'2026-11-22'})}
      if(url.includes('/rest/v1/atelune_tasas_automaticas')) return {ok:true}
      throw Error('URL inesperada')
    }
    const res=r()
    await cron({method:'GET',headers:{authorization:'Bearer secret-ficticio'}},res)
    assert.equal(res.statusCode,200)
    assert.equal(res.body.recibidas,2)
    const guardada=JSON.parse(llamadas[1].opt.body)
    assert.deepEqual(guardada.map(x=>x.tipo),['bcv_usd','bcv_eur'])
    assert.match(llamadas[1].opt.headers.Prefer,/ignore-duplicates/)
    assert.equal(llamadas[1].url,'https://ejemplo.supabase.co/rest/v1/atelune_tasas_automaticas')
    assert.equal(llamadas[1].opt.method,'POST')
    assert.equal(llamadas[1].opt.headers.Authorization,'Bearer service-ficticio')
    assert.ok(!JSON.stringify(res.body).includes('service-ficticio'))
  }finally{
    globalThis.fetch=original
    for(const [k,v] of Object.entries({CRON_SECRET:save.secret,SUPABASE_SERVICE_ROLE_KEY:save.svc,SUPABASE_URL:save.url}))
      if(v===undefined)delete process.env[k];else process.env[k]=v
  }
})

test('USDT solo acepta referencia BINANCE con timestamp y par validado',()=>{
  const ahora=Date.parse('2026-11-22T20:00:00Z')
  const r=interpretarUSDTReferenciasVE([
    {type:'CRYPTO',currency:'USDT',source:'BINANCE',price:'296.725',
      createdAt:'2026-11-21T13:00:00.000Z'},
    {type:'FIAT',currency:'USD',source:'BCV',price:'230',
      createdAt:'2026-11-21T13:00:00.000Z'},
  ],'2026-11-22',ahora)
  assert.equal(r.length,1)
  assert.equal(r[0].bs_por_unidad,296.725)
  assert.equal(r[0].moneda,'USDT')
  assert.equal(interpretarUSDTReferenciasVE([],'2026-11-22').length,0)
  assert.throws(()=>interpretarUSDTReferenciasVE([
    {type:'CRYPTO',currency:'USDT',source:'BINANCE',price:0,
      createdAt:'2026-11-21T13:00:00.000Z'},
  ],'2026-11-22',ahora),/Valor/)
})

test('bancos guardan solo referencia sin asumir compra/venta y no usan tasas caducadas',()=>{
  const t=[
    {type:'BANK',currency:'USD',entityName:'Banco Mercantil',price:'280',
      createdAt:'2026-11-21T13:00:00.000Z'},
    {type:'BANK',currency:'USD',entityName:'Banesco',price:'285',
      createdAt:'2026-11-20T13:00:00.000Z'},
    {type:'BANK',currency:'USD',entityName:'Banco de Venezuela',price:'275',
      createdAt:'2026-11-21T13:00:00.000Z'},
    {type:'BANK',currency:'USD',entityName:'Banplus',price:'295',
      createdAt:'2026-10-20T13:00:00.000Z'},
    {type:'FIAT',currency:'USD',entityName:'Mercantil',price:'999',
      createdAt:'2026-11-22T13:00:00.000Z'},
  ]
  const x=interpretarBancosReferenciasVE(t.map(r=>({...r,source:'EXCHANGE_MONITOR'})),
    '2026-11-22',Date.parse('2026-11-22T20:00:00Z'))
  assert.equal(x.length,3)
  assert.deepEqual(x.map(r=>r.entidad),['Mercantil','Banesco','Banco de Venezuela (BDV)'])
  assert.ok(x.every(r=>r.sentido==='referencia' && r.moneda==='USD'))
  assert.equal(x.find(r=>r.entidad==='Mercantil').bs_por_unidad,280)
  assert.deepEqual(interpretarBancosReferenciasVE(t,'2026-11-22'),[])
})

test('fecha valor y vigencia se calculan en Caracas al seleccionar tasas',()=>{
  const ahora = Date.parse('2026-11-23T02:15:00Z')
  assert.equal(fechaCaracas(new Date(ahora)),'2026-11-22')
  const usdt = interpretarUSDTReferenciasVE([
    {type:'CRYPTO',currency:'USDT',source:'BINANCE',price:'300',createdAt:'2026-11-23T01:00:00Z'},
  ],'2026-11-22',ahora)[0]
  assert.equal(usdt.fecha_valor,'2026-11-22')
  assert.equal(seleccionarReferenciaAutomatica([usdt],'usdt','2026-11-22','2026-11-22'),usdt)
  assert.equal(seleccionarReferenciaAutomatica([usdt],'usdt','2026-11-23','2026-11-23'),null)
  const bcv = interpretarBCV({USD:250,EUR:280,effective_date:'2026-11-23'},'2026-11-22')
  assert.equal(seleccionarReferenciaAutomatica(bcv,'bcv_usd','2026-11-23','2026-11-22'),null)
  assert.equal(seleccionarReferenciaAutomatica(bcv,'bcv_usd','2026-11-22','2026-11-23'),null)
  assert.equal(seleccionarReferenciaAutomatica(bcv,'bcv_usd','2026-12-01','2026-12-01'),null)
  assert.equal(seleccionarReferenciaAutomatica(bcv,'bcv_eur','2026-11-25','2026-11-25'),bcv[1])
})

test('cron aísla fallos de proveedores, restringe destinos y sanea errores de escritura',async t=>{
  t.mock.method(Date,'now',()=>Date.parse('2026-11-22T23:00:00Z'))
  const envars={CRON_SECRET:'secreto-cron',SUPABASE_SERVICE_ROLE_KEY:'secreto-servicio',
    SUPABASE_URL:'https://ejemplo.supabase.co',REFERENCIASVE_API_KEY:'secreto-proveedor'}
  const anteriores=Object.fromEntries(Object.keys(envars).map(k=>[k,process.env[k]]))
  Object.assign(process.env,envars)
  t.after(()=>{
    for(const [k,v] of Object.entries(anteriores)) {
      if(v===undefined) delete process.env[k]
      else process.env[k]=v
    }
  })
  const escrituras=[]
  let rechazarEscritura=false
  let hayUSDT=true
  const fetchFalso=t.mock.method(globalThis,'fetch',async (url,opt)=>{
    assert.equal(opt.redirect,'error')
    if(url.includes('/rates/latest') && hayUSDT) return {ok:true,json:async()=>[
      {type:'CRYPTO',currency:'USDT',source:'BINANCE',price:'300',createdAt:'2026-11-22T21:00:00Z'},
    ]}
    if(url.includes('/rest/v1/')) {
      escrituras.push({url,opt})
      if(rechazarEscritura) throw new Error(envars.SUPABASE_SERVICE_ROLE_KEY)
      return {ok:true}
    }
    return {ok:false,status:503}
  })
  const denegada=r()
  await cron({method:'GET',headers:{authorization:'Bearer incorrecta'}},denegada)
  assert.equal(denegada.statusCode,401)
  assert.equal(fetchFalso.mock.callCount(),0)
  const req={method:'GET',headers:{authorization:'Bearer secreto-cron'}}
  const parcial=r()
  await cron(req,parcial)
  assert.equal(parcial.statusCode,200)
  assert.equal(parcial.body.estado,'parcial')
  assert.deepEqual(JSON.parse(escrituras[0].opt.body).map(x=>x.tipo),['usdt'])
  assert.equal(escrituras[0].url,'https://ejemplo.supabase.co/rest/v1/atelune_tasas_automaticas')
  rechazarEscritura=true
  const error=r()
  await cron(req,error)
  assert.equal(error.statusCode,502)
  assert.doesNotMatch(JSON.stringify(error.body),/secreto-/)
  hayUSDT=false
  const sinDatos=r()
  await cron(req,sinDatos)
  assert.equal(sinDatos.statusCode,502)
  assert.equal(escrituras.length,2)
})
