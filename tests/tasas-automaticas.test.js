import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarBCV, interpretarUSDTReferenciasVE, elegirAutomaticas } from '../src/lib/tasas-automaticas.js'
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
test('cron escribe 2 referencias con service key server-side; reintentos ignoran duplicados',async()=>{
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
        USD:250,EUR:280,effective_date:new Date().toISOString().slice(0,10)})}
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
    assert.equal(llamadas[1].opt.headers.Authorization,'Bearer service-ficticio')
    assert.ok(!JSON.stringify(res.body).includes('service-ficticio'))
  }finally{
    globalThis.fetch=original
    for(const [k,v] of Object.entries({CRON_SECRET:save.secret,SUPABASE_SERVICE_ROLE_KEY:save.svc,SUPABASE_URL:save.url}))
      if(v===undefined)delete process.env[k];else process.env[k]=v
  }
})

test('USDT solo acepta referencia BINANCE con timestamp y par validado',()=>{
  const r=interpretarUSDTReferenciasVE([
    {type:'CRYPTO',currency:'USDT',source:'BINANCE',price:'296.725',
      createdAt:'2026-11-21T13:00:00.000Z'},
    {type:'FIAT',currency:'USD',source:'BCV',price:'230',
      createdAt:'2026-11-21T13:00:00.000Z'},
  ],'2026-11-22')
  assert.equal(r.length,1)
  assert.equal(r[0].bs_por_unidad,296.725)
  assert.equal(r[0].moneda,'USDT')
  assert.equal(interpretarUSDTReferenciasVE([],'2026-11-22').length,0)
  assert.throws(()=>interpretarUSDTReferenciasVE([
    {type:'CRYPTO',currency:'USDT',source:'BINANCE',price:0,
      createdAt:'2026-11-21T13:00:00.000Z'},
  ],'2026-11-22'),/Valor/)
})
