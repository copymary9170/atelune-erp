import test from 'node:test'
import assert from 'node:assert/strict'
import { validarRespaldo } from '../src/db.js'

const respaldoBase = () => ({
  app: 'atelune-erp',
  version: 1,
  config: [{ id: 'general', nombreNegocio: 'Prueba' }],
  productos: [{ id: 1, nombre: 'Papel' }],
  movimientos: [],
  pedidos: [],
})

test('acepta respaldos válidos de la aplicación', () => {
  assert.equal(validarRespaldo(respaldoBase()), true)
})

test('rechaza archivos externos y versiones incompatibles antes de restaurar', () => {
  assert.throws(() => validarRespaldo({ ...respaldoBase(), app: 'externo' }), /incompatible/)
  assert.throws(() => validarRespaldo({ ...respaldoBase(), version: 99 }), /incompatible/)
})

test('rechaza configuración faltante y tablas malformadas', () => {
  assert.throws(() => validarRespaldo({ ...respaldoBase(), config: [] }), /configuración/)
  assert.throws(() => validarRespaldo({ ...respaldoBase(), productos: 'sobrescribir' }), /Tabla inválida/)
  assert.throws(() => validarRespaldo({ ...respaldoBase(), productos: [null] }), /Tabla inválida/)
})

test('permite formatos antiguos que no incluyen tablas nuevas; la importación verifica si contienen datos', () => {
  const { movimientos, pedidos, ...antiguo } = respaldoBase()
  assert.equal(validarRespaldo(antiguo), true)
})
