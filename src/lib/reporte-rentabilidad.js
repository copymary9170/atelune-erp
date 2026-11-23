// Reportes de gestión (no crean asientos ni tocan pedidos).
// Ingresos de trabajos = subtotal, sin delivery, recargos ni IVA.
// Costos y utilidad son los PRESUPUESTADOS congelados en cada pedido.
// No equivalen a utilidad fiscal, beneficio neto del negocio ni efectivo cobrado.
import { fechaContable } from './format.js'

const numero = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null
const red = v => Math.round((v + Number.EPSILON) * 100) / 100

function fechaValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [anio, mes, dia] = s.split('-').map(Number)
  if (anio < 1 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false
  const d = new Date(0)
  d.setUTCFullYear(anio, mes - 1, dia)
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
}

export function fechaEntregaPedido(pedido) {
  if (pedido?.estado !== 'entregado') return null
  const historial = Array.isArray(pedido.historial) ? pedido.historial : []
  const h = [...historial].reverse().find(e => e?.estado === 'entregado' && e.fecha)
  if (!h || typeof h.fecha !== 'string') return null
  if (fechaValida(h.fechaContable)) return h.fechaContable
  if (/^\d{4}-\d{2}-\d{2}$/.test(h.fecha)) return fechaValida(h.fecha) ? h.fecha : null
  // Rechazar fechas imposibles en el origen; Date puede normalizar 30/feb a marzo.
  const prefijo = /^\d{4}-\d{2}-\d{2}/.exec(h.fecha)?.[0]
  if (!prefijo || !fechaValida(prefijo)) return null
  // Convertir el timestamp al día local igual que Contabilidad y la interfaz.
  // Esto evita desplazar entregas cerca de medianoche a un mes equivocado.
  const local = fechaContable(h.fecha)
  return fechaValida(local) ? local : null
}

function agregar(mapa, clave, nombre, venta, costo, cantidad = 0) {
  let v = mapa.get(clave)
  if (!v) { v = { clave, nombre, venta: 0, costo: 0, cantidad: 0, trabajos: 0 }; mapa.set(clave, v) }
  v.venta += venta
  v.costo += costo
  v.cantidad += cantidad
  v.trabajos++
}
function ordenar(m) {
  return [...m.values()].map(x => ({
    ...x, venta: red(x.venta), costo: red(x.costo), utilidad: red(x.venta - x.costo),
    margenPct: x.venta > 0 ? red((x.venta - x.costo) / x.venta * 100) : null,
  })).sort((a, b) => b.venta - a.venta || a.nombre.localeCompare(b.nombre))
}

/** Desglosa por línea de servicio y descripción cuando los renglones concilian
 *  con el subtotal/costo presupuestado guardado. Si falta algún dato, NO reparte
 *  una diferencia ficticia entre trabajos: indica desglose incompleto. */
export function desglosarPedido(pedido) {
  const items = pedido.items || []
  const precios = pedido.precios || []
  if (!items.length || precios.length !== items.length) return null
  const lineas = items.map((item, i) => {
    const venta = numero(precios[i]?.precio), costo = numero(precios[i]?.costo)
    if (venta === null || costo === null) return null
    return { lineaId: item.lineaId, descripcion: item.descripcion || 'Trabajo sin descripción',
      cantidad: Number(item.cantidad) > 0 ? Number(item.cantidad) : 0, venta, costo }
  })
  if (lineas.some(x => !x)) return null
  if (Math.abs(lineas.reduce((s, x) => s + x.venta, 0) - pedido.subtotal) > 0.02) return null
  if (Math.abs(lineas.reduce((s, x) => s + x.costo, 0) - pedido.costoTotal) > 0.02) return null
  return lineas
}

/** No incluye pedidos cancelados, no entregados ni cotizaciones sin pedido.
 *  Las ventas con costo incompleto se muestran separadas de la rentabilidad.
 *  La proyección de pedidos abiertos se muestra solo como referencia aparte. */
