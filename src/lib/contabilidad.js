// Motor contable de Atelune.
//
// Los asientos NO se guardan: se generan a partir de los documentos (pedidos, pagos,
// movimientos de inventario, gastos, activos y asientos manuales). Así el libro diario
// siempre coincide con lo registrado: si corriges un pago o un gasto, la contabilidad
// se corrige sola. Contabilidad por devengo, todo en dólares.
//
// Reportes de gestión interna: deben validarse con un contador.

import { n, depreciacionMensual, mesesTranscurridos } from './calc.js'
import { fechaContable } from './format.js'
import { fechaEntregaPedido } from './reporte-rentabilidad.js'

export const CATEGORIAS_GASTO = [
  'Electricidad', 'Internet y teléfono', 'Alquiler', 'Software y suscripciones', 'Publicidad',
  'Delivery y transporte', 'Comisiones bancarias', 'Mantenimiento y reparaciones', 'Material de oficina', 'Otros gastos',
]

// ---------- Plan de cuentas ----------
// Cuentas fijas. Las de disponible, ventas y gastos se crean según tus métodos de pago,
// líneas de servicio y categorías (código base + «:» + nombre o id).
export const CUENTAS_FIJAS = {
  '1.1.02': { nombre: 'Cuentas por cobrar clientes', tipo: 'activo' },
  '1.1.03': { nombre: 'Inventario', tipo: 'activo' },
  '1.2.01': { nombre: 'Equipos y maquinaria', tipo: 'activo' },
  '1.2.02': { nombre: 'Depreciación acumulada', tipo: 'activo', contra: true },
  '2.1.01': { nombre: 'Cuentas por pagar proveedores', tipo: 'pasivo' },
  '2.1.02': { nombre: 'Anticipos de clientes', tipo: 'pasivo' },
  '2.1.03': { nombre: 'IVA por pagar', tipo: 'pasivo' },
  '3.1.01': { nombre: 'Capital', tipo: 'patrimonio' },
  '3.1.02': { nombre: 'Retiros del dueño', tipo: 'patrimonio', contra: true },
  '3.1.03': { nombre: 'Utilidades repartidas', tipo: 'patrimonio', contra: true },
  '4.2.01': { nombre: 'Envíos y recargos cobrados', tipo: 'ingreso' },
  '5.1.01': { nombre: 'Costo de ventas (materiales)', tipo: 'costo' },
  '5.1.02': { nombre: 'Mermas de inventario', tipo: 'costo' },
  '5.1.03': { nombre: 'Ajustes y consumos de inventario', tipo: 'costo' },
  '6.2.01': { nombre: 'Depreciación de equipos', tipo: 'gasto' },
  '6.3.01': { nombre: 'Mano de obra pagada', tipo: 'gasto' },
}

export const cuentaDisponible = (metodo) => '1.1.01:' + (metodo || 'Sin método')
export const cuentaVenta = (lineaId) => '4.1.01:' + (lineaId || 0)
export const cuentaGasto = (categoria) => '6.1.01:' + (categoria || 'Otros gastos')

export function infoCuenta(codigo, config = {}) {
  if (CUENTAS_FIJAS[codigo]) return { codigo, ...CUENTAS_FIJAS[codigo] }
  const [base, resto] = codigo.split(':')
  if (base === '1.1.01') return { codigo, nombre: 'Disponible: ' + resto, tipo: 'activo' }
  if (base === '4.1.01') {
    const l = (config.lineas || []).find((x) => String(x.id) === resto)
    return { codigo, nombre: 'Ventas: ' + (l?.nombre || (resto === '0' ? 'sin línea' : 'línea ' + resto)), tipo: 'ingreso' }
  }
  if (base === '6.1.01') return { codigo, nombre: 'Gasto: ' + resto, tipo: 'gasto' }
  return { codigo, nombre: codigo, tipo: 'otro' }
}

// Naturaleza: activos, costos y gastos aumentan por el debe; el resto por el haber.
export const naturalezaDeudora = (info) =>
  (['activo', 'costo', 'gasto'].includes(info.tipo) && !info.contra) || (info.tipo === 'patrimonio' && info.contra)

