import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularCotizacion } from '../src/lib/calc.js'
import { reporteRentabilidad } from '../src/lib/reporte-rentabilidad.js'
import { reporteCuentasPorCobrar } from '../src/lib/cuentas-cobrar.js'
import { resumenMovimientosCaja, calcularArqueo } from '../src/lib/caja.js'
import { compararCantidadesCotizacion } from '../src/lib/comparador-cantidades.js'

const datos = {
  config: {
    lineas: [{ id: 1, nombre: 'Impresión', margenPct: 40 }],
    personas: [{ id: 1, nombre: 'Mary', tarifaHora: 6 }],
    pedidosEstimadosMes: 10, costosFijos: [{ monto: 20 }],
    mermaPorDefecto: 5, costoKwh: 0, metodosPago: [{ nombre: 'Efectivo $', comisionPct: 0 }],
  },
  productos: [{ id: 1, nombre: 'Papel carta', costoPromedio: 0.1 }],
  activos: [],
}

test('cotización → pedido entregado → cartera, rentabilidad y caja concilian sin duplicar dinero', () => {
  const cot = {
    tasa: 240, envio: 0, metodoPagoIdx: 0, aplicarIva: false,
    items: [{ descripcion: 'Impresión color', lineaId: 1, personaId: 1,
      cantidad: 50, materiales: [{ productoId: 1, cantidad: 1 }],
      maquinas: [], minutosDiseno: 15, minutosProduccion: 0.5,
      mermaPct: 5, extras: [], margenPct: 40, descuentoPct: 0,
      escalasCantidad: [{ desde: 50, descuentoPct: 10 }] }],
  }
  const antes = JSON.stringify(cot)
  const calculo = calcularCotizacion(cot, datos)
  const pedido = {
    id: 5, numero: 5, cliente: 'Cliente ficticio', fecha: '2026-11-15',
    fechaEntrega: '2026-11-17', estado: 'entregado', costoIncompleto: [],
    historial: [{ estado: 'aprobado', fecha: '2026-11-15T12:00:00' },
      { estado: 'entregado', fecha: '2026-11-17T12:00:00' }],
    items: structuredClone(cot.items),
    precios: calculo.renglones.map(r => ({
      precio: r.precio, costo: r.costo, manoObra: r.manoObra })),
    subtotal: calculo.subtotal, costoTotal: calculo.costoTotal, ganancia: calculo.ganancia,
    total: calculo.total,
    abonos: [{ fecha: '2026-11-17', metodo: 'Efectivo $', monto: 10 },
      { fecha: '2026-11-17', metodo: 'Efectivo $', monto: 50, anulado: true }],
  }
  const inicial = JSON.stringify(pedido)
  const reporte = reporteRentabilidad([pedido], { desde: '2026-11-17', hasta: '2026-11-17', config: datos.config })
  assert.equal(reporte.evaluados, 1)
  assert.ok(Math.abs(reporte.ventasEvaluadas - calculo.subtotal) < 0.011)
  assert.ok(Math.abs(reporte.utilidadEvaluada - calculo.ganancia) < 0.011)
  assert.equal(reporte.porLinea[0].nombre, 'Impresión')

  const cartera = reporteCuentasPorCobrar([pedido], '2026-11-17')
  assert.equal(cartera.resumen.cantidadPendiente, 1)
  assert.ok(Math.abs(cartera.resumen.totalPendiente - (calculo.total - 10)) < 0.011)

  const caja = resumenMovimientosCaja({
    pedidos: [pedido],
    gastos: [{ id: 1, tipo: 'gasto', fecha: '2026-11-17', pagadoCon: 'Efectivo $', monto: 1 }],
    movimientos: [{ id: 2, tipo: 'entrada', fecha: '2026-11-17', pagadoCon: 'Efectivo $', cantidad: 2, costoUnitario: 1 }],
  }, { fecha: '2026-11-17', metodo: 'Efectivo $' })
  assert.equal(caja.entradas, 10)
  assert.equal(caja.salidas, 3)
  assert.deepEqual(calcularArqueo({ inicial: 5, contado: 12, resumen: caja }),
    { esperado: 12, contado: 12, diferencia: 0 })
  assert.equal(JSON.stringify(pedido), inicial)
  assert.equal(JSON.stringify(cot), antes)

  const comparador = compararCantidadesCotizacion(cot, 0, datos)
  assert.equal(comparador.filas.find(x => x.cantidad === 50).precioTotal, Math.round(calculo.subtotal * 10000) / 10000)
  assert.equal(JSON.stringify(cot), antes)
})

test('un pedido cancelado no suma ventas ni cartera; un abono anulado no crea entrada de caja', () => {
  const cancelado = {
    id: 9, numero: 9, estado: 'cancelado', subtotal: 100, costoTotal: 20,
    total: 110, items: [{ descripcion: 'Papel', cantidad: 1 }],
    precios: [{ precio: 100, costo: 20 }], historial: [],
    abonos: [{ fecha: '2026-11-17', metodo: 'Efectivo $', monto: 100, anulado: true }],
  }
  assert.equal(reporteRentabilidad([cancelado]).ventasEvaluadas, 0)
  assert.equal(reporteCuentasPorCobrar([cancelado], '2026-11-17').resumen.totalPendiente, 0)
  assert.equal(resumenMovimientosCaja({ pedidos: [cancelado] },
    { fecha: '2026-11-17', metodo: 'Efectivo $' }).entradas, 0)
})
