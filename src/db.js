import Dexie from 'dexie'
import { aplicarMovimiento } from './lib/calc.js'

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

export async function registrarMovimiento({ productoId, tipo, cantidad, costoUnitario, fecha, referencia, nota }) {
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
      stockResultante: r.stock,
      costoPromedioResultante: r.costoPromedio,
    })
  })
}

// ---------- Respaldo ----------
const TABLAS = ['config', 'productos', 'movimientos', 'activos', 'tasas', 'plantillas', 'cotizaciones']

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
      if (Array.isArray(datos[t])) await db[t].bulkPut(datos[t])
    }
  })
}