export const GRUPOS = [
  ['activo', 'Activo'], ['pasivo', 'Pasivo'], ['patrimonio', 'Patrimonio'],
  ['ingreso', 'Ingresos'], ['costo', 'Costos'], ['gasto', 'Gastos'],
]

// ---------- Utilidades ----------
const r2 = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100

/** Fecha local AAAA-MM-DD de una marca ISO. */
export function fechaLocal(iso) {
  return fechaContable(iso)
}

function ultimoDiaMes(anio, mes0) {
  const d = new Date(Date.UTC(anio, mes0 + 1, 0))
  return d.toISOString().slice(0, 10)
}

/** Crea un asiento redondeado a centavos y cuadrado (el residuo va a la línea mayor). */
export function asiento(fecha, concepto, origen, lineas) {
  const ls = lineas
    .map((l) => ({ cuenta: l.cuenta, debe: r2(l.debe), haber: r2(l.haber) }))
    .filter((l) => l.debe !== 0 || l.haber !== 0)
  if (!ls.length) return null
  const dif = r2(ls.reduce((s, l) => s + l.debe - l.haber, 0))
  if (dif !== 0) {
    const mayor = ls.reduce((a, b) => (Math.max(b.debe, b.haber) > Math.max(a.debe, a.haber) ? b : a))
    if (mayor.haber > 0) mayor.haber = r2(mayor.haber + dif)
    else mayor.debe = r2(mayor.debe - dif)
  }
  return { fecha, concepto, origen, lineas: ls }
}

// Cuenta contrapartida según cómo se pagó.
// 'credito' → por pagar; un método de pago → disponible; vacío → aporte de capital (lo que ya tenías).
export function cuentaPago(pagadoCon) {
  if (pagadoCon === 'credito') return '2.1.01'
  if (!pagadoCon || pagadoCon === 'aporte') return '3.1.01'
  return cuentaDisponible(pagadoCon)
}

// ---------- Generación de asientos ----------
/**
 * datos: { pedidos, movimientos, gastos, activos, manuales, productos, config }
 * hasta: Date hasta la cual se calcula la depreciación (por defecto hoy).
 */
