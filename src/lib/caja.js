// Libro auxiliar de efectivo para arqueo. No genera asientos contables,
// no modifica pedidos/gastos y no convierte fondos entre USD y Bs.
const red = x => Math.round((x + Number.EPSILON) * 100) / 100
const valido = x => x !== '' && x != null && Number.isFinite(Number(x)) && Number(x) >= 0
export function monedaEfectivo(metodo) {
  if (!/efectivo/i.test(String(metodo || ''))) return null
  if (/\b(bs\.?|ves|bol[ií]var(?:es)?)\b/i.test(metodo)) return 'Bs'
  if (/\$|usd|d[oó]lar(?:es)?/i.test(metodo)) return 'USD'
  return null // No adivinar la moneda de un método ambiguo
}
export function metodosEfectivo(config) {
  return [...new Set((config?.metodosPago || []).map(x => x.nombre).filter(x => monedaEfectivo(x)))]
}
export function resumenMovimientosCaja({ pedidos = [], gastos = [], movimientos = [] }, { fecha, metodo }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha inválida.')
  const moneda = monedaEfectivo(metodo)
  if (!moneda) throw new Error('El método no identifica una moneda de efectivo.')
  const registros = []
  const convertir = (monto, tasa, origen, id, signo, detalle) => {
    const usd = Number(monto)
    if (!Number.isFinite(usd) || usd < 0) {
      registros.push({ origen, id, detalle, estado: 'importe_invalido', signo, importe: null })
      return
    }
    if (moneda === 'Bs' && (!Number.isFinite(Number(tasa)) || Number(tasa) <= 0)) {
      registros.push({ origen, id, detalle, estado: 'sin_tasa', signo, importe: null })
      return
    }
    const importe = moneda === 'Bs' ? red(usd * Number(tasa)) : red(usd)
    registros.push({ origen, id, detalle, estado: 'ok', signo, importe })
  }
  for (const p of pedidos) for (const [indice, a] of (p.abonos || []).entries()) {
    if (a.anulado || a.fecha !== fecha || a.metodo !== metodo) continue
    convertir(a.monto, a.tasa, 'pago', String(p.id) + ':' + indice, 1, 'Abono ' + (p.numero ?? p.id))
  }
  for (const g of gastos) {
    if (g.fecha !== fecha || g.pagadoCon !== metodo || g.pagadoCon === 'credito') continue
    if (g.tipo === 'aporte') convertir(g.monto, g.tasa, 'gasto', g.id, 1, 'Aporte de capital')
    else if (['gasto', 'pago_proveedor', 'pago_mano_obra', 'reparto', 'retiro'].includes(g.tipo)) {
      convertir(g.monto, g.tasa, 'gasto', g.id, -1, g.descripcion || g.tipo)
    }
  }
  for (const m of movimientos) {
    if (m.fecha !== fecha || m.pagadoCon !== metodo || m.tipo !== 'entrada') continue
    // Compras: cada movimiento contiene el costo total de su renglón,
    // incluyendo el delivery ya distribuido. No volver a sumar el delivery.
    convertir(Number(m.cantidad) * Number(m.costoUnitario), m.tasa, 'compra', m.id, -1, m.referencia || 'Compra de inventario')
  }
  const pendientes = registros.filter(r => r.estado !== 'ok')
  const entradas = red(registros.filter(r => r.estado === 'ok' && r.signo === 1).reduce((s, r) => s + r.importe, 0))
  const salidas = red(registros.filter(r => r.estado === 'ok' && r.signo === -1).reduce((s, r) => s + r.importe, 0))
  return { moneda, entradas, salidas, pendientes, registros, neto: red(entradas - salidas) }
}
export function calcularArqueo({ inicial, contado, resumen }) {
  if (!valido(inicial) || !valido(contado)) throw new Error('Los montos inicial y contado deben ser números no negativos.')
  if (resumen.pendientes.length) throw new Error('Existen movimientos sin tasa o con importes inválidos; corrígelos antes de cerrar.')
  const esperado = red(Number(inicial) + resumen.entradas - resumen.salidas)
  return { esperado, contado: red(Number(contado)), diferencia: red(Number(contado) - esperado) }
}
