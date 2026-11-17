import test from 'node:test'
import assert from 'node:assert/strict'
import { crearRuta } from '../src/lib/produccion.js'
import { validarTiempo, resumenTiempos, tiempoLegible } from '../src/lib/tiempos.js'
const ruta = crearRuta('topper')
test('valida sesión por etapa y responsable', () => {
 const r = validarTiempo({ etapa: 'corte', minutos: '45', tarifaHora: '4', responsable: '  Mary ', nota: '  manual ' }, ruta)
 assert.deepEqual(r, { etapa: 'corte', minutos: 45, tarifaHora: 4, responsable: 'Mary', nota: 'manual' })
})
test('no inventa tarifa faltante y distingue costo incompleto', () => {
 const r = validarTiempo({ etapa: 'diseno', minutos: 30, tarifaHora: '', responsable: 'Ana' }, ruta)
 assert.equal(r.tarifaHora, null)
 assert.deepEqual(resumenTiempos([r, { minutos: 90, tarifaHora: 8 }]), { minutos: 120, costoConocido: 12, sinTarifa: 1, registros: 2 })
})
test('rechaza tiempo inválido, tarifa negativa y etapa inexistente', () => {
 for (const tiempo of [0, -1, 'x', 1441]) assert.throws(() => validarTiempo({ etapa: 'corte', minutos: tiempo, tarifaHora: 1, responsable: 'M' }, ruta))
 assert.throws(() => validarTiempo({ etapa: 'corte', minutos: 15, tarifaHora: -1, responsable: 'M' }, ruta))
 assert.throws(() => validarTiempo({ etapa: 'planchado', minutos: 15, tarifaHora: 1, responsable: 'M' }, ruta))
})
test('formato de tiempo y ausencia de registros', () => {
 assert.equal(tiempoLegible(135), '2 h 15 min')
 assert.deepEqual(resumenTiempos(), { minutos: 0, costoConocido: 0, sinTarifa: 0, registros: 0 })
})