export function reporteRentabilidad(pedidos, { desde = '', hasta = '', config = {} } = {}) {
  if ((desde && !fechaValida(desde)) || (hasta && !fechaValida(hasta)) || (desde && hasta && desde > hasta))
    throw new Error('Rango de fechas inválido.')
  const porLinea = new Map(), porTrabajo = new Map(), porMes = new Map()
  const filas = [], avisos = []
  let ventasConocidas = 0, ventasEvaluadas = 0, costosEvaluados = 0
  let evaluados = 0, incompletos = 0, sinFecha = 0, sinDesglose = 0
  let abiertos = 0, presupuestoAbierto = 0
  for (const p of pedidos || []) {
    if (p.estado === 'cancelado') continue
    if (p.estado !== 'entregado') {
      if (!p.fecha || ((!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta))) {
        abiertos++
        if (numero(p.subtotal) !== null) presupuestoAbierto += p.subtotal
      }
      continue
    }
    const entrega = fechaEntregaPedido(p)
    if (!entrega) { sinFecha++; continue }
    if ((desde && entrega < desde) || (hasta && entrega > hasta)) continue
    const venta = numero(p.subtotal), costo = numero(p.costoTotal)
    const pendiente = !!p.costoIncompleto?.length || venta === null || costo === null
    if (venta !== null) ventasConocidas += venta
    if (pendiente) incompletos++
    else {
      evaluados++; ventasEvaluadas += venta; costosEvaluados += costo
      const mes = entrega.slice(0, 7)
      agregar(porMes, mes, mes, venta, costo)
      const desglosado = desglosarPedido(p)
      if (!desglosado) sinDesglose++
      else {
        for (const l of desglosado) {
          const linea = (config.lineas || []).find(x => String(x.id) === String(l.lineaId))
          const nombreLinea = linea?.nombre || 'Línea sin identificar'
          agregar(porLinea, String(l.lineaId ?? 'sin-linea'), nombreLinea, l.venta, l.costo, l.cantidad)
          agregar(porTrabajo, (l.descripcion || '').trim().toLowerCase(), l.descripcion, l.venta, l.costo, l.cantidad)
        }
      }
    }
    filas.push({ id: p.id, numero: p.numero, cliente: p.cliente || '', fecha: entrega,
      venta, costo: pendiente ? null : costo, utilidad: pendiente ? null : red(venta - costo),
      margenPct: pendiente || venta === 0 ? null : red((venta - costo) / venta * 100),
      incompleto: pendiente, desgloseDisponible: !pendiente && !!desglosarPedido(p) })
  }
  if (incompletos) avisos.push(`${incompletos} pedido(s) entregado(s) tienen costos o ventas incompletos; no se incluyen en la utilidad.`)
  if (sinFecha) avisos.push(`${sinFecha} pedido(s) entregado(s) no tienen fecha de entrega válida; quedan fuera del período.`)
  if (sinDesglose) avisos.push(`${sinDesglose} pedido(s) evaluados no tienen detalle de trabajos conciliado; aparecen en el total, pero no en el desglose por línea o producto.`)
  return {
    filas: filas.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.numero || 0) - (a.numero || 0)),
    ventasConocidas: red(ventasConocidas), ventasEvaluadas: red(ventasEvaluadas),
    costosEvaluados: red(costosEvaluados), utilidadEvaluada: red(ventasEvaluadas - costosEvaluados),
    margenEvaluadoPct: ventasEvaluadas > 0 ? red((ventasEvaluadas - costosEvaluados) / ventasEvaluadas * 100) : null,
    evaluados, incompletos, sinFecha, sinDesglose, abiertos,
    presupuestoAbierto: red(presupuestoAbierto), porLinea: ordenar(porLinea),
    porTrabajo: ordenar(porTrabajo), porMes: ordenar(porMes), avisos,
  }
}
