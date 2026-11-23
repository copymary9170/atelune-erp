import Dexie from 'dexie'
import { aplicarMovimiento, calcularCotizacion, consumoPedido, faltantesDeCosto, personas, redondear, saldoPedido } from './lib/calc.js'
import { prepararDuplicadoCotizacion } from './lib/escalas-cotizaciones.js'
import { calcularArqueo, resumenMovimientosCaja } from './lib/caja.js'
import { seleccionarTasa } from './lib/tasas-multiples.js'
import { congelarConversion, validarFechaOperacion } from './lib/pagos.js'
import { borradorCotizacion, calcularCotizacionRapida } from './lib/cotizaciones.js'
import { calcularCompra } from './lib/compras.js'

// Base de datos local (IndexedDB, dentro del navegador).
// Toda la lógica de datos pasa por este archivo para poder migrar
// a una base en la nube (p. ej. Supabase) más adelante sin reescribir pantallas.
export const NOMBRE_BASE_LEGADA = 'atelune-erp'

// Una base independiente por usuario autenticado; los nombres antiguos nunca se borran.
// El UID proviene exclusivamente de la sesión verificada por Supabase.
export function nombreBaseCuenta(uid) {
  if (typeof uid !== 'string' || !/^[a-f0-9-]{36}$/i.test(uid)) throw new Error('Identificador de cuenta inválido.')
  return 'atelune-erp-cuenta-' + uid.toLowerCase()
}

function crearBase(nombre) {
  const instancia = new Dexie(nombre)
  instancia.version(1).stores({
  config: 'id',
  productos: '++id, codigo, nombre, tipo, lineaId',
  movimientos: '++id, productoId, fecha, tipo',
  activos: '++id, nombre',
  tasas: '++id, fecha',
  plantillas: '++id, nombre, lineaId',
  cotizaciones: '++id, numero, fecha, estado',
})

// Etapa 2: clientes, proveedores y pedidos.
instancia.version(2).stores({
  clientes: '++id, nombre',
  proveedores: '++id, nombre',
  pedidos: '++id, numero, fecha, estado, clienteId, cotizacionId',
  movimientos: '++id, productoId, fecha, tipo, pedidoId, proveedorId',
})

// Etapa 3: gastos y contabilidad.
instancia.version(3).stores({
  gastos: '++id, fecha, tipo, categoria, proveedorId',
  asientosManuales: '++id, fecha',
})
// Etapa 11: cierres de caja por fecha y método, sin tocar la contabilidad.
instancia.version(4).stores({
  cajaArqueos: '++id, fecha, metodo, [fecha+metodo]',
})
  return instancia
}

// El binding ES mutable: cada consulta usa la base asignada a la sesión actual.
// La interfaz siempre se desmonta antes de cambiarla.
export let db = crearBase(NOMBRE_BASE_LEGADA)

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

export async function tasaVigente(tipo = 'bcv_usd', fechaMax = '9999-12-31') {
  return seleccionarTasa(await db.tasas.toArray(), tipo, fechaMax)
}

// ---------- Inventario ----------

export async function registrarMovimiento({ productoId, tipo, cantidad, costoUnitario, fecha, referencia, nota, pedidoId, proveedorId, pagadoCon, origen, tasa, tasaDetalle, compra }) {
  if (fecha != null) validarFechaOperacion(fecha)
  return db.transaction('rw', db.productos, db.movimientos, async () => {
    const p = await db.productos.get(productoId)
    if (!p) throw new Error('Producto no encontrado')
    const r = aplicarMovimiento(p, { tipo, cantidad, costoUnitario })
    const montoBs = compra ? compra.equivalenteBs : tipo === 'entrada'
      ? congelarConversion(Number(cantidad) * Number(costoUnitario), tasa, pagadoCon) : null
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
      tasa: tasa == null ? null : Number(tasa),
      tasaDetalle: tasaDetalle ? structuredClone(tasaDetalle) : null,
      montoBs,
      ...(compra ? { compra } : {}),
      origen: origen ?? null,
      stockResultante: r.stock,
      costoPromedioResultante: r.costoPromedio,
    })
  })
}

// ---------- Respaldo ----------
const TABLAS = ['config', 'productos', 'movimientos', 'activos', 'tasas', 'plantillas', 'cotizaciones', 'clientes', 'proveedores', 'pedidos', 'gastos', 'asientosManuales', 'cajaArqueos']

