import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/tasas-bancos.js'

function resFicticia() {
  return {
    codigo:null, cuerpo:null, headers:{},
    setHeader(k,v){this.headers[k]=v;return this},
    status(code){this.codigo=code;return this},
    json(body){this.cuerpo=body;return this},
  }
}
const original={
  key: process.env.REFERENCIASVE_API_KEY,
  url: process.env.SUPABASE_URL,
  anon: process.env.SUPABASE_ANON_KEY,
}
const restaurar=()=>{
  for(const [key,value] of Object.entries({
    REFERENCIASVE_API_KEY:original.key,
    SUPABASE_URL:original.url,
    SUPABASE_ANON_KEY:original.anon,
  })){if(value==null)delete process.env[key];else process.env[key]=value}
}
test('endpoint bancario sin licencia devuelve 503, no inventa cotizaciones',async()=>{
  const prev=process.env.REFERENCIASVE_API_KEY
  delete process.env.REFERENCIASVE_API_KEY
  try{
    const res=resFicticia()
    await handler({method:'GET',headers:{}},res)
    assert.equal(res.codigo,503)
    assert.equal(res.cuerpo.configurada,false)
    assert.match(res.cuerpo.error,/clave/)
  }finally{if(prev===undefined)delete process.env.REFERENCIASVE_API_KEY;else process.env.REFERENCIASVE_API_KEY=prev}
})
test('con API privada exige autenticación y no revela la clave',async()=>{
  const prev=process.env.REFERENCIASVE_API_KEY
  process.env.REFERENCIASVE_API_KEY='clave-ficticia-no-real'
  try{
    const res=resFicticia()
    await handler({method:'GET',headers:{}},res)
    assert.ok([401,503].includes(res.codigo))
    assert.ok(!JSON.stringify(res.cuerpo).includes('clave-ficticia-no-real'))
    const fallo=resFicticia()
    await handler({method:'POST',headers:{}},fallo)
    assert.equal(fallo.codigo,405)
  }finally{if(prev===undefined)delete process.env.REFERENCIASVE_API_KEY;else process.env.REFERENCIASVE_API_KEY=prev}
})
test('auth de Supabase y respuesta bancaria filtrada sin exponer credenciales',async()=>{
  const fetchOriginal=globalThis.fetch
  try{
    process.env.REFERENCIASVE_API_KEY='clave-ficticia-no-real'
    process.env.SUPABASE_URL='https://ejemplo.supabase.co'
    process.env.SUPABASE_ANON_KEY='anon-ficticio'
    const llamadas=[]
    globalThis.fetch=async (url,opts)=>{
      llamadas.push({url,opts})
      if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'uid-ficticio'})}
      if(url.includes('referenciasve.com'))return{ok:true,json:async()=>[
        {type:'BANK',currency:'USD',source:'EXCHANGE_MONITOR',entityName:'Mercantil',price:'270.5',createdAt:'2026-11-22T13:00:00Z',extra:'dato_no_necesario'},
        {type:'BANK',currency:'USD',source:'OTRA',entityName:'Banesco',price:'999'},
        {type:'FIAT',currency:'USD',entityName:'BCV',price:'250',createdAt:'2026-11-22T13:00:00Z'},
      ]}
      throw Error('No esperado: '+url)
    }
    const res=resFicticia()
    await handler({method:'GET',headers:{authorization:'Bearer token.ficticio.valido'}},res)
    assert.equal(res.codigo,200)
    assert.equal(res.cuerpo.datos.length,1)
    assert.equal(res.cuerpo.datos[0].entityName,'Mercantil')
    assert.equal(res.cuerpo.datos[0].extra,undefined)
    assert.equal(llamadas.length,2)
    assert.ok(llamadas.every(({opts})=>opts.redirect==='error'))
    assert.equal(llamadas[1].opts.headers['x-api-key'],'clave-ficticia-no-real')
    assert.ok(!JSON.stringify(res.cuerpo).includes('clave-ficticia-no-real'))
  }finally{globalThis.fetch=fetchOriginal;restaurar()}
})
