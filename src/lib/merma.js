// Observaciones de consumo: nunca ejecutan movimientos de inventario.
const valido = v => typeof v === 'number' && Number.isFinite(v) && v >= 0
const cantidadValida = v => typeof v === 'number' && Number.isFinite(v) && v > 0

export function validarConsumo(formulario, productos) {
  const id = Number(formulario.productoId)
  const producto = productos.find(p => p.id === id)
  if (!producto) throw new Error('Selecciona un material existente')
  const usado = Number(formulario.usado)
  const desperdicio = Number(formulario.desperdicio)
  if (!cantidadValida(usado)) throw new Error('La cantidad útil debe ser mayor que cero')
  if (formulario.desperdicio === '' || formulario.desperdicio == null || !valido(desperdicio)) throw new Error('Indica la merma; usa 0 si no hubo desperdicio')
  if (usado > 100000000 || desperdicio > 100000000) throw new Error('Cantidad fuera de rango')
  const costo = producto.costoPromedio
  return { productoId: id, nombreMaterial: producto.nombre, unidad: producto.unidadUso || 'unidad',
    usado, desperdicio, costoUnitario: valido(costo) ? costo : null,
    nota: String(formulario.nota || '').trim().slice(0, 500) }
}

// La cantidad del presupuesto es por unidad del trabajo, y se multiplica por las unidades vendidas.
export function consumoPrevisto(item, productoId) {
  if (!item || !cantidadValida(Number(item.cantidad))) return null
  const mats = (item.materiales || []).filter(x => Number(x.productoId) === Number(productoId))
  return mats.length ? mats.reduce((s, m) => s + Number(m.cantidad || 0) * Number(item.cantidad), 0) : null
}

export function resumenMateriales(pedido, productos = []) {
  const trabajos = Array.isArray(pedido?.items) ? pedido.items : []
  const registros = pedido?.consumosReales || {}
  let valorConocido = 0
  let costoIncompleto = 0
  let registrosTotales = 0
  const lineas = []
  trabajos.forEach((trabajo, i) => {
    const porMaterial = new Map()
    for (const x of Array.isArray(registros[String(i)]) ? registros[String(i)] : []) {
      const id = Number(x.productoId)
      const key = String(id)
      if (!porMaterial.has(key)) porMaterial.set(key, { productoId:id, nombre: x.nombreMaterial || productos.find(p=>p.id===id)?.nombre || 'Material desconocido', unidad:x.unidad || '', util:0, merma:0, costo:0, sinCosto:0, entradas:0 })
      const linea = porMaterial.get(key)
      const u = Number(x.usado), m = Number(x.desperdicio)
      if (!cantidadValida(u) || !valido(m)) { linea.sinCosto++; costoIncompleto++; continue }
      linea.util += u; linea.merma += m; linea.entradas++; registrosTotales++
      if (valido(x.costoUnitario)) {const v = (u + m)*x.costoUnitario; linea.costo += v; valorConocido += v}
      else { linea.sinCosto++; costoIncompleto++ }
    }
    for (const l of porMaterial.values()) {
      const previsto = consumoPrevisto(trabajo, l.productoId)
      lineas.push({ ...l, trabajo: i, descripcion: trabajo.descripcion || `Trabajo ${i+1}`, previsto, total: l.util + l.merma, diferencia: previsto == null ? null : l.util + l.merma - previsto })
    }
  })
  return { lineas, valorConocido, costoIncompleto, registrosTotales,
    trabajosSinRegistros: trabajos.filter((_,i) => !Array.isArray(registros[String(i)]) || !registros[String(i)].length).length }
}
