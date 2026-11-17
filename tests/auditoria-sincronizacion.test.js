import test from 'node:test'
import assert from 'node:assert/strict'
import { crearSincronizador } from '../src/lib/sincronizador.js'

test('tres colisiones consecutivas no declaran nube sincronizada', async () => {
  let intentos = 0
  const estado = []
  const meta = { version: null, sucio: false }
  const s = crearSincronizador({
    remoto: {
      leer: async () => null,
      insertar: async () => { intentos++; return null },
    },
    local: {
      exportar: async () => ({ pedidos: [{ id: 1 }] }),
      tieneDatos: async () => true,
    },
    meta: { get: () => ({ ...meta }), set: x => Object.assign(meta, x) },
    alEstado: (fase, detalle) => estado.push({ fase, detalle }),
  })
  await s.sincronizar()
  s.detener()
  assert.equal(intentos, 3)
  assert.equal(estado.at(-1).fase, 'error')
  assert.match(estado.at(-1).detalle.message, /no se pudo confirmar/)
  assert.equal(meta.version, null)
  assert.ok(!estado.some(x => x.fase === 'ok'))
})

test('un cambio justo al pasar de comprobar datos a descarga mantiene el conflicto', async () => {
  const meta = { version: null, sucio: false }
  const estados = []
  let datos = { pedidos: [] }
  let sync
  let importaciones = 0
  sync = crearSincronizador({
    remoto: { leer: async () => ({ version: 2, datos: { pedidos: ['remotos'] } }) },
    local: {
      exportar: async () => structuredClone(datos),
      tieneDatos: async () => {
        // Microtarea en el límite entre la última comprobación y bajar().
        queueMicrotask(() => {
          datos = { pedidos: ['locales'] }
          sync.marcarCambio()
        })
        return false
      },
      importar: async x => { importaciones++; datos = structuredClone(x) },
    },
    meta: { get: () => ({ ...meta }), set: x => Object.assign(meta, x) },
    alEstado: fase => estados.push(fase),
  })
  await sync.sincronizar()
  sync.detener()
  assert.equal(estados.at(-1), 'conflicto')
  assert.deepEqual(datos.pedidos, ['locales'])
  assert.equal(importaciones, 0)
  assert.equal(meta.version, null)
})

test('una lectura y descarga sin cambios sigue concluyendo en estado correcto', async () => {
  const meta = { version: null, sucio: false }
  const estados = []
  let datos = { pedidos: [] }
  const s = crearSincronizador({
    remoto: { leer: async () => ({ version: 1, datos: { pedidos: ['nube'] } }) },
    local: {
      tieneDatos: async () => false,
      importar: async x => { datos = structuredClone(x) },
    },
    meta: { get: () => ({ ...meta }), set: x => Object.assign(meta, x) },
    alEstado: fase => estados.push(fase),
  })
  await s.sincronizar()
  s.detener()
  assert.equal(estados.at(-1), 'ok')
  assert.equal(meta.version, 1)
  assert.deepEqual(datos.pedidos, ['nube'])
})
