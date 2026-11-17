import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarMovimiento, totalAbonos, saldoPedido } from '../src/lib/calc.js'

test('las salidas y mermas rechazan stock insuficiente', () => {
  assert.throws(() => aplicarMovimiento({ stock: 2, costoPromedio: 1 }, { tipo: 'salida', cantidad: 3 }), /Stock insuficiente/)
  assert.throws(() => aplicarMovimiento({ stock: 2, costoPromedio: 1 }, { tipo: 'merma', cantidad: 2.1 }), /Stock insuficiente/)
  assert.equal(aplicarMovimiento({ stock: 2, costoPromedio: 1 }, { tipo: 'salida', cantidad: 2 }).stock, 0)
})
test('las entradas no aceptan costo unitario sin definir o negativo', () => {
  assert.throws(() => aplicarMovimiento({ stock: 0, costoPromedio: 0 }, { tipo: 'entrada', cantidad: 1, costoUnitario: -1 }), /Costo unitario inválido/)
  assert.throws(() => aplicarMovimiento({ stock: 0, costoPromedio: 0 }, { tipo: 'entrada', cantidad: 1 }), /Costo unitario inválido/)
})
test('los pagos anulados permanecen en historial pero no afectan el saldo', () => {
  const p = { total: 50, abonos: [{ monto: 20 }, { monto: 10, anulado: true, motivoAnulacion: 'Duplicado' }] }
  assert.equal(p.abonos.length, 2)
  assert.equal(totalAbonos(p), 20)
  assert.equal(saldoPedido(p), 30)
})
