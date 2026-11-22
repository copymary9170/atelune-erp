import test from 'node:test'
import assert from 'node:assert/strict'
import { crearFilaLote, prepararLoteTasas, analizarRespuestaBCV, analizarRespuestaBancos, TIPOS_LOTE, BANCOS_VENEZUELA, BANCOS_MENUDEO_PRINCIPALES, filasLoteIniciales } from '../src/lib/tasas-lote.js'

test('lote de cinco tasas guarda todas las referencias distintas sin reemplazar días anteriores', () => {
  const filas = TIPOS_LOTE.map(crearFilaLote)
  filas[0].tasa = 230
  filas[1].tasa = 270
  filas[2].tasa = 300
  filas[3].tasa = 340
  filas[4].tasa = 260
  const r = prepararLoteTasas(filas,'2026-11-22','13:15')
  assert.equal(r.length,5)
  assert.deepEqual(r.map(x=>x.tipo),TIPOS_LOTE)
  assert.ok(r.every(x=>x.fecha === '2026-11-22' && x.hora === '13:15'))
  assert.equal(r[4].entidad, BANCOS_VENEZUELA[0].nombre)
})
test('lote permite varias tasas de bancos separados y compra vs venta', () => {
  const a={...crearFilaLote('menudeo'),tasa:230,entidad:'Banesco',sentido:'compra'}
  const b={...a,sentido:'venta',tasa:235}
  const c={...a,entidad:'Mercantil',tasa:240}
  assert.equal(prepararLoteTasas([a,b,c],'2026-11-22').length,3)
})
test('lote valida antes de escribir, no inventa tasas ni oculta duplicados', () => {
  const vacio=crearFilaLote('bcv_usd')
  const válido={...vacio,tasa:250}
  assert.equal(prepararLoteTasas([vacio,válido],'2026-11-22').length,1)
  assert.throws(()=>prepararLoteTasas([vacio],'2026-11-22'),/al menos/)
  assert.throws(()=>prepararLoteTasas([válido,{...válido}],'2026-11-22'),/repite/)
  assert.throws(()=>prepararLoteTasas([válido,{...crearFilaLote('bcv_eur'),tasa:-1}],'2026-11-22'),/positiva/)
  assert.throws(()=>prepararLoteTasas([válido],'2026-02-31'),/Fecha/)
})
test('respuesta BCV valida fecha y evita usar tasa con vigencia futura', () => {
  const x=analizarRespuestaBCV({USD:240.111,EUR:272.222,effective_date:'2026-11-20'},'2026-11-22')
  assert.equal(x.usd,240.111)
  assert.equal(x.eur,272.222)
  assert.equal(x.fecha,'2026-11-20')
  assert.throws(()=>analizarRespuestaBCV({USD:240,EUR:275,effective_date:'2026-11-23'},'2026-11-22'),/posterior/)
  assert.throws(()=>analizarRespuestaBCV({USD:'n/a',EUR:275,effective_date:'2026-11-20'},'2026-11-22'),/válidas/)
})
test('bancos solo ofrece referencias recientes sin inferir compra ni venta', () => {
  const input=[
    {type:'BANK',currency:'USD',entityName:'Mercantil',price:'249.8',createdAt:'2026-11-21T12:00:00Z'},
    {type:'BANK',currency:'USD',entityName:'Otro banco',price:'245',createdAt:'2026-10-15T12:00:00Z'},
    {type:'FIAT',currency:'USD',entityName:'BCV',price:'240',createdAt:'2026-11-22T12:00:00Z'},
    {type:'BANK',currency:'USD',entityName:'Futuro',price:'255',createdAt:'2026-11-23T12:00:00Z'},
  ]
  const r=analizarRespuestaBancos(input,'2026-11-22')
  assert.equal(r.length,1)
  assert.equal(r[0].entidad,'Mercantil')
  assert.equal(r[0].sentidoConocido,false)
})

test('menudeo presenta tres bancos habituales; Banplus está disponible pero es opcional', () => {
  assert.deepEqual(BANCOS_MENUDEO_PRINCIPALES,
    ['Mercantil', 'Banesco', 'Banco de Venezuela (BDV)'])
  const iniciales = filasLoteIniciales()
  assert.equal(iniciales.length, 7)
  assert.deepEqual(iniciales.filter(f => f.tipo === 'menudeo').map(f => f.entidad),
    BANCOS_MENUDEO_PRINCIPALES)
  assert.ok(BANCOS_VENEZUELA.some(b => b.nombre === 'Banplus'))
  assert.ok(!iniciales.some(f => f.entidad === 'Banplus'))
  const lote = iniciales.filter(f => f.tipo === 'menudeo').map((f, i) =>
    ({ ...f, tasa: 250 + i }))
  assert.equal(prepararLoteTasas(lote, '2026-11-22').length, 3)
})
