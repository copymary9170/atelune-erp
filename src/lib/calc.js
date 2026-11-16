// Cálculos puros (sin base de datos), probados en calc.test.js.
// Todos los montos están en dólares (USD). Los bolívares se obtienen con la tasa del día.

export const n = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export const redondear = (v, d = 2) => Math.round((n(v) + Number.EPSILON) * 10 ** d) / 10 ** d

// ---------- Inventario: costo promedio ponderado ----------
export function aplicarMovimiento(producto, { tipo, cantidad, costoUnitario }) {
  const stock = n(producto.stock)
  const costo = n(producto.costoPromedio)
  const cant = n(cantidad)
  if (cant <= 0 && tipo !== 'ajuste') throw new Error('La cantidad debe ser mayor que cero.')

  if (tipo === 'entrada') {
    const cu = n(costoUnitario)
    const nuevoStock = stock + cant
    const nuevoCosto = stock > 0 && nuevoStock > 0 ? (stock * costo + cant * cu) / nuevoStock : cu
    return { stock: nuevoStock, costoPromedio: nuevoCosto }
  }
  if (tipo === 'salida' || tipo === 'merma') {
    return { stock: stock - cant, costoPromedio: costo }
  }
  if (tipo === 'ajuste') {
    // En un ajuste, "cantidad" es el stock contado físicamente.
    return { stock: cant, costoPromedio: costo }
  }
  throw new Error('Tipo de movimiento desconocido: ' + tipo)
}

// ---------- Activos ----------
export function depreciacionMensual(a) {
  const vida = n(a.vidaUtilMeses)
  if (vida <= 0) return 0
  return Math.max(0, n(a.costo) - n(a.valorResidual)) / vida
}

export function mesesTranscurridos(desde, hasta = new Date()) {
  if (!desde) return 0
  const d = new Date(desde + 'T00:00:00')
  const m = (hasta.getFullYear() - d.getFullYear()) * 12 + (hasta.getMonth() - d.getMonth())
  return Math.max(0, m)
}

export function depreciacionAcumulada(a, hasta = new Date()) {
  const meses = Math.min(mesesTranscurridos(a.fechaCompra, hasta), n(a.vidaUtilMeses))
  return depreciacionMensual(a) * meses
}

// Costo de usar la máquina una hora: depreciación + mantenimiento repartidos
// entre las horas de uso al mes, más la electricidad que consume.
export function costoHoraActivo(a, costoKwh) {
  const horas = n(a.horasUsoMes)
  const fijo = horas > 0 ? (depreciacionMensual(a) + n(a.mantenimientoMensual)) / horas : 0
  const luz = (n(a.potenciaW) / 1000) * n(costoKwh)
  return fijo + luz
}

// ---------- Cotizador ----------
export function precioDesdeMargen(costo, margenPct) {
  // Margen sobre el precio de venta: si el margen es 40 %, el 40 % del precio es ganancia.
  const m = n(margenPct) / 100
  if (m >= 1) return Infinity
  return costo / (1 - m)
}

export function totalCostosFijos(config) {
  return (config.costosFijos || []).reduce((s, c) => s + n(c.monto), 0)
}

export function fijosPorPedido(config) {
  const p = n(config.pedidosEstimadosMes)
  return p > 0 ? totalCostosFijos(config) / p : 0
}

/**
 * Costo directo de un renglón de la cotización.
 * item: { cantidad, materiales:[{productoId,cantidad}], maquinas:[{activoId,minutos}],
 *         minutosDiseno, minutosProduccion, mermaPct, extras:[{concepto,monto}] }
 * Materiales, máquinas, minutos de producción y extras son POR UNIDAD;
 * el diseño se cobra una vez por renglón.
 */
export function costoItem(item, { productos, activos, config }) {
  const cant = Math.max(0, n(item.cantidad))
  const tarifa = n(config.tarifaHora)
  const merma = n(item.mermaPct ?? config.mermaPorDefecto) / 100

  const materialesBase = (item.materiales || []).reduce((s, m) => {
    const p = productos.find((x) => x.id === Number(m.productoId))
    return s + n(m.cantidad) * n(p?.costoPromedio)
  }, 0)
  const materiales = materialesBase * (1 + merma)
  const maquinas = (item.maquinas || []).reduce((s, m) => {
    const a = activos.find((x) => x.id === Number(m.activoId))
    return s + (n(m.minutos) / 60) * (a ? costoHoraActivo(a, config.costoKwh) : 0)
  }, 0)
  const produccion = (n(item.minutosProduccion) / 60) * tarifa
  const extras = (item.extras || []).reduce((s, e) => s + n(e.monto), 0)
  const diseno = (n(item.minutosDiseno) / 60) * tarifa

  const porUnidad = materiales + maquinas + produccion + extras
  return {
    materiales: materiales * cant,
    merma: materialesBase * merma * cant,
    maquinas: maquinas * cant,
    manoObra: produccion * cant + diseno,
    extras: extras * cant,
    total: porUnidad * cant + diseno,
  }
}

