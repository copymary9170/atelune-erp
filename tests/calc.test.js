import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as c from '../src/lib/calc.js'

const r = (x) => c.redondear(x, 4)

test('promedio ponderado en entradas', () => {
  let p = { stock: 0, costoPromedio: 0 }
  p = c.aplicarMovimiento(p, { tipo: 'entrada', cantidad: 10, costoUnitario: 2 })
  assert.deepEqual(p, { stock: 10, costoPromedio: 2 })
  p = c.aplicarMovimiento(p, { tipo: 'entrada', cantidad: 10, costoUnitario: 4 })
  assert.equal(p.stock, 20); assert.equal(p.costoPromedio, 3)
  p = c.aplicarMovimiento(p, { tipo: 'salida', cantidad: 5 })
  assert.equal(p.stock, 15); assert.equal(p.costoPromedio, 3)
  p = c.aplicarMovimiento(p, { tipo: 'ajuste', cantidad: 12 })
  assert.equal(p.stock, 12)
  assert.throws(() => c.aplicarMovimiento(p, { tipo: 'salida', cantidad: 0 }))
})

test('costo por hora de una máquina', () => {
  const a = { costo: 1200, valorResidual: 0, vidaUtilMeses: 24, horasUsoMes: 50, mantenimientoMensual: 0, potenciaW: 1000 }
  assert.equal(c.depreciacionMensual(a), 50)
  // 50/50 = 1 $/h + 1 kWh * 0.1 = 1.1
  assert.equal(r(c.costoHoraActivo(a, 0.1)), 1.1)
  assert.equal(c.costoHoraActivo({ ...a, horasUsoMes: 0 }, 0), 0)
})

test('depreciación acumulada no supera la vida útil', () => {
  const a = { costo: 120, valorResidual: 0, vidaUtilMeses: 12, fechaCompra: '2020-01-01' }
  assert.equal(c.depreciacionAcumulada(a, new Date('2026-01-01T00:00:00')), 120)
  assert.equal(c.depreciacionAcumulada(a, new Date('2020-04-15T00:00:00')), 30)
})

test('precio desde margen sobre venta', () => {
  assert.equal(r(c.precioDesdeMargen(60, 40)), 100)
  assert.equal(c.precioDesdeMargen(10, 0), 10)
})

test('cotización completa (valores de prueba ficticios)', () => {
  const productos = [{ id: 1, nombre: 'Taza', costoPromedio: 2 }, { id: 2, nombre: 'Papel', costoPromedio: 0.5 }]
  const activos = [{ id: 1, nombre: 'Plancha', costo: 1200, valorResidual: 0, vidaUtilMeses: 24, horasUsoMes: 50, potenciaW: 0 }]
  const config = {
    tarifaHora: 6, mermaPorDefecto: 10, costoKwh: 0, pedidosEstimadosMes: 10,
    costosFijos: [{ nombre: 'Internet', monto: 20 }], ivaPct: 16,
    metodosPago: [{ nombre: 'X', comisionPct: 0 }, { nombre: 'Y', comisionPct: 10 }],
    lineas: [{ id: 1, nombre: 'Sublimación', margenPct: 50 }],
  }
  const cot = {
    tasa: 100, envio: 0, metodoPagoIdx: 0, aplicarIva: false,
    items: [{ lineaId: 1, cantidad: 2, materiales: [{ productoId: 1, cantidad: 1 }, { productoId: 2, cantidad: 1 }],
      maquinas: [{ activoId: 1, minutos: 6 }], minutosDiseno: 30, minutosProduccion: 10, extras: [] }],
  }
  const res = c.calcularCotizacion(cot, { productos, activos, config })
  const d = res.renglones[0]
  // materiales: (2+0.5)*1.1 = 2.75/u -> 5.5 ; máquina: 0.1h*1$/h=0.1/u -> 0.2
  // mano de obra: prod 10min*6$/h=1/u -> 2 + diseño 3 = 5 ; total directo 10.7 ; fijos 2 => 12.7
  assert.equal(r(d.materiales), 5.5)
  assert.equal(r(d.maquinas), 0.2)
  assert.equal(r(d.manoObra), 5)
  assert.equal(r(d.costo), 12.7)
  assert.equal(r(res.subtotal), 25.4)
  assert.equal(r(res.total), 25.4)
  assert.equal(r(res.totalBs), 2540)
  assert.equal(r(res.margenReal), 0.5)

  const res2 = c.calcularCotizacion({ ...cot, metodoPagoIdx: 1, aplicarIva: true }, { productos, activos, config })
  // 25.4/0.9 = 28.2222 ; IVA 16% => 32.7378
  assert.equal(r(res2.comision), r(25.4 / 0.9 - 25.4))
  assert.equal(r(res2.total), r((25.4 / 0.9) * 1.16))
})

test('avisos por datos pendientes', () => {
  const config = { tarifaHora: null, mermaPorDefecto: null, costosFijos: [], lineas: [{ id: 1, nombre: 'Impresión', margenPct: null }] }
  const av = c.avisosCotizacion({ items: [{ lineaId: 1 }] }, { productos: [], activos: [], config })
  assert.ok(av.some((a) => a.includes('tarifa')))
  assert.ok(av.some((a) => a.includes('Impresión')))
  assert.ok(av.some((a) => a.includes('tasa')))
})
