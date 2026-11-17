import { descuentoPorCantidad } from './escalas-cotizaciones.js'

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
  if (!Number.isFinite(Number(cantidad)) || cant < 0 || (cant === 0 && tipo !== 'ajuste')) throw new Error('Cantidad inválida.')

  if (tipo === 'entrada') {
    if (costoUnitario == null || !Number.isFinite(Number(costoUnitario)) || Number(costoUnitario) < 0) throw new Error('Costo unitario inválido.')
    const cu = n(costoUnitario)
    const nuevoStock = stock + cant
    const nuevoCosto = stock > 0 && nuevoStock > 0 ? (stock * costo + cant * cu) / nuevoStock : cu
    return { stock: nuevoStock, costoPromedio: nuevoCosto }
  }
  if (tipo === 'salida' || tipo === 'merma') {
    if (cant > stock + 1e-9) throw new Error('Stock insuficiente.')
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
// ---------- Personas ----------
/** Personas que trabajan en el negocio. Compatibilidad: si no hay lista, se usa la tarifa única anterior. */
export function personas(config) {
  if (Array.isArray(config.personas) && config.personas.length) return config.personas
  return [{ id: 1, nombre: 'Mary', tarifaHora: config.tarifaHora ?? null }]
}
export function responsable(item, config) {
  const ps = personas(config)
  return ps.find((p) => p.id === Number(item.personaId)) || ps[0]
}

export function costoItem(item, { productos, activos, config }) {
  const cant = Math.max(0, n(item.cantidad))
  const tarifa = n(responsable(item, config)?.tarifaHora)
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
    personaId: responsable(item, config)?.id ?? null,
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
    const escala = descuentoPorCantidad(it.cantidad, it.escalasCantidad)
    // Descuento manual y por volumen se combinan multiplicativamente; los
    // tramos NO se acumulan. Ningún descuento altera los costos reales.
    const manual = Math.min(100, Math.max(0, n(it.descuentoPct)))
    const precio = precioLista * (1 - manual / 100) * (1 - escala.descuentoPct / 100)
    const descuento = precioLista - precio
    const cant = n(it.cantidad)
    return {
      ...d,
      fijos: parteFijos,
      costo,
      margenPct: margen,
      precioLista,
      descuento,
      descuentoCantidadPct: escala.descuentoPct,
      umbralCantidad: escala.desde,
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
  for (const it of cot.items || []) {
    const r = responsable(it, config)
    if ((n(it.minutosDiseno) || n(it.minutosProduccion)) && !n(r?.tarifaHora))
      av.add(`Falta la tarifa por hora de ${r?.nombre || 'la persona responsable'} (Configuración): su mano de obra se está calculando en $0.`)
  }
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

// ---------- Pedidos ----------
/**
 * Materiales que consume un pedido (cantidad × uso por unidad), agrupados por producto.
 * La merma se cobra en el precio, pero no se descuenta del inventario por adelantado:
 * el desperdicio real se registra como movimiento de «Merma» (así 2 tazas descuentan 2, no 2,2).
 */
// eslint-disable-next-line no-unused-vars
export function consumoPedido(items, config) {
  const mapa = new Map()
  for (const it of items || []) {
    for (const m of it.materiales || []) {
      if (!m.productoId) continue
      const id = Number(m.productoId)
      const c = n(m.cantidad) * n(it.cantidad)
      mapa.set(id, (mapa.get(id) || 0) + c)
    }
  }
  return [...mapa].map(([productoId, cantidad]) => ({ productoId, cantidad })).filter((x) => x.cantidad > 0)
}

export const totalAbonos = (pedido) => (pedido.abonos || []).filter(a => !a.anulado).reduce((s, a) => s + n(a.monto), 0)
export const saldoPedido = (pedido) => n(pedido.total) - totalAbonos(pedido)

// ---------- Costo incompleto ----------
/** Datos de costo que faltan (no es lo mismo que un costo cero confirmado). */
export function faltantesDeCosto(cot, { productos, activos, config }) {
  const f = new Set()
  for (const it of cot.items || []) {
    for (const m of it.materiales || []) {
      const p = productos.find((x) => x.id === Number(m.productoId))
      if (p && !n(p.costoPromedio)) f.add(`Material sin costo: ${p.nombre}`)
    }
    for (const m of it.maquinas || []) {
      const a = activos.find((x) => x.id === Number(m.activoId))
      if (a && n(m.minutos) && !n(a.horasUsoMes)) f.add(`Máquina sin costo por hora: ${a.nombre}`)
    }
    const r = responsable(it, config)
    if ((n(it.minutosDiseno) || n(it.minutosProduccion)) && !n(r?.tarifaHora)) f.add(`Sin tarifa por hora: ${r?.nombre}`)
  }
  return [...f]
}

// ---------- Reparto de utilidades ----------
/**
 * regla: { destinos: [{ tipo: 'reinversion' | 'persona', personaId, pct }] } — los % suman 100.
 * La utilidad ya descuenta materiales, máquinas, mano de obra y costos fijos.
 * Devuelve montos con centavos conservados (el último destino con % absorbe el redondeo).
 */
export function validarRegla(regla) {
  const ds = regla?.destinos || []
  if (!ds.length) return 'No hay regla de reparto.'
  if (ds.some((d) => d.pct == null || d.pct === '')) return 'Faltan porcentajes en la regla de reparto.'
  if (ds.some((d) => n(d.pct) < 0)) return 'Hay porcentajes negativos.'
  const suma = ds.reduce((s, d) => s + n(d.pct), 0)
  if (Math.abs(suma - 100) > 0.001) return `Los porcentajes suman ${redondear(suma, 2)} %, deben sumar 100 %.`
  return null
}

export function repartir(utilidad, regla) {
  const error = validarRegla(regla)
  if (error) return { valido: false, motivo: error, destinos: [] }
  const u = redondear(utilidad, 2)
  if (!(u > 0)) return { valido: false, motivo: u < 0 ? 'Hay pérdida: no hay utilidad para repartir.' : 'No hay utilidad para repartir.', destinos: [] }
  const ds = regla.destinos.map((d) => ({ ...d, monto: Math.floor(u * n(d.pct)) / 100 }))
  const resto = redondear(u - ds.reduce((s, d) => s + d.monto, 0), 2)
  const ultimo = [...ds].reverse().find((d) => n(d.pct) > 0)
  if (ultimo) ultimo.monto = redondear(ultimo.monto + resto, 2)
  return { valido: true, utilidad: u, destinos: ds }
}

/** Mano de obra de un pedido por persona (de la copia guardada al crear el pedido). */
export function manoObraPorPersona(pedido) {
  const m = new Map()
  for (const pr of pedido.precios || []) {
    if (pr.manoObra == null) continue
    const k = pr.personaId ?? 0
    m.set(k, (m.get(k) || 0) + n(pr.manoObra))
  }
  return m
}

/** Utilidad del pedido después de costos y mano de obra (sin envío, recargos ni IVA). */
export function utilidadPedido(pedido) {
  const precios = pedido.precios || []
  return precios.reduce((s, x) => s + n(x.precio) - n(x.costo), 0)
}

// ---------- Compras con delivery ----------
/**
 * Reparte el delivery (u otro gasto común de la compra) entre las líneas.
 * modo 'costo': proporcional a lo pagado por cada línea; 'igual': partes iguales.
 * Conserva los centavos: la última línea absorbe el redondeo.
 */
export function repartirDelivery(costos, delivery, modo = 'costo') {
  const d = redondear(delivery, 2)
  const cs = costos.map((c) => n(c))
  if (!cs.length) return []
  if (!(d > 0)) return cs.map(() => 0)
  const total = cs.reduce((s, c) => s + c, 0)
  const igual = modo === 'igual' || !(total > 0)
  const partes = cs.map((c) => Math.floor((igual ? d / cs.length : (d * c) / total) * 100) / 100)
  partes[partes.length - 1] = redondear(partes[partes.length - 1] + d - partes.reduce((s, x) => s + x, 0), 2)
  return partes
}
