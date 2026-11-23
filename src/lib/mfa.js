// La decisión se toma con Supabase; nunca con una preferencia editable del ERP.
export function sesionMfaVerificada(sesion) {
  // Igual que getAuthenticatorAssuranceLevel() del SDK: lectura local para la
  // interfaz offline. La API y RLS validan el JWT antes de autorizar datos remotos.
  try {
    const parte = sesion.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const jwt = JSON.parse(atob(parte))
    return Boolean(sesion.user?.id && jwt.sub === sesion.user.id && jwt.aal === 'aal2')
  } catch { return false }
}

export async function comprobarSegundoPaso(auth) {
  const { data: nivel, error } = await auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) throw error
  if (nivel?.currentLevel === 'aal2') return { fase: 'permitida', factores: [] }
  if (nivel?.currentLevel !== 'aal1') throw new Error('Inicia sesión nuevamente.')
  const { data, error: errorFactores } = await auth.mfa.listFactors()
  if (errorFactores) throw errorFactores
  const verificados = (data?.all || []).filter(f => f.status === 'verified')
  const factores = verificados.filter(f => f.factor_type === 'totp')
  if (verificados.length && !factores.length) throw new Error('Esta cuenta usa un segundo factor que no se puede verificar aquí.')
  return { fase: factores.length ? 'codigo' : 'permitida', factores }
}

export async function verificarCodigo(auth, factorId, codigo) {
  if (!factorId || !/^\d{6}$/.test(codigo)) throw new Error('Escribe el código de 6 dígitos de tu aplicación autenticadora.')
  const { data, error } = await auth.mfa.challengeAndVerify({ factorId, code: codigo })
  if (error) throw error
  return data
}

export function mensajeErrorMfa(error) {
  if (/mfa_verification_failed|mfa_challenge_expired|mfa_verification_rejected/.test(error?.code || ''))
    return 'El código es incorrecto o venció. Espera el siguiente código y vuelve a intentarlo.'
  if (error?.status === 429 || /rate_limit|too_many/.test(error?.code || ''))
    return 'Hubo demasiados intentos. Espera unos minutos antes de volver a intentarlo.'
  if (/fetch|network|offline/i.test(error?.message || '')) return 'Conéctate a internet para verificar tu cuenta y vuelve a intentarlo.'
  return 'No se pudo completar la verificación. Revisa tu conexión y vuelve a intentarlo.'
}
