import { validarRespaldo } from '../db.js'

// Verificación defensiva del formato recibido de la nube; no modifica el objeto.
export function validarRespuestaRemota(fila) {
  if (fila == null) return null
  if (!fila || typeof fila !== 'object' || Array.isArray(fila)) throw new Error('Respuesta de nube inválida.')
  if (!Number.isSafeInteger(fila.version) || fila.version < 1) throw new Error('Versión de copia remota inválida.')
  validarRespaldo(fila.datos)
  return fila
}