export function generarAsientos(datos, hasta = new Date()) {
  const { pedidos = [], movimientos = [], gastos = [], activos = [], manuales = [], productos = [] } = datos
  const out = []
  const push = (a) => a && out.push(a)
  const nombreProd = (id) => productos.find((p) => p.id === id)?.nombre ?? 'producto'

  // Pedidos: ventas (al entregar) y cobros.
  for (const p of pedidos) {
    const cod = 'PED-' + String(p.numero).padStart(4, '0')
    const fEntrega = fechaEntregaPedido(p)

    // En días iguales la venta va antes que los cobros (el orden se conserva al ordenar por fecha).
    const anticipos = (p.abonos || []).filter((a) => !a.anulado && !(fEntrega && a.fecha >= fEntrega)).reduce((s, a) => s + n(a.monto), 0)

    if (fEntrega) {
      const porLinea = new Map()
      ;(p.items || []).forEach((it, i) => {
        const k = cuentaVenta(it.lineaId)
        porLinea.set(k, (porLinea.get(k) || 0) + n(p.precios?.[i]?.precio))
      })
      const ventas = [...porLinea.values()].reduce((s, v) => s + v, 0)
      const iva = n(p.iva)
      const otros = n(p.total) - ventas - iva
      push(asiento(fEntrega, `Venta ${cod}${p.cliente ? ' · ' + p.cliente : ''}`, { tipo: 'pedido', id: p.id }, [
        { cuenta: '1.1.02', debe: p.total },
        ...[...porLinea].map(([cuenta, v]) => ({ cuenta, haber: v })),
        { cuenta: '4.2.01', haber: otros },
        { cuenta: '2.1.03', haber: iva },
      ]))
      if (anticipos > 0)
        push(asiento(fEntrega, `Aplicación de anticipos ${cod}`, { tipo: 'pedido', id: p.id }, [
          { cuenta: '2.1.02', debe: anticipos },
          { cuenta: '1.1.02', haber: anticipos },
        ]))
    }

    for (const a of (p.abonos || []).filter((a) => !a.anulado)) {
      const despues = fEntrega && a.fecha >= fEntrega
      push(asiento(a.fecha, `Cobro ${cod}${p.cliente ? ' · ' + p.cliente : ''}`, { tipo: 'pedido', id: p.id }, [
        { cuenta: cuentaDisponible(a.metodo), debe: a.monto },
        { cuenta: despues ? '1.1.02' : '2.1.02', haber: a.monto },
      ]))
    }
  }

  // Inventario.
  const porProducto = new Map()
  for (const m of [...movimientos].sort((a, b) => a.id - b.id)) {
    const prev = porProducto.get(m.productoId) ?? 0
    porProducto.set(m.productoId, m.stockResultante)
    const nombre = nombreProd(m.productoId)
    const ref = m.referencia ? ' · ' + m.referencia : ''
    const origen = { tipo: 'inventario', id: m.id, productoId: m.productoId }
    if (m.tipo === 'entrada') {
      const valor = n(m.cantidad) * n(m.costoUnitario)
      // Devolución por pedido cancelado: revierte el costo de ventas.
      const contra = m.pedidoId ? '5.1.01' : cuentaPago(m.pagadoCon)
      push(asiento(m.fecha, (m.pedidoId ? 'Devolución a inventario: ' : 'Compra: ') + nombre + ref, origen, [
        { cuenta: '1.1.03', debe: valor },
        { cuenta: contra, haber: valor },
      ]))
    } else if (m.tipo === 'salida' || m.tipo === 'merma') {
      const valor = n(m.cantidad) * n(m.costoUnitario)
      const cuenta = m.tipo === 'merma' ? '5.1.02' : m.pedidoId ? '5.1.01' : '5.1.03'
      push(asiento(m.fecha, (m.tipo === 'merma' ? 'Merma: ' : 'Consumo: ') + nombre + ref, origen, [
        { cuenta, debe: valor },
        { cuenta: '1.1.03', haber: valor },
      ]))
    } else if (m.tipo === 'ajuste') {
      const dif = (n(m.stockResultante) - n(prev)) * n(m.costoUnitario)
      push(asiento(m.fecha, 'Ajuste por conteo: ' + nombre + ref, origen,
        dif >= 0
          ? [{ cuenta: '1.1.03', debe: dif }, { cuenta: '5.1.03', haber: dif }]
          : [{ cuenta: '5.1.03', debe: -dif }, { cuenta: '1.1.03', haber: -dif }]))
    }
  }

  // Gastos, pagos a proveedores y retiros.
  for (const g of gastos) {
    const origen = { tipo: 'gasto', id: g.id }
    const desc = g.descripcion ? ' · ' + g.descripcion : ''
    if (g.tipo === 'pago_proveedor') {
      push(asiento(g.fecha, 'Pago a proveedor' + (g.proveedorNombre ? ' ' + g.proveedorNombre : '') + desc, origen, [
        { cuenta: '2.1.01', debe: g.monto },
        { cuenta: cuentaDisponible(g.pagadoCon), haber: g.monto },
      ]))
    } else if (g.tipo === 'retiro') {
      push(asiento(g.fecha, 'Retiro del dueño' + desc, origen, [
        { cuenta: '3.1.02', debe: g.monto },
        { cuenta: cuentaDisponible(g.pagadoCon), haber: g.monto },
      ]))
    } else if (g.tipo === 'pago_mano_obra') {
      push(asiento(g.fecha, 'Pago de mano de obra' + (g.personaNombre ? ' a ' + g.personaNombre : '') + desc, origen, [
        { cuenta: '6.3.01', debe: g.monto },
        { cuenta: cuentaDisponible(g.pagadoCon), haber: g.monto },
      ]))
    } else if (g.tipo === 'reparto') {
      push(asiento(g.fecha, 'Reparto de utilidades' + (g.personaNombre ? ' a ' + g.personaNombre : '') + desc, origen, [
        { cuenta: '3.1.03', debe: g.monto },
        { cuenta: cuentaDisponible(g.pagadoCon), haber: g.monto },
      ]))
    } else if (g.tipo === 'aporte') {
      push(asiento(g.fecha, 'Aporte de capital' + desc, origen, [
        { cuenta: cuentaDisponible(g.pagadoCon), debe: g.monto },
        { cuenta: '3.1.01', haber: g.monto },
      ]))
    } else {
      push(asiento(g.fecha, (g.categoria || 'Gasto') + desc, origen, [
        { cuenta: cuentaGasto(g.categoria), debe: g.monto },
        { cuenta: cuentaPago(g.pagadoCon), haber: g.monto },
      ]))
    }
  }

  // Activos: compra y depreciación mensual (al cierre de cada mes completo).
  for (const a of activos) {
    const origen = { tipo: 'activo', id: a.id }
    const fCompra = a.fechaCompra || fechaContable()
    push(asiento(fCompra, 'Compra de equipo: ' + a.nombre, origen, [
      { cuenta: '1.2.01', debe: a.costo },
      { cuenta: cuentaPago(a.pagadoCon), haber: a.costo },
    ]))
    const dep = depreciacionMensual(a)
    if (!a.fechaCompra || dep <= 0) continue
    const meses = Math.min(mesesTranscurridos(a.fechaCompra, hasta), n(a.vidaUtilMeses))
    const [y, m] = a.fechaCompra.split('-').map(Number)
    for (let k = 1; k <= meses; k++) {
      const fecha = ultimoDiaMes(y, m - 1 + k - 1)
      push(asiento(fecha, 'Depreciación: ' + a.nombre, origen, [
        { cuenta: '6.2.01', debe: dep },
        { cuenta: '1.2.02', haber: dep },
      ]))
    }
  }

  // Asientos manuales.
  for (const am of manuales)
    push(asiento(am.fecha, am.concepto || 'Asiento manual', { tipo: 'manual', id: am.id }, am.lineas || []))

  return out.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
}

