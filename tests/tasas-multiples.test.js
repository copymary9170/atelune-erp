import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TIPOS_TASA, tasaEsValida, tipoTasaHistorica, crearDetalleTasa,
  seleccionarTasa, convertirUsdABs, crearRegistroTasa,
} from '../src/lib/tasas-multiples.js'

test('cinco tasas coexisten el mismo día sin mezclarse', () => {
  const fecha = '2026-11-22'
  const datos = [
    { id: 1, fecha, hora:'09:00', tipo:'bcv_usd', tasa: 240 },
    { id: 2, fecha, hora:'09:00', tipo:'bcv_eur', tasa: 280, usdPorUnidad: 1.16 },
    { id: 3, fecha, hora:'09:00', tipo:'usdt', tasa: 280, usdPorUnidad: .997 },
    { id: 4, fecha, hora:'09:00', tipo:'calle', tasa: 300 },
    { id: 5, fecha, hora:'09:00', tipo:'menudeo', tasa: 260, entidad:'Banco', sentido:'compra' },
  ]
  for (const row of datos) {
    assert.equal(seleccionarTasa(datos, row.tipo).id, row.id)
    assert.equal(tipoTasaHistorica(row), row.tipo)
  }
  assert.equal(seleccionarTasa(datos, 'personalizada'), null)
  assert.equal(Object.keys(TIPOS_TASA).length, 6) // cinco referencias + negociación personalizada
})

test('la tasa más reciente por tipo y fecha no selecciona otra fuente ni tasa futura', () => {
  const t = [
    {id:1,fecha:'2026-11-20',hora:'15:00',tipo:'calle',tasa:250},
    {id:2,fecha:'2026-11-22',hora:'10:00',tipo:'calle',tasa:270},
    {id:3,fecha:'2026-11-22',hora:'14:00',tipo:'calle',tasa:290},
    {id:4,fecha:'2026-11-23',hora:'08:00',tipo:'calle',tasa:330},
    {id:5,fecha:'2026-11-22',hora:'16:00',tipo:'bcv_usd',tasa:245},
  ]
  assert.equal(seleccionarTasa(t,'calle','2026-11-22').tasa,290)
  assert.equal(seleccionarTasa(t,'calle','2026-11-21').tasa,250)
  assert.equal(seleccionarTasa(t,'bcv_usd','2026-11-22').tasa,245)
  assert.equal(seleccionarTasa(t,'usdt','2026-11-22'),null)
})

test('BCV EUR exige USD/EUR y calcula Bs/USD efectivo sin fingir que EUR es USD', () => {
  const d = crearDetalleTasa({tipo:'bcv_eur',tasa:276,usdPorUnidad:1.15,fecha:'2026-11-22',referenciaId:9})
  assert.equal(d.unidad,'EUR')
  assert.equal(d.efectivaBsPorUsd,240)
  assert.equal(convertirUsdABs(10,d),2400)
  assert.equal(d.referenciaId,9)
  assert.throws(()=>crearDetalleTasa({tipo:'bcv_eur',tasa:276}),/USD/)
})

test('USDT exige cotización USD por USDT y conserva paridad REAL de la operación', () => {
  const d = crearDetalleTasa({tipo:'usdt',tasa:250,usdPorUnidad:.98,fecha:'2026-11-22'})
  assert.ok(Math.abs(convertirUsdABs(9.8,d)-2500)<1e-8)
  assert.notEqual(d.efectivaBsPorUsd,250)
  assert.throws(()=>crearDetalleTasa({tipo:'usdt',tasa:250,usdPorUnidad:0}),/USD/)
})

