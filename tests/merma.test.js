import test from 'node:test'
import assert from 'node:assert/strict'
import { validarConsumo, resumenMateriales, consumoPrevisto } from '../src/lib/merma.js'
const prod = [{ id:1, nombre:'Opalina', unidadUso:'hoja', costoPromedio:.25 }, { id:2, nombre:'Vinil', unidadUso:'cm²', costoPromedio:null }]
const pedido = {items:[{descripcion:'Topper', cantidad:2, materiales:[{productoId:1,cantidad:1}]}],consumosReales:{'0':[{productoId:1, nombreMaterial:'Opalina', unidad:'hoja', usado:2, desperdicio:1, costoUnitario:.25}]}}
test('registra el costo y la cantidad útil más la merma',()=>{const r=resumenMateriales(pedido,prod); assert.equal(r.valorConocido,.75); assert.equal(r.lineas[0].diferencia,1)})
test('presupuesto por unidad multiplicado por número de productos',()=>assert.equal(consumoPrevisto(pedido.items[0],1),2))
test('no inventa costo para materiales sin precio',()=>{const r=validarConsumo({productoId:'2',usado:'10',desperdicio:'0'},prod); assert.equal(r.costoUnitario,null); const s=resumenMateriales({items:[{}],consumosReales:{0:[r]}});assert.equal(s.costoIncompleto,1)})
test('diferencia desconocida cuando material no fue presupuestado',()=>{const r=resumenMateriales({items:[{cantidad:1}],consumosReales:{0:[{productoId:1,usado:1,desperdicio:0,costoUnitario:.25}]}},prod);assert.equal(r.lineas[0].diferencia,null)})
test('rechaza merma negativa, campos vacíos y material inexistente',()=>{for(const f of [{productoId:1,usado:1,desperdicio:-1},{productoId:1,usado:'',desperdicio:0},{productoId:4,usado:1,desperdicio:0},{productoId:1,usado:1,desperdicio:''}])assert.throws(()=>validarConsumo(f,prod))})
test('cálculo puro no modifica pedido',()=>{const antes=JSON.stringify(pedido);resumenMateriales(pedido,prod);assert.equal(JSON.stringify(pedido),antes)})
