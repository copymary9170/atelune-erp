import test from 'node:test'
import assert from 'node:assert/strict'
import { reporteCuentasPorCobrar } from '../src/lib/cuentas-cobrar.js'

const base = (id, extras = {}) => ({
  id, numero: id, cliente: 'Cliente ' + id, fecha: '2026-11-01',
  fechaEntrega: '2026-11-16', estado: 'en_produccion', total: 100,
  abonos: [{ fecha: '2026-11-05', monto: 40, metodo: 'Pago móvil' }],
  ...extras,
})

test('saldos vigentes: separa vencidos, futuros y sin fecha sin contar pagos anulados', () => {
  const p = [
    base(1, { abonos: [{monto: 25}, {monto: 100, anulado: true}] }),
    base(2, { fechaEntrega: '2026-11-20', abonos: [{monto: 20}] }),
    base(3, { fechaEntrega: '', abonos: [] }),
    base(4, { estado: 'cancelado', total: 5000, abonos: [] }),
  ]
  const { resumen, filas } = reporteCuentasPorCobrar(p, '2026-11-17')
  assert.equal(resumen.totalPendiente, 75 + 80 + 100)
  assert.equal(resumen.vencido, 75)
  assert.equal(resumen.porVencer, 80)
  assert.equal(resumen.sinFecha, 100)
  assert.equal(resumen.cantidadPendiente, 3)
  assert.deepEqual(filas.map(x=>x.id), [1,2,3])
})

test('entregado pero aún no cobrado se cuenta separado, el vencimiento de hoy no está atrasado', () => {
  const { resumen, filas } = reporteCuentasPorCobrar([
    base(1, { estado:'entregado', fechaEntrega:'2026-11-17', abonos:[] }),
    base(2, { estado:'aprobado', fechaEntrega:'2026-11-15', abonos:[] }),
  ], '2026-11-17')
  assert.equal(resumen.porCobrarEntregado, 100)
  assert.equal(resumen.vencido, 100)
  assert.equal(filas[0].numero, 2)
  assert.equal(filas[1].clasificacion, 'por_vencer')
})

test('abonos superiores al total se advierten sin compensar a otros clientes', () => {
  const { resumen, filas } = reporteCuentasPorCobrar([
    base(1, { abonos: [{monto: 120}] }), base(2, { abonos: [] }),
  ], '2026-11-17')
  assert.equal(resumen.excesoAbonos,20)
  assert.equal(resumen.totalPendiente,100)
  assert.equal(filas.length,1)
})

test('un total inválido o abono dudoso no se convierte en deuda cero', () => {
  const { resumen, avisos } = reporteCuentasPorCobrar([
    base(1, { total: null }), base(2, { abonos: [{ monto: -10 }] }),
    base(3, { total: undefined }), base(4, { abonos: [{ monto: null }] }),
  ], '2026-11-17')
  assert.equal(resumen.casosExcluidos,4)
  assert.equal(resumen.totalPendiente,0)
  assert.equal(avisos.length,4)
})

test('rechaza fechas inválidas y no altera pedidos originales', () => {
  const data = [base(1)]
  const before = JSON.stringify(data)
  assert.throws(()=>reporteCuentasPorCobrar(data,'2026-02-30'),/Fecha/)
  const r = reporteCuentasPorCobrar(data, '2026-11-17')
  assert.equal(r.resumen.totalPendiente,60)
  assert.equal(JSON.stringify(data),before)
})

test('clasifica abonos con cero como válidos y excluye pedidos pagados', () => {
  const { filas, resumen } = reporteCuentasPorCobrar([
    base(1,{ abonos: [{monto:100}] }),
    base(2,{ abonos: [{monto:0}] }),
  ],'2026-11-17')
  assert.equal(filas.length,1)
  assert.equal(filas[0].id,2)
  assert.equal(resumen.totalPendiente,100)
})
