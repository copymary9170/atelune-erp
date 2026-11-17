import test from 'node:test'
import assert from 'node:assert/strict'
import { monedaEfectivo, metodosEfectivo, resumenMovimientosCaja, calcularArqueo } from '../src/lib/caja.js'

const fecha = '2026-11-17'
const datos = {
  pedidos: [
    { id: 1, numero: 1, abonos: [
      { fecha, monto: 5, metodo: 'Efectivo $', tasa: null },
      { fecha, monto: 20, metodo: 'Efectivo $', anulado: true },
      { fecha, monto: 2, metodo: 'Efectivo Bs', tasa: 250 },
      { fecha: '2026-11-16', monto: 100, metodo: 'Efectivo $' },
      { fecha, monto: 50, metodo: 'Pago móvil' },
    ] },
  ],
  gastos: [
    { id: 1, fecha, tipo: 'gasto', monto: 2, pagadoCon: 'Efectivo $' },
    { id: 2, fecha, tipo: 'retiro', monto: 1, pagadoCon: 'Efectivo $' },
    { id: 3, fecha, tipo: 'aporte', monto: 3, pagadoCon: 'Efectivo $' },
    { id: 4, fecha, tipo: 'pago_proveedor', monto: 1, pagadoCon: 'Efectivo Bs', tasa: 250 },
    { id: 5, fecha, tipo: 'gasto', monto: 10, pagadoCon: 'credito' },
  ],
  movimientos: [
    { id: 1, fecha, tipo: 'entrada', cantidad: 2, costoUnitario: 0.5, pagadoCon: 'Efectivo $' },
    { id: 2, fecha, tipo: 'salida', cantidad: 3, costoUnitario: 1, pagadoCon: 'Efectivo $' },
    { id: 3, fecha, tipo: 'entrada', cantidad: 2, costoUnitario: 2, pagadoCon: 'credito' },
    { id: 4, fecha: '2026-11-16', tipo: 'entrada', cantidad: 1, costoUnitario: 3, pagadoCon: 'Efectivo $' },
  ],
}

test('detecta dos monedas y evita métodos bancarios o efectivos ambiguos', () => {
  assert.equal(monedaEfectivo('Efectivo $'), 'USD')
  assert.equal(monedaEfectivo('Efectivo Bs'), 'Bs')
  assert.equal(monedaEfectivo('Pago móvil'), null)
  assert.equal(monedaEfectivo('Efectivo'), null)
  assert.deepEqual(metodosEfectivo({ metodosPago: [
    { nombre: 'Efectivo $' }, { nombre: 'Efectivo Bs' }, { nombre: 'Pago móvil' },
  ] }), ['Efectivo $', 'Efectivo Bs'])
})

test('USD: pagos vigentes, aportes, gastos y compras sin dobles conteos', () => {
  const r = resumenMovimientosCaja(datos, { fecha, metodo: 'Efectivo $' })
  assert.equal(r.entradas, 8)
  assert.equal(r.salidas, 4)
  assert.equal(r.neto, 4)
  assert.equal(r.pendientes.length, 0)
  assert.deepEqual(calcularArqueo({ inicial: 10, contado: 13, resumen: r }),
    { esperado: 14, contado: 13, diferencia: -1 })
})

test('Bs: tasa específica del movimiento, sin sumar USD en el efectivo Bs', () => {
  const r = resumenMovimientosCaja(datos, { fecha, metodo: 'Efectivo Bs' })
  assert.equal(r.entradas, 500)
  assert.equal(r.salidas, 250)
  assert.equal(r.neto, 250)
  assert.deepEqual(calcularArqueo({ inicial: 100, contado: 350, resumen: r }),
    { esperado: 350, contado: 350, diferencia: 0 })
})

test('tasa ausente bloquea el cierre en Bs en lugar de inventar una tasa', () => {
  const r = resumenMovimientosCaja({ pedidos: [{
    id: 1, abonos: [{ fecha, monto: 3, metodo: 'Efectivo Bs' }],
  }] }, { fecha, metodo: 'Efectivo Bs' })
  assert.equal(r.pendientes.length, 1)
  assert.equal(r.pendientes[0].estado, 'sin_tasa')
  assert.throws(() => calcularArqueo({ inicial: 0, contado: 0, resumen: r }), /sin tasa/)
})

test('montos sin valor, negativos o infinitos bloquean el arqueo', () => {
  for (const monto of [null, '', -2, Infinity]) {
    const r = resumenMovimientosCaja({ gastos: [{ fecha, id: 1, tipo: 'gasto', monto, pagadoCon: 'Efectivo $' }] },
      { fecha, metodo: 'Efectivo $' })
    assert.equal(r.pendientes[0].estado, 'importe_invalido')
    assert.throws(() => calcularArqueo({ inicial: 0, contado: 0, resumen: r }))
  }
  const limpio = resumenMovimientosCaja({}, { fecha, metodo: 'Efectivo $' })
  for (const inicial of [-1, NaN, '']) assert.throws(() => calcularArqueo({ inicial, contado: 0, resumen: limpio }))
})

test('caja sin movimientos conserva el saldo físico inicial', () => {
  const r = resumenMovimientosCaja({}, { fecha, metodo: 'Efectivo $' })
  assert.equal(r.registros.length, 0)
  assert.deepEqual(calcularArqueo({ inicial: 12.5, contado: 12.5, resumen: r }),
    { esperado: 12.5, contado: 12.5, diferencia: 0 })
})