/** Calcula una cotización completa. */
export function calcularCotizacion(cot, { productos, activos, config }) {
  const items = cot.items || []
  const lineas = config.lineas || []
  const directos = items.map((it) => costoItem(it, { productos, activos, config }))
  const totalDirecto = directos.reduce((s, d) => s + d.total, 0)
  const fijos = items.length ? fijosPorPedido(config) : 0

  const renglones = items.map((it, i) => {
    const d = directos[i]
    // Los costos fijos del pedido se reparten según el peso de cada renglón.
    const parteFijos = totalDirecto > 0 ? (fijos * d.total) / totalDirecto : fijos / items.length
    const costo = d.total + parteFijos
    const linea = lineas.find((l) => l.id === Number(it.lineaId))
    const margen = it.margenPct !== '' && it.margenPct != null ? n(it.margenPct) : n(linea?.margenPct)
    const precioLista = precioDesdeMargen(costo, margen)
    const descuento = precioLista * (n(it.descuentoPct) / 100)
    const precio = precioLista - descuento
    const cant = n(it.cantidad)
    return {
      ...d,
      fijos: parteFijos,
      costo,
      margenPct: margen,
      precioLista,
      descuento,
      precio,
      precioUnitario: cant > 0 ? precio / cant : 0,
      ganancia: precio - costo,
    }
  })

  const costoTotal = renglones.reduce((s, r) => s + r.costo, 0)
  const subtotal = renglones.reduce((s, r) => s + r.precio, 0)
  const envio = n(cot.envio)
  const metodo = (config.metodosPago || [])[n(cot.metodoPagoIdx)]
  const comPct = n(metodo?.comisionPct) / 100
  // La comisión se suma al precio para que el negocio reciba lo calculado.
  const antesComision = subtotal + envio
  const conComision = comPct < 1 ? antesComision / (1 - comPct) : antesComision
  const comision = conComision - antesComision
  const iva = cot.aplicarIva ? conComision * (n(config.ivaPct) / 100) : 0
  const total = conComision + iva
  const ganancia = subtotal - costoTotal
  const tasa = n(cot.tasa)

  return {
    renglones,
    costoTotal,
    fijos,
    subtotal,
    envio,
    comision,
    iva,
    total,
    ganancia,
    margenReal: subtotal > 0 ? ganancia / subtotal : 0,
    totalBs: tasa > 0 ? total * tasa : null,
  }
}

/** Avisos de datos que faltan y harían que el cálculo quede incompleto. */
export function avisosCotizacion(cot, { productos, activos, config }) {
  const av = new Set()
  if (!n(config.tarifaHora)) av.add('Falta tu tarifa por hora (Configuración): la mano de obra se está calculando en $0.')
  if (config.mermaPorDefecto == null) av.add('Falta el % de merma por defecto (Configuración).')
  if (!n(config.pedidosEstimadosMes) && totalCostosFijos(config) > 0)
    av.add('Faltan los pedidos estimados al mes: los costos fijos no se están repartiendo.')
  if (!n(cot.tasa)) av.add('No hay tasa de cambio cargada: no se puede mostrar el total en Bs.')
  for (const it of cot.items || []) {
    const linea = (config.lineas || []).find((l) => l.id === Number(it.lineaId))
    if ((it.margenPct === '' || it.margenPct == null) && linea && linea.margenPct == null)
      av.add(`Falta el margen de la línea «${linea.nombre}» (Configuración).`)
    for (const m of it.materiales || []) {
      const p = productos.find((x) => x.id === Number(m.productoId))
      if (p && !n(p.costoPromedio)) av.add(`«${p.nombre}» no tiene costo: registra una compra en Inventario.`)
    }
    for (const m of it.maquinas || []) {
      const a = activos.find((x) => x.id === Number(m.activoId))
      if (a && !n(a.horasUsoMes)) av.add(`«${a.nombre}» no tiene horas de uso al mes (Activos).`)
      if (a && n(a.potenciaW) && !n(config.costoKwh)) av.add('Falta el costo del kWh (Configuración).')
    }
  }
  return [...av]
}
