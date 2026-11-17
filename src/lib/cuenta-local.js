// La base IndexedDB de esta versión se comparte entre sesiones del navegador.
// Bloqueamos cuentas distintas ANTES de mostrar o sincronizar datos locales.
// Esta comprobación es una defensa de compatibilidad, no sustituye una base por usuario.
export const CLAVE_PROPIETARIO = 'atelune-propietario-local-v1'

export function decidirAccesoLocal(uid, propietario, hayDatos) {
  if (!uid || typeof uid !== 'string') return 'bloqueada'
  if (propietario && propietario !== uid) return 'bloqueada'
  if (propietario === uid) return 'permitida'
  return hayDatos ? 'confirmar' : 'vincular'
}

export function leerPropietarioLocal() {
  // No devolver null si falla el almacenamiento: es preferible bloquear a mezclar datos.
  return localStorage.getItem(CLAVE_PROPIETARIO)
}

export function vincularPropietarioLocal(uid) {
  if (!uid || typeof uid !== 'string') throw new Error('Cuenta no válida.')
  const actual = leerPropietarioLocal()
  if (actual && actual !== uid) throw new Error('Este navegador contiene datos vinculados a otra cuenta.')
  localStorage.setItem(CLAVE_PROPIETARIO, uid)
  if (leerPropietarioLocal() !== uid) throw new Error('No se pudo guardar la protección de cuenta en este navegador.')
  return true
}
