import test from 'node:test'
import assert from 'node:assert/strict'
import { crearSincronizador } from '../src/lib/sincronizador.js'

function diferida() {
  let liberar
  const promesa = new Promise(resolve => { liberar = resolve })
  return { promesa, liberar }
}
function equipo(remoto, { version = null, sucio = false, pedidos = [] } = {}) {
  let datos = { pedidos: [...pedidos] }
  const meta = { version, sucio }
  const estados = []
  const sinc = crearSincronizador({
    remoto,
    local: {
      async exportar() { return structuredClone(datos) },
      async importar(x) { datos = structuredClone(x) },
      async tieneDatos() { return datos.pedidos.length > 0 },
    },
    meta: { get: () => ({ ...meta }), set: p => Object.assign(meta, p) },
    alEstado: fase => estados.push(fase),
  })
  return { sinc, meta, estados, editar: p => { datos.pedidos.push(p); sinc.marcarCambio() },
    get datos() { return datos } }
}

test('si dos dispositivos insertan a la vez, se vuelve a consultar sin declarar éxito prematuro', async () => {
  let lecturas = 0
  let inserciones = 0
  let copia = null
  const remoto = {
    async leer() { ++lecturas; return copia && structuredClone(copia) },
    async insertar(datos) {
      inserciones++
      if (inserciones === 1) {
        copia = { version: 1, datos: { pedidos: ['otro dispositivo'] } }
        return null
      }
      throw Error('No debe volver a insertar si ya existe una versión.')
    },
    async actualizar(datos, version) {
      if (version !== copia.version) return null
      copia = { version: version + 1, datos: structuredClone(datos) }
      return copia.version
    },
  }
  const pc = equipo(remoto, { pedidos: ['pedido local'] })
  await pc.sinc.sincronizar()
  assert.equal(lecturas, 2)
  assert.equal(inserciones, 1)
  assert.equal(pc.estados.at(-1), 'conflicto')
  assert.deepEqual(copia.datos.pedidos, ['otro dispositivo'])
  assert.deepEqual(pc.datos.pedidos, ['pedido local'])
})

test('cambio local durante la consulta en una sesión sin datos impide descargar', async () => {
  const respuesta = diferida()
  const remoto = { leer: () => respuesta.promesa }
  const pc = equipo(remoto)
  const proceso = pc.sinc.sincronizar()
  pc.editar('nuevo')
  respuesta.liberar({ version: 1, datos: { pedidos: ['remoto'] } })
  await proceso
  assert.equal(pc.estados.at(-1), 'conflicto')
  assert.deepEqual(pc.datos.pedidos, ['nuevo'])
})

test('si se edita mientras se consulta una resolución, se conserva el conflicto', async () => {
  const pendiente = diferida()
  let consultas = 0
  const remoto = {
    leer: () => (++consultas === 1 ? Promise.resolve({ version: 1, datos: { pedidos: ['nube'] } }) : pendiente.promesa),
  }
  const pc = equipo(remoto, { pedidos: ['local'] })
  await pc.sinc.sincronizar()
  assert.equal(pc.estados.at(-1), 'conflicto')
  const resolver = pc.sinc.resolver('nube')
  pc.editar('edición mientras se decide')
  pendiente.liberar({ version: 1, datos: { pedidos: ['nube'] } })
  await resolver
  assert.equal(pc.estados.at(-1), 'conflicto')
  assert.deepEqual(pc.datos.pedidos, ['local', 'edición mientras se decide'])
  assert.equal(pc.meta.sucio, true)
})

test('la elección explícita de nube sigue funcionando si no hubo cambios recientes', async () => {
  const remoto = { leer: async () => ({ version: 1, datos: { pedidos: ['nube'] } }) }
  const pc = equipo(remoto, { pedidos: ['local'] })
  await pc.sinc.sincronizar()
  assert.equal(pc.estados.at(-1), 'conflicto')
  await pc.sinc.resolver('nube')
  assert.deepEqual(pc.datos.pedidos, ['nube'])
  assert.equal(pc.estados.at(-1), 'ok')
  assert.equal(pc.meta.sucio, false)
})
