import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularCobro } from '../src/lib/cobros.js'
import { resumenSaldoPedido } from '../src/lib/cuentas-cobrar.js'

test('cobro completo usa el saldo USD y muestra el importe en la moneda elegida', () => {
  const completo = { modo: 'completo', importePago: '1' }
  assert.deepEqual(calcularCobro({ ...completo, monedaPago: 'USD', metodo: 'Efectivo $' }, 20.35),
    { monto: 20.35, montoBs: null, monedaPago: 'USD', importePago: 20.35 })
  assert.deepEqual(calcularCobro({ ...completo, monedaPago: 'Bs', metodo: 'Pago móvil', tasa: 40 }, 20.35),
    { monto: 20.35, montoBs: 814, monedaPago: 'Bs', importePago: 814 })
})

test('abono parcial en Bs conserva exactamente el importe recibido aunque el equivalente redondee', () => {
  const datos = { modo: 'parcial', importePago: '401,01', monedaPago: 'Bs', metodo: 'Transferencia', tasa: 40 }
  assert.deepEqual(calcularCobro(datos, 30), { monto: 10.03, montoBs: 401.01, monedaPago: 'Bs', importePago: 401.01 })
  assert.throws(() => calcularCobro({ ...datos, tasa: null }, 30), /tasa válida/)
  assert.throws(() => calcularCobro({ ...datos, metodo: 'Efectivo $' }, 30), /moneda compatible/)
})

test('el cobro rápido no supera el saldo y conserva el comportamiento libre del detalle', () => {
  const datos = { modo: 'parcial', importePago: '30', monedaPago: 'USD', metodo: 'Efectivo $' }
  assert.throws(() => calcularCobro(datos, 30), /menor al saldo/)
  assert.throws(() => calcularCobro(datos, 25), /menor al saldo/)
  assert.throws(() => calcularCobro({ ...datos, modo: 'completo' }, 0), /no tiene saldo/)
  assert.equal(calcularCobro({ ...datos, modo: 'libre' }, 25).monto, 30)
  assert.throws(() => calcularCobro({ ...datos, importePago: '20,123' }, 30), /dos decimales/)
})

test('para liquidar se parte del saldo a centavos y se excluyen los abonos anulados', () => {
  const pedido = { total: 42.135, abonos: [{ monto: 1.15 }, { monto: 12, anulado: true }] }
  const { pendiente } = resumenSaldoPedido(pedido)
  assert.equal(pendiente, 40.99)
  const completo = calcularCobro({ modo: 'completo', monedaPago: 'USD', metodo: 'Efectivo $' }, pendiente)
  assert.equal(resumenSaldoPedido({ ...pedido, abonos: [...pedido.abonos, completo] }).pendiente, 0)
  assert.equal(resumenSaldoPedido({ ...pedido, abonos: [{ monto: '12' }] }), null)
})
