// Panel de operaciones: clasificación de pedidos SIN cambiar sus registros.
// Las fechas son YYYY-MM-DD locales, no se convierten a UTC para evitar desfaces.
import { saldoPedido } from './calc.js'

const CERRADOS = new Set(['entregado', 'cancelado'])
export function diasEntre(fecha, hoy) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hoy || '')) return null
  const [y, m, d] = fecha.split('-').map(Number)
  const [hy, hm, hd] = hoy.split('-').map(Number)
  const origen = Date.UTC(hy, hm - 1, hd)
  const destino = Date.UTC(y, m - 1, d)
  if (new Date(destino).toISOString().slice(0, 10) !== fecha) return null
  return Math.round((destino - origen) / 86400000)
}

export function analizarAgenda(pedidos = [], hoy) {
  const activos = pedidos.filter(p => !CERRADOS.has(p.estado))
  const fichas = activos.map(p => {
    const dias = diasEntre(p.fechaEntrega, hoy)
    const saldo = Math.max(0, saldoPedido(p))
    const urgencia = dias === null ? 'sin_fecha' : dias < 0 ? 'vencido' : dias === 0 ? 'hoy' : dias <= 3 ? 'proximo' : 'programado'
    return { ...p, dias, saldo, urgencia }
  }).sort((a, b) => {
    const orden = { vencido: 0, hoy: 1, proximo: 2, programado: 3, sin_fecha: 4 }
    return orden[a.urgencia] - orden[b.urgencia] || (a.fechaEntrega || '').localeCompare(b.fechaEntrega || '') || (a.numero || 0) - (b.numero || 0)
  })
  return {
    fichas,
    vencidos: fichas.filter(p => p.urgencia === 'vencido'),
    hoy: fichas.filter(p => p.urgencia === 'hoy'),
    proximos: fichas.filter(p => p.urgencia === 'proximo'),
    sinFecha: fichas.filter(p => p.urgencia === 'sin_fecha'),
    porCobrar: pedidos.filter(p => p.estado !== 'cancelado').reduce((s, p) => s + Math.max(0, saldoPedido(p)), 0),
    porCobrarActivos: fichas.reduce((s, p) => s + p.saldo, 0),
  }
}