export async function exportarDatos({ origen = db } = {}) {
  const datos = { app: 'atelune-erp', version: 1, fecha: new Date().toISOString() }
  await origen.transaction('r', TABLAS.map((t) => origen[t]), async () => {
    for (const t of TABLAS) datos[t] = await origen[t].toArray()
  })
  return datos
}

export async function exportarRespaldo() {
  const datos = await exportarDatos()
  await db.config.update('general', { ultimoRespaldo: datos.fecha })
  return datos
}

export async function tieneDatos({ origen = db } = {}) {
  for (const t of ['productos', 'pedidos', 'cotizaciones', 'activos', 'gastos', 'clientes', 'proveedores', 'movimientos', 'plantillas', 'asientosManuales', 'cajaArqueos'])
    if ((await origen[t].count()) > 0) return true
  return false
}

export { TABLAS }

// Una instalación antigua guarda todos los datos en la base compartida. Solo la
// cuenta propietaria puede migrarla. La copia se hace en una transacción atómica,
// sin borrar ni modificar la base antigua. Así puede recuperarse manualmente.
let cambioBasePendiente = Promise.resolve()

export function prepararBaseCuenta(uid, { confirmarLegado = false } = {}) {
  const trabajo = cambioBasePendiente.then(() => prepararBaseCuentaInterna(uid, confirmarLegado))
  cambioBasePendiente = trabajo.catch(() => {})
  return trabajo
}

async function prepararBaseCuentaInterna(uid, confirmarLegado) {
  const nombre = nombreBaseCuenta(uid)
  if (db.name === nombre) return { estado: 'lista', migrada: false, nueva: false }

  const { leerPropietarioLocal, vincularPropietarioLocal } = await import('./lib/cuenta-local.js')
  const propietario = leerPropietarioLocal() // un error de almacenamiento detiene el acceso

  // Si existe la base individual, nunca se vuelve a migrar desde la base antigua.
  // Esto preserva todos los cambios hechos después de la primera apertura.
  let yaExiste = await Dexie.exists(nombre)
  if (yaExiste) {
    // Si una pestaña se cerró durante una migración, la base pudo quedar creada
    // pero sin registros. En ese caso es seguro reintentar la copia del legado.
    const inspeccion = crearBase(nombre)
    try {
      const vacia = await inspeccion.transaction('r', TABLAS.map(t => inspeccion[t]), async () =>
        (await Promise.all(TABLAS.map(t => inspeccion[t].count()))).every(n => n === 0)
      )
      if (vacia) yaExiste = false
    } finally {
      inspeccion.close()
    }
  }
  if (!yaExiste) {
    const legada = db.name === NOMBRE_BASE_LEGADA ? db : crearBase(NOMBRE_BASE_LEGADA)
    try {
      const conDatos = await legada.transaction('r', TABLAS.map((t) => legada[t]), async () => {
        const filas = await Promise.all(TABLAS.filter(t => t !== 'config').map(t => legada[t].count()))
        if (filas.some(n => n > 0)) return true
        const configLegada = await legada.config.get('general')
        return !!configLegada && Object.entries(configLegada).some(([k, v]) =>
          k !== 'ultimoRespaldo' && JSON.stringify(v) !== JSON.stringify(CONFIG_INICIAL[k]))
      })
      if (conDatos && !propietario && !confirmarLegado) {
        return { estado: 'confirmar', migrada: false, nueva: false }
      }
      const migrar = conDatos && (propietario === uid || (!propietario && confirmarLegado))
      // Conservar propietario histórico de otra cuenta: no transferir datos ajenos.
      if (migrar && !propietario) vincularPropietarioLocal(uid)
      // Al crear una base vacía, descartar versiones de sincronización heredadas.
      // Si se migra el legado, marcarlo como pendiente para reconciliarlo con
      // Supabase antes de considerar que la nueva copia está sincronizada.
      const claveSync = 'atelune-nube-' + uid
      if (migrar) {
        const meta = JSON.parse(localStorage.getItem(claveSync) || '{}')
        localStorage.setItem(claveSync, JSON.stringify({ ...meta, sucio: true }))
      } else {
        localStorage.removeItem(claveSync)
      }
      const destino = crearBase(nombre)
      try {
        if (migrar) {
          const datos = {}
          await legada.transaction('r', TABLAS.map(t => legada[t]), async () => {
            for (const t of TABLAS) datos[t] = await legada[t].toArray()
          })
          await destino.transaction('rw', TABLAS.map(t => destino[t]), async () => {
            for (const t of TABLAS) await destino[t].bulkPut(datos[t])
          })
        }
        // Solo marcamos el destino como listo tras una transferencia completa.
        await destino.open()
        db.close()
        db = destino
        await inicializar()
        return { estado: 'lista', migrada: migrar, nueva: true }
      } catch (err) {
        destino.close()
        throw err
      }
    } finally {
      if (legada !== db) legada.close()
    }
  }

  const destino = crearBase(nombre)
  await destino.open()
  db.close()
  db = destino
  await inicializar()
  return { estado: 'lista', migrada: false, nueva: false }
}

