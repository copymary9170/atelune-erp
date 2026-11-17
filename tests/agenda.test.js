import test from 'node:test'
import assert from 'node:assert/strict'
import { analizarAgenda, diasEntre } from '../src/lib/agenda.js'

test('fechas sin desplazamiento UTC, incluidas fechas en fin de mes', () => {
  assert.equal(diasEntre('2026-12-01', '2026-11-30'), 1)
  assert.equal(diasEntre('2026-11-29', '2026-11-30'), -1)
  assert.equal(diasEntre('2026-02-30', '2026-02-28'), null)
  assert.equal(diasEntre('', '2026-11-30'), null)
})

test('agenda prioriza sin incluir entregados ni cancelados en la cola', () => {
  const pedido = (id, fechaEntrega, estado = 'aprobado') => ({ id, numero: id, fechaEntrega, estado, total: 10, abonos: [] })
  const r = analizarAgenda([
    pedido(1, '2026-11-28'), pedido(2, '2026-11-30'), pedido(3, '2026-12-02'),
    pedido(4, null), pedido(5, '2026-11-20', 'entregado'), pedido(6, '2026-11-20', 'cancelado'),
  ], '2026-11-30')
  assert.deepEqual(r.fichas.map(x => x.id), [1, 2, 3, 4])
  assert.equal(r.vencidos.length, 1)
  assert.equal(r.hoy.length, 1)
  assert.equal(r.proximos.length, 1)
  assert.equal(r.sinFecha.length, 1)
})
