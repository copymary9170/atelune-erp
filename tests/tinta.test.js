import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coberturaCMYK, mlPorCartaLlena, estimarTinta } from '../src/lib/tinta.js'

const px = (...colores) => new Uint8ClampedArray(colores.flat())
const r = (x) => Math.round(x * 1e4) / 1e4

test('cobertura por canal', () => {
  assert.deepEqual(coberturaCMYK(px([255, 255, 255, 255])), { c: 0, m: 0, y: 0, k: 0 }) // blanco
  assert.deepEqual(coberturaCMYK(px([0, 0, 0, 255])), { c: 0, m: 0, y: 0, k: 1 }) // negro: solo tinta negra
  assert.deepEqual(coberturaCMYK(px([0, 255, 255, 255])), { c: 1, m: 0, y: 0, k: 0 }) // cian puro
  assert.deepEqual(coberturaCMYK(px([255, 0, 0, 255])), { c: 0, m: 1, y: 1, k: 0 }) // rojo = magenta + amarillo
  assert.deepEqual(coberturaCMYK(px([0, 0, 0, 0])), { c: 0, m: 0, y: 0, k: 0 }) // transparente = papel
  const mitad = coberturaCMYK(px([0, 0, 0, 255], [255, 255, 255, 255]))
  assert.equal(mitad.k, 0.5)
  const gris = coberturaCMYK(px([128, 128, 128, 255]))
  assert.equal(r(gris.k), r(1 - 128 / 255)); assert.equal(gris.c, 0)
})

test('rendimiento del fabricante a ml (valores de prueba ficticios)', () => {
  // Botella de 100 ml que rinde 1000 páginas al 5 % → 2 ml por carta llena.
  assert.equal(mlPorCartaLlena({ mlBotella: 100, paginas: 1000 }), 2)
  assert.equal(mlPorCartaLlena({ mlBotella: 100 }), null)
  assert.equal(mlPorCartaLlena(undefined), null)
})

test('estimación con varias páginas y tamaños', () => {
  const perfil = { canales: { k: { productoId: 7, mlBotella: 100, paginas: 1000 }, c: { productoId: 8, mlBotella: 100, paginas: 2000 } } }
  const e = estimarTinta([
    { cobertura: { c: 0.5, m: 0, y: 0, k: 0.05 }, areaCartas: 1 },
    { cobertura: { c: 0, m: 0.2, y: 0, k: 0.05 }, areaCartas: 0.5 },
  ], perfil)
  assert.equal(r(e.k.ml), 0.15) // (0,05 + 0,025) cartas llenas × 2 ml
  assert.equal(r(e.c.ml), 0.5) // 0,5 × 1 ml
  assert.equal(e.m.ml, null) // sin rendimiento: pendiente, no cero
  assert.equal(r(e.m.cobertura), r(0.1 / 1.5))
  assert.equal(e.k.productoId, 7)
})
