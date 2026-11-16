import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearSincronizador } from '../src/lib/sincronizador.js'

// Nube falsa compartida por varios «dispositivos».
function nubeFalsa() {
  const n = { fila: null, caida: false }
  n.remoto = {
    async leer() { if (n.caida) throw new Error('Failed to fetch'); return n.fila && structuredClone(n.fila) },
    async insertar(datos) { n.fila = { datos: structuredClone(datos), version: 1 }; return 1 },
    async actualizar(datos, v) {
      if (n.caida) throw new Error('Failed to fetch')
      if (!n.fila || n.fila.version !== v) return null
      n.fila = { datos: structuredClone(datos), version: v + 1 }; return v + 1
    },
  }
  return n
}
function dispositivo(nube, datosIniciales = { pedidos: [] }) {
  const d = { datos: structuredClone(datosIniciales), m: { version: null, sucio: false }, estados: [] }
  d.s = crearSincronizador({
    remoto: nube.remoto,
    local: {
      async exportar() { return structuredClone(d.datos) },
      async importar(x) { d.datos = structuredClone(x) },
      async tieneDatos() { return d.datos.pedidos.length > 0 },
    },
    meta: { get: () => ({ ...d.m }), set: (p) => Object.assign(d.m, p) },
    alEstado: (e) => d.estados.push(e),
  })
  d.editar = (p) => { d.datos.pedidos.push(p); d.s.marcarCambio() }
  return d
}
const ultimo = (d) => d.estados.at(-1)

test('primer dispositivo sube; el segundo (vacío) baja', async () => {
  const nube = nubeFalsa()
  const pc = dispositivo(nube, { pedidos: ['A'] })
  await pc.s.sincronizar()
  assert.equal(nube.fila.version, 1)
  const cel = dispositivo(nube)
  await cel.s.sincronizar()
  assert.deepEqual(cel.datos.pedidos, ['A'])
  assert.equal(ultimo(cel), 'ok')
})

test('los cambios viajan entre dispositivos', async () => {
  const nube = nubeFalsa()
  const pc = dispositivo(nube); const cel = dispositivo(nube)
  await pc.s.sincronizar(); await cel.s.sincronizar()
  pc.editar('B'); await pc.s.sincronizar()
  assert.equal(nube.fila.version, 2)
  await cel.s.sincronizar()
  assert.deepEqual(cel.datos.pedidos, ['B'])
  cel.editar('C'); await cel.s.sincronizar(); await pc.s.sincronizar()
  assert.deepEqual(pc.datos.pedidos, ['B', 'C'])
  assert.equal(pc.m.sucio, false)
})

test('cambios en ambos lados: pide elegir y no pisa nada', async () => {
  const nube = nubeFalsa()
  const pc = dispositivo(nube); const cel = dispositivo(nube)
  await pc.s.sincronizar(); await cel.s.sincronizar()
  pc.editar('PC'); await pc.s.sincronizar()
  cel.editar('CEL'); await cel.s.sincronizar()
  assert.equal(ultimo(cel), 'conflicto')
  assert.deepEqual(nube.fila.datos.pedidos, ['PC']) // la nube no se tocó
  assert.deepEqual(cel.datos.pedidos, ['CEL']) // lo local tampoco
  await cel.s.resolver('local')
  assert.deepEqual(nube.fila.datos.pedidos, ['CEL'])
  await pc.s.sincronizar()
  assert.deepEqual(pc.datos.pedidos, ['CEL'])
})

test('resolver quedándose con la nube', async () => {
  const nube = nubeFalsa()
  const pc = dispositivo(nube, { pedidos: ['PC'] }); await pc.s.sincronizar()
  const cel = dispositivo(nube, { pedidos: ['viejo'] }) // ya tenía datos locales
  await cel.s.sincronizar()
  assert.equal(ultimo(cel), 'conflicto')
  await cel.s.resolver('nube')
  assert.deepEqual(cel.datos.pedidos, ['PC'])
  assert.equal(cel.m.version, 1)
})

test('sin internet: queda pendiente y sube al volver', async () => {
  const nube = nubeFalsa()
  const pc = dispositivo(nube); await pc.s.sincronizar()
  nube.caida = true
  pc.editar('X'); await pc.s.sincronizar()
  assert.equal(ultimo(pc), 'sin_conexion')
  assert.equal(pc.m.sucio, true)
  nube.caida = false
  await pc.s.sincronizar()
  assert.deepEqual(nube.fila.datos.pedidos, ['X'])
  assert.equal(pc.m.sucio, false)
})

test('bajar datos de la nube no cuenta como cambio local', async () => {
  const nube = nubeFalsa()
  const pc = dispositivo(nube, { pedidos: ['A'] }); await pc.s.sincronizar()
  const cel = dispositivo(nube)
  // Como en la app real: al importar, los «hooks» de la base avisan de un cambio.
  const s2 = crearSincronizador({
    remoto: nube.remoto,
    local: {
      async exportar() { return structuredClone(cel.datos) },
      async importar(x) { cel.datos = structuredClone(x); s2.marcarCambio() },
      async tieneDatos() { return cel.datos.pedidos.length > 0 },
    },
    meta: { get: () => ({ ...cel.m }), set: (p) => Object.assign(cel.m, p) },
  })
  await s2.sincronizar()
  assert.deepEqual(cel.datos.pedidos, ['A'])
  assert.equal(cel.m.sucio, false)
})
