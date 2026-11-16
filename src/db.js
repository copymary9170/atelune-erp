import Dexie from 'dexie'
import { aplicarMovimiento, calcularCotizacion, consumoPedido } from './lib/calc.js'

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

export async function registrarMovimiento({ productoId, tipo, cantidad, costoUnitario, fecha, referencia, nota, pedidoId, proveedorId }) {
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
      stockResultante: r.stock,
      costoPromedioResultante: r.costoPromedio,
    })
  })
}

// ---------- Respaldo ----------
const TABLAS = ['config', 'productos', 'movimientos', 'activos', 'tasas', 'plantillas', 'cotizaciones', 'clientes', 'proveedores', 'pedidos']

export async function exportarRespaldo() {
  const datos = { app: 'atelune-erp', version: 1, fecha: new Date().toISOString() }
  for (const t of TABLAS) datos[t] = await db[t].toArray()
  await db.config.update('general', { ultimoRespaldo: datos.fecha })
  return datos
}

export async function importarRespaldo(datos) {
  if (datos?.app !== 'atelune-erp') throw new Error('El archivo no es un respaldo de Atelune.')
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
    const calc = calcularCotizacion(cot, {
      productos: await db.productos.toArray(),
      activos: await db.activos.toArray(),
      config,
    })
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
      precios: calc.renglones.map((r) => ({ precio: r.precio, precioUnitario: r.precioUnitario, costo: r.costo })),
      total: calc.total,
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
          await registrarMovimiento({ productoId: c.productoId, tipo: 'salida', cantidad: c.cantidad, referencia: ref, nota: 'Consumo de producción', pedidoId: id })
      }
      descontado = true
    }
    if (estado === 'cancelado' && descontado) {
      // Devuelve al inventario lo descontado, al costo con el que salió.
      const salidas = await db.movimientos.where('pedidoId').equals(id).filter((m) => m.tipo === 'salida' && !m.devuelto).toArray()
      for (const m of salidas) {
        if (await db.productos.get(m.productoId))
          await registrarMovimiento({ productoId: m.productoId, tipo: 'entrada', cantidad: m.cantidad, costoUnitario: m.costoUnitario, referencia: ref, nota: 'Devolución por cancelación', pedidoId: id })
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
