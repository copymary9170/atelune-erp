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

export const hoy = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export const fecha = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('es-VE') : '—')

export const Pendiente = 'DATO PENDIENTE'
