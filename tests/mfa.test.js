import test from 'node:test'
import assert from 'node:assert/strict'
import { comprobarSegundoPaso, verificarCodigo, mensajeErrorMfa, sesionMfaVerificada } from '../src/lib/mfa.js'

test('solo una sesión AAL2 de la misma cuenta permite reabrir la interfaz sin red', () => {
  const sesion = (sub, aal) => ({ user: { id: 'propietaria' }, access_token: 'cabecera.' + btoa(JSON.stringify({ sub, aal })) + '.firma' })
  assert.equal(sesionMfaVerificada(sesion('propietaria', 'aal2')), true)
  for (const s of [null, {}, { access_token: 'malformado' }, sesion('otra-cuenta', 'aal2'), sesion('propietaria', 'aal1')])
    assert.equal(sesionMfaVerificada(s), false)
})

const factor = { id: 'telefono', factor_type: 'totp', status: 'verified' }
function auth(nivel, factores = [], errorFactores = null) {
  return { mfa: {
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: nivel } }),
    listFactors: async () => ({ data: { all: factores }, error: errorFactores }),
  } }
}
test('contraseña sin código bloquea a una cuenta con TOTP y omite factores sin confirmar', async () => {
  const r = await comprobarSegundoPaso(auth('aal1', [factor, { ...factor, id: 'incompleto', status: 'unverified' }]))
  assert.equal(r.fase, 'codigo')
  assert.deepEqual(r.factores, [factor])
})
test('cuenta sin MFA confirmada conserva el acceso; AAL2 conserva acceso local sin consultar factores', async () => {
  assert.equal((await comprobarSegundoPaso(auth('aal1', [{ ...factor, status: 'unverified' }]))).fase, 'permitida')
  const a = auth('aal2')
  a.mfa.listFactors = () => { throw new Error('No debe necesitar red para una sesión AAL2 ya comprobada') }
  assert.equal((await comprobarSegundoPaso(a)).fase, 'permitida')
})
test('fallos de red, falta de nivel o factor incompatible nunca abren la cuenta', async () => {
  await assert.rejects(comprobarSegundoPaso(auth('aal1', [], new Error('Network error'))))
  await assert.rejects(comprobarSegundoPaso(auth(null)))
  await assert.rejects(comprobarSegundoPaso(auth('aal1', [{ ...factor, factor_type: 'phone' }])))
})
test('verificación exige seis dígitos y envía el desafío al factor seleccionado', async () => {
  const llamadas = []
  const a = { mfa: { challengeAndVerify: async p => { llamadas.push(p); return { data: { access_token: 'solo-prueba' } } } } }
  for (const code of ['', '12345', '1234567', '12a456']) await assert.rejects(verificarCodigo(a, 'telefono', code))
  await assert.rejects(verificarCodigo(a, '', '012345'))
  assert.equal(llamadas.length, 0)
  assert.deepEqual(await verificarCodigo(a, 'respaldo', '012345'), { access_token: 'solo-prueba' })
  assert.deepEqual(llamadas, [{ factorId: 'respaldo', code: '012345' }])
})
test('un código rechazado no se acepta y los errores no revelan secretos', async () => {
  const error = { code: 'mfa_verification_failed', message: 'secreto-no-exponer' }
  await assert.rejects(verificarCodigo({ mfa: { challengeAndVerify: async () => ({ error }) } }, 'telefono', '123456'), e => e === error)
  assert.match(mensajeErrorMfa(error), /incorrecto o venció/)
  assert.match(mensajeErrorMfa({ status: 429 }), /demasiados intentos/)
  assert.doesNotMatch(mensajeErrorMfa({ message: 'secreto-no-exponer' }), /secreto/)
})
