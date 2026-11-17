import test from 'node:test'
import assert from 'node:assert/strict'
import { reporteCuentasPorCobrar } from '../src/lib/cuentas-cobrar.js'
const base = (id, extra = {}) => ({
  id, numero:id, fecha:'2026-11-01', fechaEntrega:'2026-11-16',
  estado:'en_produccion', total:100, abonos:[], cliente:'Cliente', clienteId:null,
  ...extra,
})
test('agrupa por ficha de cliente y no suma cobros anulados ni pedidos cancelados', () => {
  const r = reporteCuentasPorCobrar([
    base(1, { clienteId: 25, abonos:[{monto:30}] }),
    base(2, { clienteId: 25, estado:'entregado', abonos:[{monto:60},{monto:100,anulado:true}] }),
    base(3, { clienteId: 30, cliente:'Otro' }),
    base(4, { clienteId: 25, estado:'cancelado', total:999 }),
  ],'2026-11-17')
  assert.equal(r.porCliente.length,2)
  const a = r.porCliente.find(x=>x.clave==='id:25')
  assert.equal(a.totalPendiente,110)
  assert.equal(a.entregadoPendiente,40)
  assert.equal(a.fueraDeFechaEntrega,110)
  assert.equal(a.pedidos,2)
  assert.equal(r.porCliente.reduce((s,x)=>s+x.totalPendiente,0),r.resumen.totalPendiente)
})
test('agrupa por nombre si no hay ficha, pero no mezcla pedidos anónimos', () => {
  const r = reporteCuentasPorCobrar([
    base(1, {cliente:'María Pérez'}),
    base(2, {cliente:'  MARÍA   PÉREZ  ', total:50}),
    base(3, {cliente:''}),
    base(4, {cliente:''}),
  ],'2026-11-17')
  assert.equal(r.porCliente.length,3)
  assert.equal(r.porCliente.find(x=>x.nombre==='María Pérez').totalPendiente,150)
  assert.equal(r.porCliente.filter(x=>x.clave.startsWith('pedido:')).length,2)
})
test('excluye importes inválidos de las agrupaciones y no compensa sobrepagos', () => {
  const r = reporteCuentasPorCobrar([
    base(1,{clienteId:1, total: null}),
    base(2,{clienteId:1, total:100, abonos:[{monto:110}]}),
    base(3,{clienteId:1, total:60}),
  ],'2026-11-17')
  assert.equal(r.porCliente[0].totalPendiente,60)
  assert.equal(r.resumen.excesoAbonos,10)
  assert.equal(r.resumen.casosExcluidos,1)
})
