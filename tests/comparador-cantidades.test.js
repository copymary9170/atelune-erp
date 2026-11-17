import test from 'node:test'
import assert from 'node:assert/strict'
import { compararCantidadesCotizacion } from '../src/lib/comparador-cantidades.js'
import { calcularCotizacion } from '../src/lib/calc.js'

const datos = {
  productos: [{ id: 1, nombre: 'Opalina', costoPromedio: 0.5 }],
  activos: [],
  config: { lineas: [{ id: 1, nombre: 'Papelería', margenPct: 40 }],
    personas: [{ id: 1, nombre: 'Mary', tarifaHora: 6 }],
    pedidosEstimadosMes: 10, costosFijos: [{ nombre: 'Internet', monto: 20 }],
    mermaPorDefecto: 10, costoKwh: 0, metodosPago: [{ nombre: 'Efectivo', comisionPct: 0 }],
  },
}
const cot = {
  tasa: 240, envio: 3, metodoPagoIdx: 0, aplicarIva: false,
  items: [
    { descripcion: 'Topper', lineaId: 1, personaId: 1, cantidad: 10,
      materiales: [{ productoId: 1, cantidad: 1 }], maquinas: [],
      minutosDiseno: 60, minutosProduccion: 3, extras: [{ concepto: 'Empaque', monto: 0.1 }],
      margenPct: 40, descuentoPct: 10,
      escalasCantidad: [{ desde: 10, descuentoPct: 5 }, { desde: 50, descuentoPct: 10 },
        { desde: 100, descuentoPct: 15 }],
    },
  ],
}

test('10, 50, 100 utilizan costos reales del motor y diluyen diseño y fijos', () => {
  const antes = structuredClone(cot)
  const r = compararCantidadesCotizacion(cot, 0, datos)
  assert.deepEqual(r.filas.map(f => f.cantidad), [10, 50, 100])
  assert.deepEqual(r.filas.map(f => f.descuentoCantidadPct), [5, 10, 15])
  assert.equal(r.filas[0].materiales, 5.5)
  assert.equal(r.filas[0].manoObra, 9)
  assert.equal(r.filas[0].fijos, 2)
  assert.equal(r.filas[0].costoTotal, 17.5)
  assert.ok(r.filas[0].costoUnitario > r.filas[2].costoUnitario)
  assert.equal(r.tieneCostosPendientes, false)
  assert.deepEqual(cot, antes, 'no debe modificar la cotización')
})

test('cada escenario coincide con calcularCotizacion, incluso descuentos manuales', () => {
  const comparacion = compararCantidadesCotizacion(cot, 0, datos)
  for (const fila of comparacion.filas) {
    const escenario = { ...cot, items: [{ ...cot.items[0], cantidad: fila.cantidad }] }
    const calculo = calcularCotizacion(escenario, datos)
    assert.ok(Math.abs(fila.costoTotal - calculo.renglones[0].costo) < 0.00011)
    assert.ok(Math.abs(fila.precioTotal - calculo.renglones[0].precio) < 0.00011)
    assert.ok(Math.abs(fila.precioCotizacionCompleta - calculo.total) < 0.00011)
    assert.ok(Math.abs(fila.utilidad - calculo.renglones[0].ganancia) < 0.00011)
  }
})

test('con otros trabajos se recalcula el reparto de fijos sin tocar sus cantidades', () => {
  const otro = { ...cot.items[0], cantidad: 2, descripcion: 'Segundo trabajo', escalasCantidad: [] }
  const doc = { ...cot, items: [cot.items[0], otro] }
  const comparacion = compararCantidadesCotizacion(doc, 0, datos, [10, 100])
  const normal = calcularCotizacion(doc, datos)
  assert.ok(Math.abs(comparacion.filas[0].fijos - normal.renglones[0].fijos) < 0.00011)
  assert.equal(doc.items[1].cantidad, 2)
  assert.ok(comparacion.filas[1].fijos > comparacion.filas[0].fijos)
})

test('detecta pérdidas reales sin alterar costos ni esconder precios bajo costo', () => {
  const doc = { ...cot, items: [{ ...cot.items[0], descuentoPct: 80 }] }
  const r = compararCantidadesCotizacion(doc, 0, datos)
  assert.equal(r.hayPerdida, true)
  assert.ok(r.filas.every(f => f.porDebajoDeCosto && f.utilidad < 0))
})

test('descuento de 100% no genera precio recomendado positivo ficticio', () => {
  const doc = { ...cot, items: [{ ...cot.items[0], descuentoPct: 100 }] }
  const r = compararCantidadesCotizacion(doc, 0, datos)
  assert.ok(r.filas.every(f => f.precioTotal === 0 && f.margenRealPct === null && f.porDebajoDeCosto))
})

test('márgenes inválidos impiden pintar números redondeados artificialmente', () => {
  const doc = { ...cot, items: [{ ...cot.items[0], margenPct: 100 }] }
  assert.throws(() => compararCantidadesCotizacion(doc, 0, datos), /margen|precio inválido/)
})

test('costos sin tarifa muestran aviso de cifras provisionales', () => {
  const d = structuredClone(datos)
  d.config.personas[0].tarifaHora = null
  const r = compararCantidadesCotizacion(cot, 0, d)
  assert.equal(r.tieneCostosPendientes, true)
  assert.ok(r.filas[0].avisos.some(a => /tarifa/i.test(a)))
})

test('sin tasa Bs/$ pero con costos USD completos no acusa costos faltantes', () => {
  const doc = { ...cot, tasa: null }
  const r = compararCantidadesCotizacion(doc, 0, datos)
  assert.equal(r.tieneCostosPendientes, false)
})

test('rechaza cantidades y escalas inválidas y nunca guarda información', () => {
  for (const qs of [[], [0], [-1], [2.3], [Infinity], Array(13).fill(10)]) {
    assert.throws(() => compararCantidadesCotizacion(cot, 0, datos, qs))
  }
  assert.throws(() => compararCantidadesCotizacion(cot, 10, datos))
  const doc = { ...cot, items: [{ ...cot.items[0], escalasCantidad: [{ desde: 0, descuentoPct: 25 }] }] }
  assert.throws(() => compararCantidadesCotizacion(doc, 0, datos), /descuentos/)
})
