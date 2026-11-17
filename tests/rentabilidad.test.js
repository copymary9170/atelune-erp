import test from 'node:test'
import assert from 'node:assert/strict'
import { fichaRentabilidad } from '../src/lib/rentabilidad.js'
const base = () => ({ estado: 'entregado', subtotal: 50, costoTotal: 30, ganancia: 20, items: [{ descripcion: 'Topper' }], precios: [{ costo: 30, manoObra: 10 }], tiemposProduccion: { '0': [{ minutos: 120, tarifaHora: 4 }] }, costoIncompleto: [] })
test('sustituye la mano de obra en lugar de sumarla dos veces', () => {
 const f = fichaRentabilidad(base()); assert.equal(f.manoObraRegistrada, 8); assert.equal(f.costoAjustado, 28); assert.equal(f.utilidadAjustada, 22)
})
test('no presenta utilidad ajustada con tarifas sin definir', () => {
 const p = base(); p.tiemposProduccion['0'].push({ minutos: 30, tarifaHora: null }); const f = fichaRentabilidad(p)
 assert.equal(f.aptoProyeccion, false); assert.equal(f.utilidadAjustada, null); assert.equal(f.manoObraRegistrada, 8)
})
test('bloquea proyeccion si falta un trabajo o su costo', () => {
 const p = base(); p.items.push({ descripcion: 'Sublimación' }); p.precios.push({ costo: 12, manoObra: 4 });
 assert.equal(fichaRentabilidad(p).aptoProyeccion, false)
 delete p.precios[1].manoObra; assert.equal(fichaRentabilidad(p).manoObraPresupuestada, null)
})
test('no convierte costos incompletos en cifras confiables', () => {
 const p = base(); p.costoIncompleto = ['Falta el costo del papel']; assert.equal(fichaRentabilidad(p).costoAjustado, null)
})
test('no interpreta pedido antiguo sin costos como costo cero', () => {
 const p = base(); delete p.costoTotal; delete p.precios; const f = fichaRentabilidad(p)
 assert.equal(f.costoPresupuestado, null); assert.equal(f.costoAjustado, null)
})
test('proyección antes de entrega lleva aviso de provisionalidad', () => {
 const p = base(); p.estado = 'en_produccion'; const f = fichaRentabilidad(p)
 assert.equal(f.pendienteConfirmacion, true); assert.ok(f.avisos.some(x => x.includes('no está entregado')))
})
test('no modifica el pedido original', () => {
 const p = base(); const antes = JSON.stringify(p); fichaRentabilidad(p); assert.equal(JSON.stringify(p), antes)
})
