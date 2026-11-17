import test from 'node:test'
import assert from 'node:assert/strict'
import { CLAVE_PROPIETARIO, decidirAccesoLocal, leerPropietarioLocal, vincularPropietarioLocal } from '../src/lib/cuenta-local.js'
import { crearSincronizador } from '../src/lib/sincronizador.js'

test('datos de otra cuenta: acceso bloqueado aunque existan datos locales', () => {
  assert.equal(decidirAccesoLocal('usuario-B', 'usuario-A', true), 'bloqueada')
  assert.equal(decidirAccesoLocal('usuario-B', 'usuario-A', false), 'bloqueada')
  assert.equal(decidirAccesoLocal('usuario-A', 'usuario-A', true), 'permitida')
})

test('datos heredados sin propietario requieren confirmación; base vacía permite vincular', () => {
  assert.equal(decidirAccesoLocal('usuario-A', null, true), 'confirmar')
  assert.equal(decidirAccesoLocal('usuario-A', null, false), 'vincular')
  assert.equal(decidirAccesoLocal('', null, false), 'bloqueada')
})

test('no se puede cambiar un propietario local ya vinculado', () => {
  const antiguo = globalThis.localStorage
  const valores = new Map()
  globalThis.localStorage = {
    getItem: (k) => valores.get(k) ?? null,
    setItem: (k, v) => valores.set(k, v),
  }
  try {
    assert.equal(vincularPropietarioLocal('cuenta-A'), true)
    assert.equal(leerPropietarioLocal(), 'cuenta-A')
    assert.equal(valores.get(CLAVE_PROPIETARIO), 'cuenta-A')
    assert.throws(() => vincularPropietarioLocal('cuenta-B'), /otra cuenta/)
    assert.equal(leerPropietarioLocal(), 'cuenta-A')
  } finally {
    if (antiguo === undefined) delete globalThis.localStorage
    else globalThis.localStorage = antiguo
  }
})

test('si falla el almacenamiento, la vinculación se rechaza en lugar de abrir datos', () => {
  const antiguo = globalThis.localStorage
  globalThis.localStorage = { getItem() { throw new Error('Bloqueado') } }
  try { assert.throws(() => vincularPropietarioLocal('cuenta-A'), /Bloqueado/) }
  finally {
    if (antiguo === undefined) delete globalThis.localStorage
    else globalThis.localStorage = antiguo
  }
})

test('cerrar sesión mientras lee la nube impide importar datos y actualizar metadatos', async () => {
  let respuesta
  const pendiente = new Promise(resolve => { respuesta = resolve })
  let importaciones = 0
  const meta = { version: 1, sucio: false }
  const sync = crearSincronizador({
    remoto: { leer: () => pendiente },
    local: {
      importar: async () => { importaciones++ },
      tieneDatos: async () => false,
      exportar: async () => ({ pedidos: [] }),
    },
    meta: { get: () => ({ ...meta }), set: (m) => Object.assign(meta, m) },
  })
  const promesa = sync.sincronizar()
  sync.detener()
  respuesta({ version: 2, datos: { pedidos: ['ajenos'] } })
  await promesa
  assert.equal(importaciones, 0)
  assert.equal(meta.version, 1)
})
