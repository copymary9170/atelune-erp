import Dexie from 'dexie'
import { aplicarMovimiento, calcularCotizacion, consumoPedido, faltantesDeCosto, personas } from './lib/calc.js'

// Base de datos local (IndexedDB, dentro del navegador).
// Toda la lógica de datos pasa por este archivo para poder migrar
// a una base en la nube (p. ej. Supabase) más adelante sin reescribir pantallas.
export const db = new Dexie('atelune-erp')

db.version(1).stores({
  config: 'id',
  productos: '++id, codigo, nombre, tipo, lineaId',
  movimientos: '++id, productoId, fecha, tipo',
  activos: '++id, nombre',
  tasas: '++id, fecha',
  plantillas: '++id, nombre, lineaId',
  cotizaciones: '++id, numero, fecha, estado',
})

// Etapa 2: clientes, proveedores y pedidos.
db.version(2).stores({
  clientes: '++id, nombre',
  proveedores: '++id, nombre',
  pedidos: '++id, numero, fecha, estado, clienteId, cotizacionId',
  movimientos: '++id, productoId, fecha, tipo, pedidoId, proveedorId',
})

// Etapa 3: gastos y contabilidad.
db.version(3).stores({
  gastos: '++id, fecha, tipo, categoria, proveedorId',
  asientosManuales: '++id, fecha',
})

export const TIPOS_PRODUCTO = {
  reventa: 'Producto de reventa',
  materia_prima: 'Materia prima',
  insumo: 'Insumo / consumible',
  terminado: 'Producto terminado',
}

export const UNIDADES = [
  'unidad', 'hoja', 'pliego', 'paquete', 'resma', 'caja', 'rollo', 'metro', 'cm', 'cm²', 'm²',
  'gramo', 'kg', 'ml', 'litro', 'bobina',
]

export const LINEAS_INICIALES = [
  'Venta de papelería',
  'Impresión',
  'Impresión 3D',
  'Impresión comestible',
  'Sublimación',
  'Sublimación neón',
  'Grabado láser',
  'Personalización en vinil',
  'Manualidades',
  'Diseño',
]

// Valores iniciales: todo lo que es un dato del negocio queda en blanco (null)
// para que la app avise que está pendiente en lugar de inventarlo.
export const CONFIG_INICIAL = {
  id: 'general',
  nombreNegocio: 'Atelune',
  tarifaHora: null, // $ por hora de trabajo (diseño y producción)
  mermaPorDefecto: null, // %
  costoKwh: null, // $ por kWh
  pedidosEstimadosMes: null, // para repartir los costos fijos
  costosFijos: [], // [{ nombre, monto }] mensuales en $
  ivaPct: null,
  vigenciaDias: null,
  condiciones: '',
  contacto: '',
  lema: 'Papelería creativa · Impresión · Personalización',
  metodosPago: [
    { nombre: 'Efectivo $', comisionPct: null },
    { nombre: 'Efectivo Bs', comisionPct: null },
    { nombre: 'Pago móvil', comisionPct: null },
    { nombre: 'Transferencia', comisionPct: null },
  ],
  lineas: LINEAS_INICIALES.map((nombre, i) => ({ id: i + 1, nombre, margenPct: null })),
  ultimoRespaldo: null,
}

export async function inicializar() {
  const c = await db.config.get('general')
  if (!c) await db.config.put(CONFIG_INICIAL)
}

export async function getConfig() {
  return (await db.config.get('general')) ?? CONFIG_INICIAL
}

export async function tasaVigente() {
  return db.tasas.orderBy('fecha').last()
}

// ---------- Inventario ----------

export async function registrarMovimiento({ productoId, tipo, cantidad, costoUnitario, fecha, referencia, nota, pedidoId, proveedorId, pagadoCon, origen }) {
  return db.transaction('rw', db.productos, db.movimientos, async () => {
    const p = await db.productos.get(productoId)
    if (!p) throw new Error('Producto no encontrado')
    const r = aplicarMovimiento(p, { tipo, cantidad, costoUnitario })
    await db.productos.update(productoId, { stock: r.stock, costoPromedio: r.costoPromedio })
    return db.movimientos.add({
      productoId,
      tipo,
      cantidad: Number(cantidad),
      costoUnitario: tipo === 'entrada' ? Number(costoUnitario) : p.costoPromedio,
      fecha: fecha || new Date().toISOString().slice(0, 10),
      referencia: referencia || '',
      nota: nota || '',
      pedidoId: pedidoId ?? null,
      proveedorId: proveedorId ?? null,
      pagadoCon: pagadoCon ?? null,
      origen: origen ?? null,
      stockResultante: r.stock,
      costoPromedioResultante: r.costoPromedio,
    })
  })
}

