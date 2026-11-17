import test from 'node:test'
import assert from 'node:assert/strict'
import { fechaEntregaPedido, reporteRentabilidad, desglosarPedido } from '../src/lib/reporte-rentabilidad.js'

const entrega = (fecha, extras = {}) => ({
  id: 1, numero: 1, estado: 'entregado', fecha: '2026-10-01',
  historial: [{ estado: 'aprobado', fecha: '2026-10-01' }, { estado: 'entregado', fecha }],
  cliente: 'Cliente ficticio', subtotal: 100, costoTotal: 60, ganancia: 40, costoIncompleto: [],
  items: [{ descripcion: 'Impresión A4', cantidad: 10, lineaId: 2 }, { descripcion: 'Topper', cantidad: 2, lineaId: 3 }],
  precios: [{ precio: 70, costo: 40, manoObra: 10 }, { precio: 30, costo: 20, manoObra: 5 }],
  ...extras,
})
const config = { lineas: [{ id: 2, nombre: 'Impresión' }, { id: 3, nombre: 'Manualidades' }] }
const opts = { desde: '2026-11-01', hasta: '2026-11-30', config }

test('toma la fecha de entrega, no de creación, para filtrar pedidos', () => {
  const p = entrega('2026-11-15T14:00:00')
  assert.equal(fechaEntregaPedido(p), '2026-11-15')
  assert.equal(reporteRentabilidad([p], opts).evaluados, 1)
  assert.equal(reporteRentabilidad([p], { desde:'2026-10-01', hasta:'2026-10-31' }).evaluados, 0)
})

test('suma presupuestos entregados y los agrupa sin duplicar ventas', () => {
  const p1 = entrega('2026-11-10T14:00:00')
  const p2 = entrega('2026-11-12T14:00:00', { id: 2, numero: 2, subtotal: 50, costoTotal: 25, precios: [
    { precio: 35, costo: 15 }, { precio: 15, costo: 10 },
  ] })
  const r = reporteRentabilidad([p1, p2], opts)
  assert.equal(r.ventasEvaluadas, 150)
  assert.equal(r.costosEvaluados, 85)
  assert.equal(r.utilidadEvaluada, 65)
  assert.equal(r.margenEvaluadoPct, 43.33)
  assert.equal(r.porLinea.find(x=>x.nombre==='Impresión').venta,105)
  assert.equal(r.porTrabajo.find(x=>x.nombre==='Topper').costo,30)
  assert.equal(r.porMes[0].nombre,'2026-11')
  assert.equal(r.porMes[0].venta,150)
  assert.equal(r.porLinea.reduce((s,x)=>s+x.venta,0), 150)
})

test('excluye cancelados, y reporta abiertos como presupuestos separados', () => {
  const p = entrega('2026-11-10T14:00:00')
  const r = reporteRentabilidad([p,
    { ...p, id:2, estado:'cancelado', subtotal:999 },
    { ...p, id:3, estado:'en_produccion', fecha:'2026-11-11', subtotal:400 },
  ], opts)
  assert.equal(r.ventasEvaluadas,100)
  assert.equal(r.abiertos,1)
  assert.equal(r.presupuestoAbierto,400)
})

test('no inventa costo cero para pedidos entregados incompletos', () => {
  const incompleto = entrega('2026-11-10T14:00:00', { costoTotal:null, costoIncompleto:['Falta papel'] })
  const r = reporteRentabilidad([incompleto], opts)
  assert.equal(r.incompletos,1)
  assert.equal(r.evaluados,0)
  assert.equal(r.ventasConocidas,100)
  assert.equal(r.ventasEvaluadas,0)
  assert.equal(r.utilidadEvaluada,0)
  assert.equal(r.filas[0].utilidad,null)
})

test('una entrega sin fecha válida no se atribuye a un mes inventado', () => {
  const p = entrega('2026-11-10T14:00:00',{ historial:[{ estado:'aprobado',fecha:'2026-10-01' }] })
  const r = reporteRentabilidad([p],opts)
  assert.equal(r.sinFecha,1)
  assert.equal(r.filas.length,0)
  assert.equal(fechaEntregaPedido(p),null)
})

test('desglose no concilia: se conserva la venta global pero no se reparte arbitrariamente', () => {
  const p = entrega('2026-11-10T14:00:00',{ precios:[{ precio:50, costo:40 },{ precio:30,costo:20 }] })
  const r = reporteRentabilidad([p], opts)
  assert.equal(desglosarPedido(p),null)
  assert.equal(r.ventasEvaluadas,100)
  assert.equal(r.sinDesglose,1)
  assert.equal(r.porLinea.length,0)
  assert.equal(r.avisos.length,1)
})

test('respeta líneas sin identificar y cantidades de trabajos; no altera datos', () => {
  const p = entrega('2026-11-10T14:00:00', { items:[{ descripcion:'Personalizado', cantidad: 6, lineaId:999 }],
    precios:[{precio:100,costo:60,manoObra:10}] })
  const original=JSON.stringify(p)
  const r=reporteRentabilidad([p],opts)
  assert.equal(r.porLinea[0].nombre,'Línea sin identificar')
  assert.equal(r.porTrabajo[0].cantidad,6)
  assert.equal(JSON.stringify(p),original)
})

test('rango invertido se rechaza y rango sin filtro conserva fechas', () => {
  assert.throws(()=>reporteRentabilidad([], {desde:'2026-12-01',hasta:'2026-11-01'}),/Rango/)
  const p=entrega('2026-09-01T10:00:00')
  assert.equal(reporteRentabilidad([p]).evaluados,1)
})

test('conserva utilidad negativa y margen negativo sin ocultar pérdidas', () => {
  const p=entrega('2026-11-10T14:00:00', {subtotal:20,costoTotal:40,
    items:[{ descripcion:'Impresión',lineaId:2,cantidad:2 }],
    precios:[{precio:20,costo:40}] })
  const r=reporteRentabilidad([p],opts)
  assert.equal(r.utilidadEvaluada,-20)
  assert.equal(r.margenEvaluadoPct,-100)
  assert.equal(r.porLinea[0].utilidad,-20)
})