test('menudeo exige banco y sentido de la transacción, sin aplicar comisiones dos veces', () => {
  assert.throws(()=>crearDetalleTasa({tipo:'menudeo',tasa:300}),/banco/)
  assert.throws(()=>crearDetalleTasa({tipo:'menudeo',tasa:300,entidad:'Banco',sentido:''}),/compra o venta/)
  const d = crearDetalleTasa({tipo:'menudeo',tasa:300,entidad:'Banco',
    sentido:'venta',comisionPct:1.5})
  assert.equal(d.efectivaBsPorUsd,300)
  assert.equal(d.comisionPct,1.5)
  assert.equal(d.entidad,'Banco')
})

test('tasa personalizada y calle se mantienen independientes, sin límites inventados', () => {
  const a=crearDetalleTasa({tipo:'calle',tasa:350,fecha:'2026-11-22'})
  const b=crearDetalleTasa({tipo:'personalizada',tasa:312,fecha:'2026-11-22'})
  assert.equal(a.efectivaBsPorUsd,350)
  assert.equal(b.efectivaBsPorUsd,312)
  assert.equal(convertirUsdABs(5,b),1560)
  for(const v of [null,'',0,-1,Infinity,NaN]) assert.equal(tasaEsValida(v),false)
})

test('tasas antiguas BCV conservan significado; fuentes ambiguas no se asignan', () => {
  assert.equal(tipoTasaHistorica({fuente:'BCV',fecha:'2025-01-01',tasa:100}),'bcv_usd')
  assert.equal(tipoTasaHistorica({fuente:'Calle'}),'calle')
  assert.equal(tipoTasaHistorica({fuente:'cotización personal'}),null)
  assert.equal(tipoTasaHistorica({fuente:''}),null)
  const datos=[
    {id:1,fecha:'2025-11-22',fuente:'BCV',tasa:200},
    {id:2,fecha:'2025-11-22',fuente:'sin especificar',tasa:500},
  ]
  assert.equal(seleccionarTasa(datos,'bcv_usd').id,1)
  assert.equal(seleccionarTasa(datos,'calle'),null)
})

test('snapshot de una operación no cambia aunque el listado de cotizaciones posteriores sí', () => {
  const original=crearDetalleTasa({tipo:'bcv_usd',tasa:240,fecha:'2026-11-22'})
  const nuevo=crearDetalleTasa({tipo:'bcv_usd',tasa:260,fecha:'2026-11-22'})
  assert.equal(convertirUsdABs(10,original),2400)
  assert.equal(convertirUsdABs(10,nuevo),2600)
  assert.equal(convertirUsdABs(10,original),2400)
})

test('registra cinco referencias el mismo día y permite euro sin equivalencia USD', () => {
  const euro = crearRegistroTasa({fecha:'2026-11-22',tipo:'bcv_eur',tasa:287})
  const usdt = crearRegistroTasa({fecha:'2026-11-22',tipo:'usdt',tasa:291})
  assert.equal(euro.tasa,287)
  assert.equal(euro.usdPorUnidad,null)
  assert.equal(usdt.usdPorUnidad,null)
  assert.throws(()=>crearDetalleTasa(euro),/USD/)
  assert.equal(crearDetalleTasa({...euro,usdPorUnidad:1.15}).efectivaBsPorUsd,
    Number((287/1.15).toFixed(10)))
  assert.equal(crearRegistroTasa({fecha:'2026-11-22',tipo:'bcv_usd',tasa:265}).usdPorUnidad,1)
})

test('rechaza tasas, fechas y entidad bancaria inválidas al crear referencias', () => {
  assert.throws(()=>crearRegistroTasa({fecha:'2026-02-30',tipo:'bcv_usd',tasa:250}),/Fecha/)
  assert.throws(()=>crearRegistroTasa({fecha:'2026-11-22',tipo:'usdt',tasa:-1}),/positiva/)
  assert.throws(()=>crearRegistroTasa({fecha:'2026-11-22',tipo:'menudeo',tasa:260}),/Menudeo/)
  assert.throws(()=>crearRegistroTasa({fecha:'2026-11-22',tipo:'usdt',tasa:250,usdPorUnidad:0}),/Equivalencia/)
})