// ---------- Respaldo ----------
const TABLAS = ['config', 'productos', 'movimientos', 'activos', 'tasas', 'plantillas', 'cotizaciones', 'clientes', 'proveedores', 'pedidos', 'gastos', 'asientosManuales']

export async function exportarDatos() {
  const datos = { app: 'atelune-erp', version: 1, fecha: new Date().toISOString() }
  await db.transaction('r', TABLAS.map((t) => db[t]), async () => {
    for (const t of TABLAS) datos[t] = await db[t].toArray()
  })
  return datos
}

export async function exportarRespaldo() {
  const datos = await exportarDatos()
  await db.config.update('general', { ultimoRespaldo: datos.fecha })
  return datos
}

export async function tieneDatos() {
  for (const t of ['productos', 'pedidos', 'cotizaciones', 'activos', 'gastos', 'clientes', 'proveedores', 'movimientos', 'plantillas', 'asientosManuales'])
    if ((await db[t].count()) > 0) return true
  return false
}

export { TABLAS }

// Validación previa a la restauración; compatible con tablas ausentes en respaldos antiguos.
export function validarRespaldo(datos) {
  if (!datos || datos.app !== 'atelune-erp' || datos.version !== 1) throw new Error('Respaldo incompatible.')
  if (!Array.isArray(datos.config) || !datos.config.some(c => c?.id === 'general')) throw new Error('Falta configuración general.')
  for (const t of TABLAS) if (Object.hasOwn(datos,t) &&
    (!Array.isArray(datos[t]) || datos[t].length > 100000 || datos[t].some(x => !x || typeof x !== 'object' || Array.isArray(x))))
    throw new Error('Tabla inválida: ' + t)
  return true
}
export async function importarRespaldo(datos) {
  validarRespaldo(datos)
  await db.transaction('rw', TABLAS.map((t) => db[t]), async () => {
    for (const t of TABLAS) {
      await db[t].clear()
      if (Array.isArray(datos[t])) await db[t].bulkPut(datos[t]) // tablas que no existan en respaldos viejos quedan vacías
    }
  })
}

// ---------- Pedidos ----------
export const ESTADOS_PEDIDO = {
  aprobado: 'Aprobado',
  en_diseno: 'En diseño',
  en_produccion: 'En producción',
  listo: 'Listo para entregar',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}
// A partir de estos estados los materiales ya se usaron.
/** Regla general de reparto (los % quedan pendientes hasta que la usuaria los defina). */
export function reglaGeneral(config) {
  if (config.reparto?.destinos?.length) return config.reparto
  return { destinos: [{ tipo: 'reinversion', pct: null }, ...personas(config).map((p) => ({ tipo: 'persona', personaId: p.id, pct: null }))] }
}

export const ESTADOS_CON_CONSUMO = ['en_produccion', 'listo', 'entregado']

export const codigoPedido = (num) => 'PED-' + String(num).padStart(4, '0')

/** Crea un pedido a partir de una cotización y la marca como aprobada. */
export async function crearPedidoDesdeCotizacion(cotId) {
  return db.transaction('rw', db.cotizaciones, db.pedidos, db.productos, db.activos, db.config, async () => {
    const cot = await db.cotizaciones.get(cotId)
    if (!cot) throw new Error('Cotización no encontrada')
    const existente = await db.pedidos.where('cotizacionId').equals(cotId).first()
    if (existente) return existente.id
    const config = await getConfig()
    const datosCalc = { productos: await db.productos.toArray(), activos: await db.activos.toArray(), config }
    const calc = calcularCotizacion(cot, datosCalc)
    const ultimo = await db.pedidos.orderBy('numero').last()
    const hoyIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    const id = await db.pedidos.add({
      numero: (ultimo?.numero ?? 0) + 1,
      fecha: hoyIso,
      fechaEntrega: '',
      estado: 'aprobado',
      cotizacionId: cot.id,
      clienteId: cot.clienteId ?? null,
      cliente: cot.cliente,
      contactoCliente: cot.contactoCliente,
      items: structuredClone(cot.items),
      precios: calc.renglones.map((r) => ({ precio: r.precio, precioUnitario: r.precioUnitario, costo: r.costo, manoObra: r.manoObra, personaId: r.personaId })),
      // Regla de reparto congelada al crear el pedido: cambiar la regla general no altera pedidos anteriores.
      reparto: structuredClone(reglaGeneral(config)),
      costoIncompleto: faltantesDeCosto(cot, datosCalc),
      total: calc.total,
      subtotal: calc.subtotal,
      envio: calc.envio,
      comision: calc.comision,
      iva: calc.iva,
      costoTotal: calc.costoTotal,
      ganancia: calc.ganancia,
      tasa: cot.tasa,
      metodoPagoIdx: cot.metodoPagoIdx,
      abonos: [],
      inventarioDescontado: false,
      historial: [{ fecha: new Date().toISOString(), estado: 'aprobado' }],
      notas: cot.notas || '',
    })
    await db.cotizaciones.update(cot.id, { estado: 'aprobada' })
    return id
  })
}

