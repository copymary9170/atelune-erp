import test from 'node:test'
import assert from 'node:assert/strict'
import { validarRespuestaRemota } from '../src/lib/validacion-nube.js'

const datosValidos = () => ({
  app: 'atelune-erp', version: 1,
  config: [{ id: 'general', nombreNegocio: 'Prueba' }],
  productos: [], pedidos: [], movimientos: [],
})

test('sin fila remota se informa una nube vacía', () => {
  assert.equal(validarRespuestaRemota(null), null)
})

test('acepta una fila de Supabase con estructura y versión válidas', () => {
  const fila = { version: 7, datos: datosValidos() }
  assert.equal(validarRespuestaRemota(fila), fila)
})

test('bloquea copias corruptas sin sustituir silenciosamente su identidad', () => {
  for (const datos of [
    { ...datosValidos(), app: 'otra-app' },
    { ...datosValidos(), config: [] },
    { ...datosValidos(), productos: 'error' },
    { ...datosValidos(), version: 99 },
  ]) {
    assert.throws(() => validarRespuestaRemota({ version: 2, datos }))
  }
})

test('rechaza versiones ilegibles, negativas y fraccionarias', () => {
  for (const version of [0, -1, 0.5, '2', NaN, Infinity, null]) {
    assert.throws(() => validarRespuestaRemota({ version, datos: datosValidos() }), /Versión/)
  }
})

test('no acepta objetos ni listas malformados como filas remotas', () => {
  for (const value of [[], {}, 'datos', 7, { version: 1 }]) {
    assert.throws(() => validarRespuestaRemota(value))
  }
})