// Validación previa a la restauración; compatible con tablas ausentes en respaldos antiguos.
export function validarRespaldo(datos) {
  if (!datos || datos.app !== 'atelune-erp' || datos.version !== 1) throw new Error('Respaldo incompatible.')
  if (!Array.isArray(datos.config) || !datos.config.some(c => c?.id === 'general')) throw new Error('Falta configuración general.')
  for (const t of TABLAS) if (Object.hasOwn(datos,t) &&
    (!Array.isArray(datos[t]) || datos[t].length > 100000 || datos[t].some(x => !x || typeof x !== 'object' || Array.isArray(x))))
    throw new Error('Tabla inválida: ' + t)
  return true
}
export async function importarRespaldo(datos, { destino = db } = {}) {
  validarRespaldo(datos)
  await destino.transaction('rw', TABLAS.map((t) => destino[t]), async () => {
    // Un archivo antiguo puede omitir tablas nuevas, pero nunca debe borrar datos actuales sin aviso.
    for (const t of TABLAS) {
      if (!Array.isArray(datos[t]) && (await destino[t].count()) > 0) throw new Error('El respaldo omite una tabla que contiene datos: ' + t)
    }
    for (const t of TABLAS) {
      await destino[t].clear()
      if (Array.isArray(datos[t])) await destino[t].bulkPut(datos[t]) // tablas que no existan en respaldos viejos quedan vacías
    }
  })
}

async function siguienteNumeroCotizacion() {
  const ultima = await db.cotizaciones.orderBy('numero').last()
  return Math.max(0, Number(ultima?.numero) || 0) + 1
}

export async function nuevaCotizacion() {
  return db.transaction('rw', db.cotizaciones, async () =>
    db.cotizaciones.add({ ...borradorCotizacion(), numero: await siguienteNumeroCotizacion() }))
}

export async function datosCotizacion() {
  const [productos, activos, config] = await Promise.all([db.productos.toArray(), db.activos.toArray(), getConfig()])
  return { productos, activos, config }
}

export async function guardarCotizacionRapida(plantillaId, cantidad, precioVisto) {
  return db.transaction('rw', [db.cotizaciones, db.plantillas, db.productos, db.activos, db.config], async () => {
    const plantilla = await db.plantillas.get(plantillaId)
    if (!plantilla) throw new Error('La plantilla ya no está disponible.')
    const { cotizacion, avisos } = calcularCotizacionRapida(plantilla, cantidad, await datosCotizacion())
    if (!cotizacion) throw new Error(avisos.join(' '))
    if (cotizacion.calculo.total !== precioVisto)
      throw new Error('El precio cambió. Revisa el nuevo total antes de guardar.')
    return db.cotizaciones.add({ ...cotizacion, numero: await siguienteNumeroCotizacion() })
  })
}

// Crea una nueva cotización sin alterar el original ni su pedido asociado.
export async function duplicarCotizacion(id) {
  return db.transaction('rw', db.cotizaciones, async () => {
    const origen = await db.cotizaciones.get(Number(id))
    if (!origen) throw new Error('Cotización original no encontrada.')
    const numero = await siguienteNumeroCotizacion()
    const fecha = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    return db.cotizaciones.add(prepararDuplicadoCotizacion(origen, numero, fecha))
  })
}

