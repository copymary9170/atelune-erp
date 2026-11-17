import test from 'node:test'
import assert from 'node:assert/strict'
import { crearSincronizador } from '../src/lib/sincronizador.js'

function diferida() {
  let resolver
  const promesa = new Promise((resolve) => { resolver = resolve })
  return { promesa, resolver }
}
function equipo({ remoto, version = null, sucio = false, pedidos = [], tieneDatos } = {}) {
  let datos = { pedidos: [...pedidos] }
  const meta = { version, sucio }
  const estados = []
  const s = crearSincronizador({
    remoto,
    local: {
      exportar: async () => structuredClone(datos),
      importar: async (nuevos) => { datos = structuredClone(nuevos) },
      tieneDatos: tieneDatos ?? (async () => datos.pedidos.length > 0),
    },
    meta: { get: () => ({ ...meta }), set: (p) => Object.assign(meta, p) },
    alEstado: (fase) => estados.push(fase),
  })
  return {
    s, meta, estados,
    editar(valor) { datos.pedidos.push(valor); s.marcarCambio() },
    get pedidos() { return datos.pedidos },
  }
}

test('una edición durante la consulta remota produce conflicto y no se sobrescribe', async () => {
  const respuesta = diferida()
  const remoto = { leer: () => respuesta.promesa }
  const pc = equipo({ remoto, version: 1, pedidos: ['original'] })
  const sync = pc.s.sincronizar()
  pc.editar('cambio durante consulta')
  respuesta.resolver({ version: 2, datos: { pedidos: ['nube'] } })
  await sync
  assert.equal(pc.estados.at(-1), 'conflicto')
  assert.deepEqual(pc.pedidos, ['original', 'cambio durante consulta'])
  assert.equal(pc.meta.sucio, true)
})

test('edición durante consulta de datos locales vacíos se conserva', async () => {
  const verificacion = diferida()
  const pc = equipo({
    remoto: { leer: async () => ({ version: 1, datos: { pedidos: ['nube'] } }) },
    tieneDatos: () => verificacion.promesa,
  })
  const sync = pc.s.sincronizar()
  // Esperar hasta que se invoque tieneDatos, sin retrasos arbitrarios.
  await Promise.resolve()
  await Promise.resolve()
  pc.editar('nuevo pedido')
  verificacion.resolver(false)
  await sync
  assert.equal(pc.estados.at(-1), 'conflicto')
  assert.deepEqual(pc.pedidos, ['nuevo pedido'])
})

test('resolver usando la nube no descarga una versión antigua de un conflicto', async () => {
  let nube = { version: 1, datos: { pedidos: ['nube 1'] } }
  const pc = equipo({ remoto: { leer: async () => structuredClone(nube) }, pedidos: ['local'] })
  await pc.s.sincronizar()
  assert.equal(pc.estados.at(-1), 'conflicto')
  nube = { version: 2, datos: { pedidos: ['nube 2'] } }
  await pc.s.resolver('nube')
  assert.equal(pc.estados.at(-1), 'conflicto')
  assert.deepEqual(pc.pedidos, ['local'])
  await pc.s.resolver('nube')
  assert.deepEqual(pc.pedidos, ['nube 2'])
  assert.equal(pc.meta.version, 2)
})
