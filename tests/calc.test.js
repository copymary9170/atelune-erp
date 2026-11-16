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
  const av = c.avisosCotizacion({ items: [{ lineaId: 1, minutosDiseno: 10 }] }, { productos: [], activos: [], config })
  assert.ok(av.some((a) => a.includes('tarifa')))
  assert.ok(av.some((a) => a.includes('Impresión')))
  assert.ok(av.some((a) => a.includes('tasa')))
})

test('consumo de materiales de un pedido', () => {
  const items = [
    { cantidad: 2, mermaPct: 10, materiales: [{ productoId: 1, cantidad: 1 }, { productoId: 2, cantidad: 3 }] },
    { cantidad: 1, materiales: [{ productoId: 1, cantidad: 2 }, { productoId: '', cantidad: 5 }] },
  ]
  const r = c.consumoPedido(items, { mermaPorDefecto: 0 })
  const p1 = r.find((x) => x.productoId === 1).cantidad
  const p2 = r.find((x) => x.productoId === 2).cantidad
  assert.equal(c.redondear(p1, 4), 4) // 2*1 + 2 (la merma no se descuenta por adelantado)
  assert.equal(c.redondear(p2, 4), 6)
  assert.equal(r.length, 2)
})

test('saldo de pedido', () => {
  const p = { total: 50, abonos: [{ monto: 20 }, { monto: 10 }] }
  assert.equal(c.totalAbonos(p), 30)
  assert.equal(c.saldoPedido(p), 20)
})

test('mano de obra según la persona responsable', () => {
  const config = { mermaPorDefecto: 0, personas: [{ id: 1, nombre: 'Mary', tarifaHora: 2.5 }, { id: 2, nombre: 'Hermana', tarifaHora: 4 }] }
  const base = { cantidad: 1, minutosDiseno: 120, materiales: [], maquinas: [], extras: [] }
  assert.equal(c.costoItem({ ...base }, { productos: [], activos: [], config }).manoObra, 5) // por defecto la primera persona
  assert.equal(c.costoItem({ ...base, personaId: 2 }, { productos: [], activos: [], config }).manoObra, 8)
  // compatibilidad con la tarifa única anterior
  assert.equal(c.costoItem(base, { productos: [], activos: [], config: { tarifaHora: 3 } }).manoObra, 6)
})

test('reparto: regla 40/60/0 (caso Natalia) y conservación de centavos', () => {
  const regla = { destinos: [{ tipo: 'reinversion', pct: 40 }, { tipo: 'persona', personaId: 1, pct: 60 }, { tipo: 'persona', personaId: 2, pct: 0 }] }
  const r = c.repartir(7.08, regla)
  assert.equal(r.valido, true)
  assert.deepEqual(r.destinos.map((d) => d.monto), [2.83, 4.25, 0])
  assert.equal(c.redondear(r.destinos.reduce((s, d) => s + d.monto, 0), 2), 7.08)
  const t = c.repartir(10, { destinos: [{ tipo: 'reinversion', pct: 33.33 }, { tipo: 'persona', pct: 33.33 }, { tipo: 'persona', pct: 33.34 }] })
  assert.equal(c.redondear(t.destinos.reduce((s, d) => s + d.monto, 0), 2), 10)
})

test('reparto: pérdida, regla incompleta o que no suma 100', () => {
  const ok = { destinos: [{ tipo: 'reinversion', pct: 40 }, { tipo: 'persona', pct: 60 }] }
  assert.equal(c.repartir(-1, ok).valido, false)
  assert.equal(c.repartir(0, ok).valido, false)
  assert.match(c.repartir(5, { destinos: [{ tipo: 'reinversion', pct: null }] }).motivo, /Faltan/)
  assert.match(c.repartir(5, { destinos: [{ tipo: 'reinversion', pct: 40 }, { tipo: 'persona', pct: 50 }] }).motivo, /suman 90/)
})

test('caso Natalia con datos del documento', () => {
  // Costos puestos en inventario según el documento (materiales conocidos).
  const productos = [
    { id: 1, nombre: 'Cartulina roja (hoja carta)', costoPromedio: 3 / 4 },
    { id: 2, nombre: 'Cartulina azul (hoja carta)', costoPromedio: 3 / 4 },
    { id: 3, nombre: 'Opalina', costoPromedio: (100 * 0.25 + 1) / 100 },
    { id: 4, nombre: 'Fotográfico', costoPromedio: (17 + 2) / 50 },
    { id: 5, nombre: 'Pitillo', costoPromedio: (6 + 1) / 50 },
  ]
  const config = { mermaPorDefecto: 0, personas: [{ id: 1, nombre: 'Mary', tarifaHora: 2.5 }], lineas: [{ id: 9, nombre: 'Manualidades', margenPct: 0 }], metodosPago: [{ nombre: 'X' }] }
  const item = { lineaId: 9, cantidad: 1, personaId: 1, minutosDiseno: 120, materiales: [
    { productoId: 1, cantidad: 1 }, { productoId: 2, cantidad: 1 }, { productoId: 3, cantidad: 2 }, { productoId: 4, cantidad: 2 }, { productoId: 5, cantidad: 1 },
  ], maquinas: [], extras: [] }
  const d = c.costoItem(item, { productos, activos: [], config })
  assert.equal(c.redondear(d.materiales, 2), 2.92)
  assert.equal(d.manoObra, 5)
  assert.equal(c.redondear(d.total, 2), 7.92)
  // Venta de referencia 15: utilidad 7,08 antes de los costos aún desconocidos (cinta, pega, tinta, desgaste).
  const pedido = { precios: [{ precio: 15, costo: d.total, manoObra: d.manoObra, personaId: 1 }] }
  assert.equal(c.redondear(c.utilidadPedido(pedido), 2), 7.08)
  assert.equal(c.manoObraPorPersona(pedido).get(1), 5)
})