// Cierres informativos por método y día: nunca modifican documentos originales.
export async function guardarArqueoCaja(entrada) {
  return db.transaction('rw', db.cajaArqueos, db.pedidos, db.gastos, db.movimientos, async () => {
    const { fecha, metodo } = entrada
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha inválida.')
    const existente = await db.cajaArqueos.where('[fecha+metodo]').equals([fecha, metodo]).first()
    if (existente) throw new Error('Ya existe un arqueo para esta fecha y método.')
    const [pedidos, gastos, movimientos] = await Promise.all([
      db.pedidos.toArray(), db.gastos.toArray(), db.movimientos.toArray(),
    ])
    const resumen = resumenMovimientosCaja({ pedidos, gastos, movimientos }, { fecha, metodo })
    const montos = calcularArqueo({ inicial: entrada.inicial, contado: entrada.contado, resumen })
    return db.cajaArqueos.add({
      fecha, metodo, moneda: resumen.moneda,
      inicial: Number(entrada.inicial), contado: montos.contado,
      esperado: montos.esperado, diferencia: montos.diferencia,
      entradas: resumen.entradas, salidas: resumen.salidas,
      registros: structuredClone(resumen.registros),
      nota: String(entrada.nota || '').trim().slice(0, 500),
      cerradoEn: new Date().toISOString(),
    })
  })
}

// ---------- Pedidos ----------
export async function registrarAbono(pedidoId, { fecha, monto, metodo, tasa, tipoTasa, tasaDetalle, nota }) {
  validarFechaOperacion(fecha)
  const montoUsd = Number(monto)
  if (!Number.isFinite(montoUsd) || montoUsd <= 0) throw new Error('Indica un monto válido.')
  if (!metodo?.trim()) throw new Error('Selecciona el método de pago.')
  const montoBs = congelarConversion(montoUsd, tasa, metodo)
  return db.transaction('rw', db.pedidos, async () => {
    const pedido = await db.pedidos.get(pedidoId)
    if (!pedido || pedido.estado === 'cancelado') throw new Error('El pedido no está disponible para recibir pagos.')
    const pendiente = saldoPedido(pedido)
    const abono = {
      fecha, monto: montoUsd, metodo, tasa, tipoTasa, tasaDetalle, nota, montoBs,
      saldoAntes: redondear(pendiente), saldoDespues: redondear(pendiente - montoUsd),
      registradoEn: new Date().toISOString(),
    }
    await db.pedidos.update(pedidoId, { abonos: [...(pedido.abonos || []), abono] })
  })
}

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
      tasaDetalle: cot.tasaDetalle ? structuredClone(cot.tasaDetalle) : null,
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
export async function cambiarEstadoPedido(id, estado, { devolverInventario = false } = {}) {
  return db.transaction('rw', db.pedidos, db.productos, db.movimientos, db.config, async () => {
    const p = await db.pedidos.get(id)
    if (!p) throw new Error('Pedido no encontrado')
    if (!Object.hasOwn(ESTADOS_PEDIDO, estado)) throw new Error('Estado de pedido inválido')
    if (p.estado === 'cancelado' && estado !== 'cancelado') throw new Error('Un pedido cancelado no puede reactivarse automáticamente.')
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
    if (estado === 'cancelado' && descontado && devolverInventario) {
      // Solo devuelve el material recuperado físicamente y confirmado por la usuaria.
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
      historial: [...(p.historial || []), { fecha: new Date().toISOString(), estado, ...(estado === 'cancelado' ? { devolucionInventario: devolverInventario && !descontado ? 'devueltos' : descontado ? 'no_devueltos' : 'sin_consumo' } : {}) }],
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
/** Cada importe de material llega en la moneda de la factura, antes del delivery. */
export async function registrarCompra({ lineas, fecha, proveedorId, pagadoCon, referencia, nota, tasa, tasaDetalle,
  monedaFactura = 'USD', monedaPago, delivery, reparto }) {
  validarFechaOperacion(fecha)
  const calculo = calcularCompra({ importes: lineas.map(l => l.importeFactura ?? l.costoTotal),
    delivery, reparto, monedaFactura, pagadoCon, monedaPago, tasa })
  const detalle = tasa > 0 ? {
    fecha, unidad: 'USD', bsPorUnidad: Number(tasa), usdPorUnidad: 1, ...tasaDetalle,
    origen: tasaDetalle?.origen || (tasaDetalle?.fuenteExterna ? 'referencia externa' : 'manual'),
    efectivaBsPorUsd: Number(tasa),
  } : null
  return db.transaction('rw', db.productos, db.movimientos, async () => {
    for (const [i, l] of lineas.entries()) {
      const compra = calculo.lineas[i]
      await registrarMovimiento({
        productoId: l.productoId, tipo: 'entrada', cantidad: l.cantidadUso,
        costoUnitario: compra.costoTotalUsd / l.cantidadUso,
        fecha, proveedorId, pagadoCon, referencia, nota, tasa, tasaDetalle: detalle,
        compra,
      })
    }
  })
}