/** Cambia el estado de un pedido y mueve el inventario cuando corresponde. */
export async function cambiarEstadoPedido(id, estado) {
  return db.transaction('rw', db.pedidos, db.productos, db.movimientos, db.config, async () => {
    const p = await db.pedidos.get(id)
    const config = await getConfig()
    const ref = codigoPedido(p.numero)
    let descontado = !!p.inventarioDescontado
    if (ESTADOS_CON_CONSUMO.includes(estado) && !descontado) {
      for (const c of consumoPedido(p.items, config)) {
        if (await db.productos.get(c.productoId))
          await registrarMovimiento({ productoId: c.productoId, tipo: 'salida', cantidad: c.cantidad, referencia: ref, nota: 'Consumo de producción', pedidoId: id, origen: 'consumo_produccion' })
      }
      descontado = true
    }
    if (estado === 'cancelado' && descontado) {
      // Devuelve al inventario lo descontado, al costo con el que salió.
      const salidas = await db.movimientos.where('pedidoId').equals(id).filter((m) => m.tipo === 'salida' && !m.devuelto && (m.origen === 'consumo_produccion' || (!m.origen && m.nota === 'Consumo de producción' && m.referencia === ref))).toArray()
      for (const m of salidas) {
        if (await db.productos.get(m.productoId))
          await registrarMovimiento({ productoId: m.productoId, tipo: 'entrada', cantidad: m.cantidad, costoUnitario: m.costoUnitario, referencia: ref, nota: 'Devolución por cancelación', pedidoId: id, origen: 'reversion_consumo' })
        await db.movimientos.update(m.id, { devuelto: true })
      }
      descontado = false
    }
    await db.pedidos.update(id, {
      estado,
      inventarioDescontado: descontado,
      historial: [...(p.historial || []), { fecha: new Date().toISOString(), estado }],
    })
  })
}

// ---------- Contabilidad ----------
export async function datosContables() {
  const [pedidos, movimientos, gastos, activos, manuales, productos, config] = await Promise.all([
    db.pedidos.toArray(), db.movimientos.toArray(), db.gastos.toArray(), db.activos.toArray(),
    db.asientosManuales.toArray(), db.productos.toArray(), getConfig(),
  ])
  return { pedidos, movimientos, gastos, activos, manuales, productos, config }
}

// ---------- Agregar datos sin borrar ----------
// Agrega productos y activos de un archivo de carga. No toca lo existente:
// si ya hay uno con el mismo nombre, se omite. No crea movimientos de inventario
// (las existencias se registran después con compras reales).
export async function agregarDatos(datos) {
  if (datos?.app !== 'atelune-erp' || datos?.tipo !== 'carga') throw new Error('El archivo no es una carga de datos de Atelune.')
  const r = { productos: 0, activos: 0, omitidos: [] }
  await db.transaction('rw', db.productos, db.activos, async () => {
    const nombresP = new Set((await db.productos.toArray()).map((p) => p.nombre.trim().toLowerCase()))
    const nombresA = new Set((await db.activos.toArray()).map((a) => a.nombre.trim().toLowerCase()))
    for (const p of datos.productos || []) {
      const k = p.nombre.trim().toLowerCase()
      if (nombresP.has(k)) { r.omitidos.push(p.nombre); continue }
      const { id, ...resto } = p
      await db.productos.add({ ...resto, stock: 0, costoPromedio: 0 })
      nombresP.add(k); r.productos++
    }
    for (const a of datos.activos || []) {
      const k = a.nombre.trim().toLowerCase()
      if (nombresA.has(k)) { r.omitidos.push(a.nombre); continue }
      const { id, ...resto } = a
      await db.activos.add(resto)
      nombresA.add(k); r.activos++
    }
  })
  return r
}

// ---------- Compra de varios materiales ----------
/** lineas: [{ productoId, cantidadUso, costoTotal }] con el delivery ya incluido en costoTotal. */
export async function registrarCompra({ lineas, fecha, proveedorId, pagadoCon, referencia, nota }) {
  return db.transaction('rw', db.productos, db.movimientos, async () => {
    for (const l of lineas)
      await registrarMovimiento({
        productoId: l.productoId, tipo: 'entrada', cantidad: l.cantidadUso, costoUnitario: l.costoTotal / l.cantidadUso,
        fecha, proveedorId, pagadoCon, referencia, nota,
      })
  })
}
