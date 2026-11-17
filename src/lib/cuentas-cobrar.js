// Estado de cartera a partir de pedidos y abonos YA registrados.
// Es un informe de saldos ACTUALES; nunca reconstruye saldos históricos.
const red = v => Math.round((v + Number.EPSILON) * 100) / 100
const importe = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
const fechaValida = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(new Date(v + 'T12:00:00Z').getTime()) &&
  new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v

export function reporteCuentasPorCobrar(pedidos, fechaReferencia) {
  if (!fechaValida(fechaReferencia)) throw new Error('Fecha de referencia inválida.')
  const filas = []
  const resumen = { totalPendiente: 0, vencido: 0, porVencer: 0, sinFecha: 0, porCobrarEntregado: 0,
    cantidadPendiente: 0, cantidadVencida: 0, excesoAbonos: 0, casosExcluidos: 0 }
  const avisos = []
  for (const p of pedidos || []) {
    if (p.estado === 'cancelado') continue // Los reembolsos requieren conciliación independiente.
    const total = importe(p.total)
    const abonos = (p.abonos || []).filter(a => !a.anulado)
    const invalidos = abonos.filter(a => importe(a.monto) === null)
    if (total === null || invalidos.length) {
      resumen.casosExcluidos++
      avisos.push('Pedido ' + (p.numero ?? p.id ?? 'sin número') + ': total o abonos inválidos; revisar antes de calcular deuda.')
      continue
    }
    const cobrado = red(abonos.reduce((s, a) => s + a.monto, 0))
    const saldo = red(total - cobrado)
    if (saldo < 0) resumen.excesoAbonos = red(resumen.excesoAbonos - saldo)
    if (saldo <= 0) continue
    const entrega = fechaValida(p.fechaEntrega) ? p.fechaEntrega : null
    const tipo = entrega === null ? 'sin_fecha' : entrega < fechaReferencia ? 'vencido' : 'por_vencer'
    const fila = { id: p.id, numero: p.numero, cliente: p.cliente || 'Sin cliente',
      fechaPedido: p.fecha || '', fechaEntrega: entrega, estado: p.estado,
      total: red(total), cobrado, pendiente: saldo, clasificacion: tipo }
    filas.push(fila)
    resumen.totalPendiente = red(resumen.totalPendiente + saldo)
    resumen.cantidadPendiente++
    if (p.estado === 'entregado') resumen.porCobrarEntregado = red(resumen.porCobrarEntregado + saldo)
    if (tipo === 'vencido') {
      resumen.vencido = red(resumen.vencido + saldo)
      resumen.cantidadVencida++
    } else if (tipo === 'sin_fecha') resumen.sinFecha = red(resumen.sinFecha + saldo)
    else resumen.porVencer = red(resumen.porVencer + saldo)
  }
  // Agrupación por cliente: priorizar clienteId cuando está disponible.
  // Un cliente sin nombre/ID no debe absorber las deudas de otros anónimos.
  const mapaClientes = new Map()
  for (const f of filas) {
    const p = (pedidos || []).find(x => x.id === f.id)
    const nombre = String(f.cliente || '').trim()
    const tieneNombre = nombre && nombre !== 'Sin cliente'
    const clave = p?.clienteId != null ? 'id:' + p.clienteId
      : tieneNombre ? 'nombre:' + nombre.toLocaleLowerCase('es-VE').replace(/\\s+/g, ' ')
      : 'pedido:' + f.id
    if (!mapaClientes.has(clave)) mapaClientes.set(clave, {
      clave, nombre: tieneNombre ? nombre : 'Sin cliente (pedido ' + f.numero + ')',
      totalPendiente: 0, entregadoPendiente: 0, fueraDeFechaEntrega: 0, pedidos: 0,
    })
    const grupo = mapaClientes.get(clave)
    grupo.totalPendiente = red(grupo.totalPendiente + f.pendiente)
    grupo.pedidos++
    if (f.estado === 'entregado') grupo.entregadoPendiente = red(grupo.entregadoPendiente + f.pendiente)
    if (f.clasificacion === 'vencido') grupo.fueraDeFechaEntrega = red(grupo.fueraDeFechaEntrega + f.pendiente)
  }
  const porCliente = [...mapaClientes.values()].sort((a,b) =>
    b.totalPendiente - a.totalPendiente || a.nombre.localeCompare(b.nombre, 'es-VE'))

  filas.sort((a, b) => {
    const x = a.fechaEntrega || '9999-99-99', y = b.fechaEntrega || '9999-99-99'
    return x.localeCompare(y) || (a.numero || 0) - (b.numero || 0)
  })
  return { filas, resumen, avisos, fechaReferencia, porCliente }
}