// ---------- Reportes ----------
export const enPeriodo = (fecha, desde, hasta) => (!desde || fecha >= desde) && (!hasta || fecha <= hasta)

/** Saldos por cuenta: { codigo: { debe, haber } } para asientos hasta una fecha (y opcionalmente desde). */
export function sumasPorCuenta(asientos, desde, hasta) {
  const s = {}
  for (const a of asientos) {
    if (!enPeriodo(a.fecha, desde, hasta)) continue
    for (const l of a.lineas) {
      s[l.cuenta] ??= { debe: 0, haber: 0 }
      s[l.cuenta].debe += l.debe
      s[l.cuenta].haber += l.haber
    }
  }
  return s
}

export function saldo(info, sumas) {
  if (!sumas) return 0
  return naturalezaDeudora(info) ? sumas.debe - sumas.haber : sumas.haber - sumas.debe
}

/** Libro mayor de una cuenta con saldo acumulado. */
export function mayor(asientos, cuenta, config, desde, hasta) {
  const info = infoCuenta(cuenta, config)
  const previo = desde ? saldo(info, sumasPorCuenta(asientos, null, restarDia(desde))[cuenta]) : 0
  let acumulado = previo
  const filas = []
  for (const a of asientos) {
    if (!enPeriodo(a.fecha, desde, hasta)) continue
    for (const l of a.lineas) {
      if (l.cuenta !== cuenta) continue
      acumulado += naturalezaDeudora(info) ? l.debe - l.haber : l.haber - l.debe
      filas.push({ fecha: a.fecha, concepto: a.concepto, debe: l.debe, haber: l.haber, saldo: acumulado, origen: a.origen })
    }
  }
  return { info, saldoInicial: previo, filas, saldoFinal: acumulado }
}

