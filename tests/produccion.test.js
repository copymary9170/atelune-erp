import test from 'node:test'
import assert from 'node:assert/strict'
import { crearRuta, marcarEtapa, progresoRuta, resumenProduccion, obtenerRuta } from '../src/lib/produccion.js'

test('rutas para impresión, topper, sublimación y reventa', () => {
  for (const id of ['impresion', 'topper', 'sublimacion', 'personalizado', 'reventa']) {
    const ruta = crearRuta(id, '2026-11-17T00:00:00.000Z')
    assert.ok(ruta.etapas.length > 0)
    assert.equal(progresoRuta(ruta).porcentaje, 0)
  }
})
test('no permite saltar etapas, y registra el avance', () => {
  let ruta = crearRuta('impresion')
  assert.throws(() => marcarEtapa(ruta, 'calidad', true), /anteriores/)
  ruta = marcarEtapa(ruta, 'archivo', true, '2026-11-17T12:00:00.000Z')
  assert.equal(progresoRuta(ruta).hechas, 1)
  assert.equal(ruta.etapas[0].fecha, '2026-11-17T12:00:00.000Z')
  ruta = marcarEtapa(ruta, 'impresion', true)
  ruta = marcarEtapa(ruta, 'calidad', true)
  assert.equal(progresoRuta(ruta).completa, true)
  ruta = marcarEtapa(ruta, 'archivo', false)
  assert.equal(progresoRuta(ruta).hechas, 0)
})
test('cada renglón mantiene una ruta independiente y los cerrados no cuentan', () => {
  const ruta = crearRuta('reventa')
  const completa = marcarEtapa(ruta, 'calidad', true)
  const pedidos = [{ estado:'aprobado', items:[{}, {}, {}], produccionEtapas:{ 0:ruta, 1:completa } }, { estado:'entregado',items:[{}] }]
  assert.deepEqual(resumenProduccion(pedidos), { sinRuta:1, enProceso:1, terminados:1 })
  assert.equal(obtenerRuta(pedidos[0].produccionEtapas, 2), null)
})
test('no muta la ruta original', () => {
  const ruta = crearRuta('reventa'); const otra = marcarEtapa(ruta, 'calidad', true)
  assert.equal(ruta.etapas[0].completada, false)
  assert.equal(otra.etapas[0].completada, true)
})
