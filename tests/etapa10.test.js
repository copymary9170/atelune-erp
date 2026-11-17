import test from 'node:test'
import assert from 'node:assert/strict'
import { descuentoPorCantidad, escalasInvalidas, prepararDuplicadoCotizacion } from '../src/lib/escalas-cotizaciones.js'
import { calcularCotizacion, redondear } from '../src/lib/calc.js'

const escalas = [{ desde: 100, descuentoPct: 15 }, { desde: 10, descuentoPct: 5 }, { desde: 50, descuentoPct: 10 }]
const datos = {
  productos: [{ id: 1, nombre: 'Papel', costoPromedio: 1 }],
  activos: [],
  config: { linea: [], lineas: [{ id: 1, margenPct: 50 }], pedidosEstimadosMes: 10,
    costosFijos: [{ nombre: 'Fijos', monto: 20 }], mermaPorDefecto: 0,
    personas: [{ id: 1, nombre: 'Mary', tarifaHora: 6 }],
    metodosPago: [{ nombre: 'Efectivo', comisionPct: 0 }], ivaPct: 16 },
}
const cot = cantidad => ({
  envio: 0, metodoPagoIdx: 0, aplicarIva: false, tasa: 100,
  items: [{ lineaId: 1, cantidad, materiales: [{ productoId: 1, cantidad: 1 }],
    minutosDiseno: 60, minutosProduccion: 0, maquinas: [], extras: [],
    escalasCantidad: escalas }],
})

test('descuento de volumen selecciona un único escalón y admite desorden', () => {
  for (const [cantidad, pct] of [[1, 0], [9, 0], [10, 5], [49, 5], [50, 10], [99, 10], [100, 15], [150, 15]]) {
    assert.equal(descuentoPorCantidad(cantidad, escalas).descuentoPct, pct)
  }
})

test('escalas incompletas, repetidas o no finitas se rechazan', () => {
  assert.equal(escalasInvalidas(escalas), false)
  for (const invalido of [[{ desde: '', descuentoPct: 5 }], [{ desde: 1, descuentoPct: '' }],
    [{ desde: 2.5, descuentoPct: 5 }], [{ desde: 0, descuentoPct: 5 }],
    [{ desde: 5, descuentoPct: -5 }], [{ desde: 5, descuentoPct: 101 }],
    [{ desde: 1, descuentoPct: 2 }, { desde: '1', descuentoPct: 3 }]]) {
    assert.equal(escalasInvalidas(invalido), true)
  }
  assert.deepEqual(descuentoPorCantidad(0, escalas), { descuentoPct: 0, desde: null })
})

test('escala reduce el precio, pero conserva costo, merma y mano de obra', () => {
  const normal = calcularCotizacion({ ...cot(10), items: [{ ...cot(10).items[0], escalasCantidad: [] }] }, datos)
  const porCantidad = calcularCotizacion(cot(10), datos)
  assert.equal(porCantidad.costoTotal, normal.costoTotal)
  assert.equal(porCantidad.renglones[0].materiales, normal.renglones[0].materiales)
  assert.equal(porCantidad.renglones[0].manoObra, normal.renglones[0].manoObra)
  assert.equal(redondear(porCantidad.subtotal, 3), redondear(normal.subtotal * 0.95, 3))
  assert.equal(porCantidad.renglones[0].descuentoCantidadPct, 5)
  assert.equal(redondear(porCantidad.ganancia, 4), redondear(porCantidad.subtotal - porCantidad.costoTotal, 4))
})

test('descuentos manuales y por volumen se combinan sin sumarse como porcentajes', () => {
  const item = { ...cot(10).items[0], descuentoPct: 10 }
  const calc = calcularCotizacion({ ...cot(10), items: [item] }, datos)
  const base = calcularCotizacion({ ...cot(10), items: [{ ...item, descuentoPct: 0, escalasCantidad: [] }] }, datos)
  assert.equal(redondear(calc.subtotal, 4), redondear(base.subtotal * 0.9 * 0.95, 4))
})

test('cotizaciones antiguas sin escalas mantienen exactamente su precio', () => {
  const antigua = { ...cot(8), items: [{ ...cot(8).items[0], escalasCantidad: undefined, descuentoPct: 0 }] }
  const calculo = calcularCotizacion(antigua, datos)
  assert.equal(calculo.renglones[0].descuentoCantidadPct, 0)
  assert.equal(calculo.subtotal, calculo.renglones[0].precio)
})

test('duplicar genera nuevo borrador, elimina cálculo guardado y no cambia origen', () => {
  const original = { id: 12, numero: 20, fecha: '2026-10-01', estado: 'aprobada',
    cliente: 'Cliente de prueba', pedidoId: 9, calculo: { total: 123 },
    items: [{ descripcion: 'Topper', materiales: [{ productoId: 1, cantidad: 2 }],
      escalasCantidad: [{ desde: 20, descuentoPct: 8 }] }] }
  const originalSnapshot = structuredClone(original)
  const copia = prepararDuplicadoCotizacion(original, 21, '2026-11-17')
  assert.equal(copia.numero, 21)
  assert.equal(copia.fecha, '2026-11-17')
  assert.equal(copia.estado, 'borrador')
  assert.equal(copia.cotizacionOrigenId, 12)
  assert.equal(copia.id, undefined)
  assert.equal(copia.pedidoId, undefined)
  assert.equal(copia.calculo, undefined)
  assert.deepEqual(copia.items, original.items)
  copia.items[0].materiales[0].cantidad = 100
  assert.deepEqual(original, originalSnapshot)
})

test('numeración inválida y origen inexistente rechazan duplicación', () => {
  assert.throws(() => prepararDuplicadoCotizacion(null, 2, '2026-11-17'))
  assert.throws(() => prepararDuplicadoCotizacion({ id: 2 }, 0, '2026-11-17'))
})
