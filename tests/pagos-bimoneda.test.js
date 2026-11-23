import test from 'node:test'
import assert from 'node:assert/strict'
import { congelarConversion, monedaMetodoPago, validarFechaOperacion } from '../src/lib/pagos.js'
import { resumenMovimientosCaja, monedaEfectivo } from '../src/lib/caja.js'
import { cuentaDisponible, generarAsientos } from '../src/lib/contabilidad.js'

const fecha = '2026-11-22'

test('transferencias Bs requieren tasa; USD y métodos ambiguos sin tasa no inventan equivalencia', () => {
  assert.equal(monedaMetodoPago('Transferencia Bs'), 'Bs')
  assert.equal(monedaMetodoPago('Depósito VES'), 'Bs')
  assert.equal(monedaMetodoPago('Transferencia USD'), 'USD')
  assert.equal(monedaMetodoPago('Pago móvil'), 'Bs')
  assert.equal(monedaEfectivo('Efectivo Bs / $'), null)
  assert.equal(congelarConversion(12, null, 'Transferencia USD'), null)
  assert.equal(congelarConversion(12, null, 'Transferencia'), null)
  assert.throws(() => congelarConversion(12, null, 'Transferencia Bs'), /tasa válida/)
  assert.throws(() => congelarConversion(12, Infinity, 'Efectivo Bs'), /tasa válida/)
  assert.throws(() => validarFechaOperacion('2026-02-30'), /fecha/)
  assert.equal(congelarConversion(12, 30.5, 'Transferencia Bs'), 366)
})

test('caja concilia los Bs congelados de una compra partida sin volver a convertir cada línea', () => {
  const movimientos = [0.33, 0.32, 0.33].map((montoBs, i) => ({
    id: i + 1, tipo: 'entrada', fecha, pagadoCon: 'Efectivo Bs',
    cantidad: 3, costoUnitario: 0.01 / 3, tasa: 32.6, montoBs,
  }))
  const compra = resumenMovimientosCaja({ movimientos }, { fecha, metodo: 'Efectivo Bs' })
  assert.equal(compra.salidas, 0.98)
  assert.equal(compra.salidas, congelarConversion(0.03, 32.6, 'Efectivo Bs'))
  assert.equal(resumenMovimientosCaja({ movimientos: [{ ...movimientos[0], costoUnitario: null }] },
    { fecha, metodo: 'Efectivo Bs' }).pendientes[0].estado, 'importe_invalido')
})

test('una comisión informativa no crea asientos ni duplica una comisión bancaria registrada', () => {
  const metodo = 'Transferencia Bs'
  const pedidos = [{ id: 1, estado: 'aprobado', numero: 1, total: 30, abonos: [
    { fecha, monto: 10, tasa: 32, metodo, tasaDetalle: { comisionPct: 5 } },
  ] }]
  const gastos = [{ id: 1, fecha, monto: 1, tipo: 'gasto', categoria: 'Comisiones bancarias',
    pagadoCon: metodo, tasa: 32, tasaDetalle: { comisionPct: 5 } }]
  const asientos = generarAsientos({ pedidos, gastos })
  assert.equal(asientos.length, 2)
  assert.deepEqual(asientos.flatMap(a => a.lineas).filter(l => l.cuenta === cuentaDisponible(metodo))
    .map(({ debe, haber }) => [debe, haber]), [[10, 0], [0, 1]])
  const gastoEfectivo = { ...gastos[0], pagadoCon: 'Efectivo Bs' }
  assert.equal(resumenMovimientosCaja({ gastos: [gastoEfectivo] }, { fecha, metodo: 'Efectivo Bs' }).salidas, 32)
})
