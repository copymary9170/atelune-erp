import test from 'node:test'
import assert from 'node:assert/strict'
import { nombreBaseCuenta, NOMBRE_BASE_LEGADA } from '../src/db.js'

test('cada cuenta UUID recibe su propio nombre de base de datos', () => {
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  assert.notEqual(nombreBaseCuenta(a), nombreBaseCuenta(b))
  assert.notEqual(nombreBaseCuenta(a), NOMBRE_BASE_LEGADA)
  assert.ok(nombreBaseCuenta(a).endsWith(a))
})

test('el nombre de base no acepta valores vacíos ni identificadores arbitrarios', () => {
  for (const value of ['', null, undefined, '../../otra-base', 'usuario@correo.com', '123']) {
    assert.throws(() => nombreBaseCuenta(value), /inválido/)
  }
})

test('los UUID equivalentes con distinto uso de mayúsculas usan la misma base', () => {
  const uid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  assert.equal(nombreBaseCuenta(uid.toUpperCase()), nombreBaseCuenta(uid))
})
