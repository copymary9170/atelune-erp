import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as k from '../src/lib/contabilidad.js'

const r = (x) => Math.round(x * 100) / 100
const config = { lineas: [{ id: 5, nombre: 'Sublimación' }], metodosPago: [{ nombre: 'Pago móvil' }] }

// Escenario de prueba con valores ficticios.
const datos = {
  config,
  productos: [{ id: 1, nombre: 'Taza' }],
  movimientos: [
    { id: 1, productoId: 1, tipo: 'entrada', cantidad: 10, costoUnitario: 2, fecha: '2026-03-01', stockResultante: 10, referencia: 'Inventario inicial' },
    { id: 2, productoId: 1, tipo: 'entrada', cantidad: 10, costoUnitario: 2, fecha: '2026-03-02', stockResultante: 20, pagadoCon: 'credito' },
    { id: 3, productoId: 1, tipo: 'salida', cantidad: 2, costoUnitario: 2, fecha: '2026-03-05', stockResultante: 18, pedidoId: 1 },
    { id: 4, productoId: 1, tipo: 'merma', cantidad: 1, costoUnitario: 2, fecha: '2026-03-06', stockResultante: 17 },
    { id: 5, productoId: 1, tipo: 'ajuste', cantidad: 16, costoUnitario: 2, fecha: '2026-03-07', stockResultante: 16 },
  ],
  pedidos: [{
    id: 1, numero: 1, estado: 'entregado', cliente: 'X', total: 30, iva: 0,
    items: [{ lineaId: 5, cantidad: 2 }], precios: [{ precio: 25.4 }],
    historial: [{ fecha: '2026-03-10T15:00:00.000Z', estado: 'entregado' }],
    abonos: [{ fecha: '2026-03-03', monto: 10, metodo: 'Pago móvil' }, { fecha: '2026-03-12', monto: 20, metodo: 'Pago móvil' }],
  }],
  gastos: [
    { id: 1, tipo: 'aporte', fecha: '2026-03-01', monto: 100, pagadoCon: 'Pago móvil' },
    { id: 2, tipo: 'gasto', categoria: 'Internet y teléfono', fecha: '2026-03-15', monto: 20, pagadoCon: 'Pago móvil' },
    { id: 3, tipo: 'pago_proveedor', fecha: '2026-03-16', monto: 20, pagadoCon: 'Pago móvil' },
    { id: 4, tipo: 'retiro', fecha: '2026-03-20', monto: 5, pagadoCon: 'Pago móvil' },
  ],
  activos: [{ id: 1, nombre: 'Plancha', costo: 240, valorResidual: 0, vidaUtilMeses: 24, fechaCompra: '2026-01-15' }],
  manuales: [{ id: 1, fecha: '2026-03-01', concepto: 'Prueba', lineas: [{ cuenta: '1.1.01:Pago móvil', debe: 1 }, { cuenta: '3.1.01', haber: 1 }] }],
}
const hasta = new Date('2026-03-31T12:00:00')
const as = k.generarAsientos(datos, hasta)

test('todos los asientos cuadran', () => {
  for (const a of as) {
    const d = r(a.lineas.reduce((s, l) => s + l.debe, 0)), h = r(a.lineas.reduce((s, l) => s + l.haber, 0))
    assert.equal(d, h, a.concepto)
  }
})

test('ventas, anticipos y cobros', () => {
  const s = k.sumasPorCuenta(as)
  assert.equal(r(s['4.1.01:5'].haber), 25.4)
  assert.equal(r(s['4.2.01'].haber), 4.6) // 30 - 25,40 de envío/recargos
  const cxc = k.saldo(k.infoCuenta('1.1.02'), s['1.1.02'])
  assert.equal(r(cxc), 0) // 30 vendido - 10 anticipo aplicado - 20 cobrado
  assert.equal(r(k.saldo(k.infoCuenta('2.1.02'), s['2.1.02'])), 0)
})

test('inventario y costos', () => {
  const s = k.sumasPorCuenta(as)
  assert.equal(r(k.saldo(k.infoCuenta('1.1.03'), s['1.1.03'])), 32) // 16 unidades × $2
  assert.equal(r(s['5.1.01'].debe), 4)
  assert.equal(r(s['5.1.02'].debe), 2)
  assert.equal(r(s['5.1.03'].debe), 2) // ajuste: de 17 a 16
  assert.equal(r(k.saldo(k.infoCuenta('2.1.01'), s['2.1.01'])), 0) // compra a crédito pagada
})

test('depreciación mensual hasta la fecha', () => {
  const deps = as.filter((a) => a.concepto.startsWith('Depreciación'))
  assert.deepEqual(deps.map((a) => a.fecha), ['2026-01-31', '2026-02-28'])
  assert.equal(deps[0].lineas[0].debe, 10)
})

test('ecuación contable: activo = pasivo + patrimonio', () => {
  const b = k.balanceGeneral(as, config, '2026-03-31')
  assert.equal(r(b.totalActivo), r(b.totalPasivo + b.totalPatrimonio))
  const er = k.estadoResultados(as, config, '2026-03-01', '2026-03-31')
  // ingresos 30 − costos 8 − gastos (20 internet + 0 depreciación en marzo... la de feb cae en feb)
  assert.equal(r(er.totalIngresos), 30)
  assert.equal(r(er.totalCostos), 8)
  assert.equal(r(er.utilidadNeta), 2)
  const bc = k.balanceComprobacion(as, config)
  assert.equal(r(bc.debe), r(bc.haber))
  assert.equal(r(bc.saldoDeudor), r(bc.saldoAcreedor))
})

test('libro mayor con saldo inicial', () => {
  const m = k.mayor(as, '1.1.01:Pago móvil', config, '2026-03-10', '2026-03-31')
  assert.equal(r(m.saldoInicial), 111) // 100 aporte + 1 manual + 10 anticipo
  assert.equal(r(m.saldoFinal), 111 + 20 - 20 - 20 - 5)
})

test('asiento redondea y cuadra', () => {
  const a = k.asiento('2026-01-01', 'x', {}, [{ cuenta: 'a', debe: 10 }, { cuenta: 'b', haber: 3.333 }, { cuenta: 'c', haber: 6.666 }])
  assert.equal(r(a.lineas.reduce((s, l) => s + l.debe - l.haber, 0)), 0)
})

test('pago de mano de obra y reparto de utilidades', () => {
  const as2 = k.generarAsientos({ config, gastos: [
    { id: 1, tipo: 'aporte', fecha: '2026-04-01', monto: 50, pagadoCon: 'Pago móvil' },
    { id: 2, tipo: 'pago_mano_obra', fecha: '2026-04-02', monto: 8, pagadoCon: 'Pago móvil', personaNombre: 'Hermana' },
    { id: 3, tipo: 'reparto', fecha: '2026-04-03', monto: 4.25, pagadoCon: 'Pago móvil', personaNombre: 'Mary' },
  ] }, hasta)
  const s = k.sumasPorCuenta(as2)
  assert.equal(s['6.3.01'].debe, 8)
  assert.equal(s['3.1.03'].debe, 4.25)
  const er = k.estadoResultados(as2, config)
  assert.equal(er.totalGastos, 8) // la mano de obra pagada es gasto
  const b = k.balanceGeneral(as2, config, '2026-04-30')
  assert.equal(r(b.totalActivo), r(b.totalPasivo + b.totalPatrimonio)) // el reparto reduce patrimonio, no es gasto
  assert.equal(r(b.totalActivo), 37.75)
})
