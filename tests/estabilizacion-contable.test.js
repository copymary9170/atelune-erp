import test from 'node:test'
import assert from 'node:assert/strict'
import { fechaContable } from '../src/lib/format.js'
import { estadoResultados, generarAsientos, utilidadContablePedido } from '../src/lib/contabilidad.js'
import { crearSincronizador } from '../src/lib/sincronizador.js'
import { mesesTranscurridos } from '../src/lib/calc.js'

const pedido = {
  id: 1, numero: 1, estado: 'entregado', total: 40, items: [{ lineaId: 1 }],
  precios: [{ precio: 40 }], costosUnitariosPresupuesto: { 7: 2 },
  historial: [{ estado: 'entregado', fecha: '2026-11-23T03:59:59.999Z', fechaContable: '2026-11-22' }],
}
const salida = { id: 9, productoId: 7, pedidoId: 1, tipo: 'salida', fecha: '2026-11-22',
  cantidad: 10, costoUnitario: 80 / 30, stockResultante: 20 }

test('la fecha contable cambia a medianoche de Caracas y conserva las fechas explícitas', () => {
  assert.equal(fechaContable('2026-11-23T00:00:00Z'), '2026-11-22')
  assert.equal(fechaContable('2026-11-23T03:59:59.999Z'), '2026-11-22')
  assert.equal(fechaContable('2026-11-23T04:00:00Z'), '2026-11-23')
  assert.equal(fechaContable('2026-11-23'), '2026-11-23')
  assert.equal(fechaContable('inválida'), null)
  assert.equal(mesesTranscurridos('2026-11-01', new Date('2026-12-01T03:59:59Z')), 0)
  assert.equal(mesesTranscurridos('2026-11-01', new Date('2026-12-01T04:00:00Z')), 1)
})

test('el cierre incluye venta y consumo en Caracas y explica el costo promedio del pedido', () => {
  const asientos = generarAsientos({ pedidos: [pedido], movimientos: [salida] })
  assert.ok(asientos.every(a => a.fecha === '2026-11-22'))
  const resultado = estadoResultados(asientos, {}, '2026-11-22', '2026-11-22')
  assert.equal(resultado.utilidadBruta.toFixed(2), '13.33')
  const ficha = utilidadContablePedido(pedido, [salida])
  assert.equal(ficha.utilidad.toFixed(2), '13.33')
  assert.equal(ficha.variacionPromedio, 6.67)
  assert.equal(utilidadContablePedido({ ...pedido, costosUnitariosPresupuesto: undefined }, [salida]).variacionPromedio, null)
  assert.equal(utilidadContablePedido({ ...pedido, estado: 'listo' }, [salida]), null)
})

test('un conflicto de abonos no admite el reemplazo de ninguna copia', async () => {
  const meta = { version: 3, sucio: true }
  let estado
  let descargas = 0
  const sincronizador = crearSincronizador({
    remoto: {
      leer: async () => ({ version: 3, datos: {} }),
      actualizar: async () => { throw { code: '23514' } },
    },
    local: { exportar: async () => ({}), importar: async () => { descargas++ } },
    meta: { get: () => meta, set: cambios => Object.assign(meta, cambios) },
    alEstado: fase => { estado = fase },
  })
  try {
    await sincronizador.sincronizar()
    assert.equal(estado, 'conflicto')
    await assert.rejects(sincronizador.resolver('nube'), /conciliarse/)
    await assert.rejects(sincronizador.resolver('local'), /conciliarse/)
    assert.equal(descargas, 0)
  } finally { sincronizador.detener() }
})