export function restarDia(fecha) {
  const d = new Date(fecha + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** Estado de resultados del período. */
export function estadoResultados(asientos, config, desde, hasta) {
  const sumas = sumasPorCuenta(asientos, desde, hasta)
  const grupo = (tipo) =>
    Object.keys(sumas)
      .map((c) => ({ ...infoCuenta(c, config), monto: 0, c }))
      .filter((x) => x.tipo === tipo)
      .map((x) => ({ ...x, monto: saldo(x, sumas[x.c]) }))
      .filter((x) => Math.abs(x.monto) > 0.004)
      .sort((a, b) => (a.codigo < b.codigo ? -1 : 1))
  const ingresos = grupo('ingreso')
  const costos = grupo('costo')
  const gastos = grupo('gasto')
  const tot = (l) => l.reduce((s, x) => s + x.monto, 0)
  const utilidadBruta = tot(ingresos) - tot(costos)
  return {
    ingresos, costos, gastos,
    totalIngresos: tot(ingresos), totalCostos: tot(costos), totalGastos: tot(gastos),
    utilidadBruta, utilidadNeta: utilidadBruta - tot(gastos),
  }
}

/** Resultado bruto de los asientos atribuibles al pedido. */
export function utilidadContablePedido(pedido, movimientos) {
  if (!fechaEntregaPedido(pedido) || !movimientos) return null
  const vinculados = movimientos.filter(m => m.pedidoId === pedido.id)
  const r = estadoResultados(generarAsientos({ pedidos: [pedido], movimientos: vinculados }), {})
  const salidas = vinculados.filter(m => m.tipo === 'salida')
  const unitarios = pedido.costosUnitariosPresupuesto
  const puedeComparar = unitarios && salidas.length &&
    salidas.every(m => Number.isFinite(unitarios[m.productoId]) && Number.isFinite(m.costoUnitario))
  const variacionPromedio = puedeComparar ? r2(salidas.reduce((total, m) =>
    total + (m.costoUnitario - unitarios[m.productoId]) * m.cantidad, 0)) : null
  return { utilidad: r.utilidadBruta, ingresos: r.totalIngresos, costo: r.totalCostos, variacionPromedio,
    sinConsumo: salidas.length === 0 }
}

/** Balance general a una fecha. La utilidad acumulada se muestra dentro del patrimonio. */
export function balanceGeneral(asientos, config, hasta) {
  const sumas = sumasPorCuenta(asientos, null, hasta)
  const cuentas = Object.keys(sumas).map((c) => {
    const info = infoCuenta(c, config)
    return { ...info, saldo: saldo(info, sumas[c]) }
  })
  const de = (tipo) => cuentas.filter((x) => x.tipo === tipo && Math.abs(x.saldo) > 0.004).sort((a, b) => (a.codigo < b.codigo ? -1 : 1))
  // En el balance las cuentas «contra» restan.
  const total = (l) => l.reduce((s, x) => s + (x.contra ? -x.saldo : x.saldo), 0)
  const resultado = estadoResultados(asientos, config, null, hasta).utilidadNeta
  const activo = de('activo'), pasivo = de('pasivo'), patrimonio = de('patrimonio')
  return {
    activo, pasivo, patrimonio, resultado,
    totalActivo: total(activo),
    totalPasivo: total(pasivo),
    totalPatrimonio: total(patrimonio) + resultado,
  }
}

/** Balance de comprobación: sumas y saldos de todas las cuentas. */
export function balanceComprobacion(asientos, config, desde, hasta) {
  const sumas = sumasPorCuenta(asientos, desde, hasta)
  const filas = Object.keys(sumas)
    .sort()
    .map((c) => {
      const info = infoCuenta(c, config)
      const d = sumas[c].debe - sumas[c].haber
      return { ...info, debe: sumas[c].debe, haber: sumas[c].haber, saldoDeudor: d > 0 ? d : 0, saldoAcreedor: d < 0 ? -d : 0 }
    })
  const t = (k) => filas.reduce((s, f) => s + f[k], 0)
  return { filas, debe: t('debe'), haber: t('haber'), saldoDeudor: t('saldoDeudor'), saldoAcreedor: t('saldoAcreedor') }
}
