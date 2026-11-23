export const usd = (v) =>
  v == null || !Number.isFinite(Number(v))
    ? '—'
    : '$' + Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const bs = (v) =>
  v == null || !Number.isFinite(Number(v))
    ? '—'
    : 'Bs ' + Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const num = (v, d = 2) =>
  v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('es-VE', { maximumFractionDigits: d })

export const pct = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : num(Number(v) * 100, 1) + ' %')

const calendarioCaracas = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
})
export function fechaContable(instante = new Date()) {
  if (typeof instante === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(instante)) return instante
  if (instante == null) return null
  const fecha = new Date(instante)
  if (!Number.isFinite(fecha.getTime())) return null
  const partes = Object.fromEntries(calendarioCaracas.formatToParts(fecha).map(p => [p.type, p.value]))
  return [partes.year, partes.month, partes.day].join('-')
}
export const hoy = () => fechaContable()

export const fecha = (iso) => {
  const dia = iso ? fechaContable(iso) : null
  return dia ? new Date(dia + 'T12:00:00Z').toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '—'
}

export const Pendiente = 'DATO PENDIENTE'
