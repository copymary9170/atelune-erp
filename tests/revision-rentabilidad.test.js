import test from 'node:test'
import assert from 'node:assert/strict'
import { fechaEntregaPedido, reporteRentabilidad } from '../src/lib/reporte-rentabilidad.js'
import { generarCsvRentabilidad } from '../src/lib/exportar-rentabilidad.js'

const pedido = fecha => ({
  estado: 'entregado',
  historial: [{ estado: 'entregado', fecha }],
  id: 1, numero: 1, subtotal: 25, costoTotal: 15,
  items: [{ descripcion: 'Papel', cantidad: 1 }],
  precios: [{ precio: 25, costo: 15 }], costoIncompleto: [],
})

test('rechaza fechas de calendario imposibles y filtros inválidos', () => {
  for (const fecha of ['2026-02-30', '2026-13-01', '2026-00-01', '2026-11-31', '2026-02-29']) {
    assert.equal(fechaEntregaPedido(pedido(fecha)), null, fecha)
    assert.throws(() => reporteRentabilidad([], { desde: fecha }), /Rango/)
  }
  assert.equal(fechaEntregaPedido(pedido('2028-02-29')), '2028-02-29')
})

test('timestamp UTC alrededor de medianoche usa la fecha local, no UTC forzada', () => {
  const fecha = '2026-11-17T00:30:00.000Z'
  const d = new Date(fecha)
  const esperada = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0')].join('-')
  assert.equal(fechaEntregaPedido(pedido(fecha)), esperada)
  const r = reporteRentabilidad([pedido(fecha)], {desde:esperada, hasta:esperada})
  assert.equal(r.evaluados, 1)
})

test('CSV escapa fórmulas, incluso tras espacios o tabulaciones', () => {
  const peligros = [
    '=HYPERLINK("https://example.invalid","Abrir")',
    '  =1+1', '\t@SUM(A1:A2)', '\r-1+1', '+2+3',
  ]
  for (const cliente of peligros) {
    const csv = generarCsvRentabilidad({ filas: [{
      numero: 1, fecha: '2026-11-17', cliente, venta: 10, costo: 5,
      utilidad: 5, margenPct: 50, incompleto: false,
    }] })
    assert.ok(csv.startsWith('\uFEFF'))
    assert.ok(csv.includes(';"\'' + cliente.replaceAll('"','""') + '";'), cliente)
  }
})

test('CSV conserva números negativos y escapa comillas sin alterar los datos', () => {
  const filas = [{ numero: 12, fecha:'2026-11-17', cliente:'Papel "Premium"; 10',
    venta:100, costo:120, utilidad:-20, margenPct:-20, incompleto:false }]
  const original = JSON.stringify(filas)
  const csv = generarCsvRentabilidad({filas})
  assert.ok(csv.includes('"Papel ""Premium""; 10"'))
  assert.ok(csv.includes(';"-20";'))
  assert.equal(JSON.stringify(filas), original)
})
