import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularCotizacion } from '../src/lib/calc.js'
import { calcularCotizacionRapida } from '../src/lib/cotizaciones.js'

const plantilla = {
  id: 2, nombre: 'Impresión de prueba', descripcion: 'Impresión de prueba', lineaId: 1,
  materiales: [{ productoId: 3, cantidad: 1 }], minutosDiseno: 30,
  escalasCantidad: [{ desde: 10, descuentoPct: 5 }],
}
const datos = {
  productos: [{ id: 3, nombre: 'Papel ficticio', costoPromedio: 2 }], activos: [],
  config: { mermaPorDefecto: 0, tarifaHora: 10, lineas: [{ id: 1, margenPct: 25 }],
    costosFijos: [{ monto: 24 }], pedidosEstimadosMes: 12, metodosPago: [{ nombre: 'Transferencia USD', comisionPct: 3 }] },
}

test('cotización rápida usa el precio del editor y copia la receta sin modificar el catálogo', () => {
  const { cotizacion, avisos } = calcularCotizacionRapida(plantilla, 12, datos)
  const esperado = calcularCotizacion(cotizacion, datos)
  assert.deepEqual(avisos, [])
  assert.equal(cotizacion.estado, 'borrador')
  assert.equal(cotizacion.tasa, null)
  assert.equal(cotizacion.calculo.totalBs, null)
  assert.equal(cotizacion.calculo.total, esperado.total)
  assert.equal(cotizacion.calculo.renglones[0].descuentoCantidadPct, 5)
  assert.equal(esperado.renglones[0].manoObra, 5)
  assert.ok(esperado.comision > 0 && esperado.fijos > 0)
  assert.equal(cotizacion.items[0].cantidad, 12)
  assert.equal(cotizacion.items[0].id, undefined)
  cotizacion.items[0].materiales[0].cantidad = 5
  assert.equal(plantilla.materiales[0].cantidad, 1)
})

test('la cotización rápida omite el precio si faltan configuración o insumos', () => {
  assert.match(calcularCotizacionRapida(plantilla, 1.5, datos).avisos[0], /entera/)
  const sinInsumos = calcularCotizacionRapida(plantilla, 2, { ...datos, productos: [] })
  assert.match(sinInsumos.avisos.join(), /materiales/)
  assert.equal(sinInsumos.cotizacion, undefined)
  const sinMargen = calcularCotizacionRapida(plantilla, 2, { ...datos, config: { ...datos.config, lineas: [] } })
  assert.match(sinMargen.avisos.join(), /margen/)
  assert.equal(sinMargen.cotizacion, undefined)
})
