// Registro observado de mano de obra: no altera el precio pactado ni la contabilidad.
export function validarTiempo({ etapa, minutos, tarifaHora, responsable, nota = '' }, ruta) {
  if (!ruta?.etapas?.some(p => p.id === etapa)) throw new Error('Selecciona una etapa de la ruta de producción')
  const m = Number(minutos)
  const t = tarifaHora === '' || tarifaHora == null ? null : Number(tarifaHora)
  if (!Number.isFinite(m) || m <= 0 || m > 1440) throw new Error('Los minutos deben ser mayores que cero y no superar 1440')
  if (t !== null && (!Number.isFinite(t) || t < 0 || t > 100000)) throw new Error('La tarifa por hora no es válida')
  if (!String(responsable || '').trim()) throw new Error('Indica quién realizó el trabajo')
  if (String(nota).length > 500) throw new Error('La nota no puede superar 500 caracteres')
  return { etapa, minutos: m, tarifaHora: t, responsable: String(responsable).trim(), nota: String(nota).trim() }
}

export function resumenTiempos(registros = []) {
  return registros.reduce((r, x) => {
    const minutos = Number(x.minutos)
    if (!Number.isFinite(minutos) || minutos <= 0) return r
    r.minutos += minutos
    if (x.tarifaHora == null || x.tarifaHora === '' || !Number.isFinite(Number(x.tarifaHora)) || Number(x.tarifaHora) < 0) r.sinTarifa += 1
    else r.costoConocido += minutos * Number(x.tarifaHora) / 60
    r.registros++
    return r
  }, { minutos: 0, costoConocido: 0, sinTarifa: 0, registros: 0 })
}

export const tiempoLegible = minutos => `${Math.floor(minutos / 60)} h ${Math.round(minutos % 60)} min`
