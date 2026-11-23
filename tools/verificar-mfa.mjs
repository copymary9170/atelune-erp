import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// Comprobación real de permisos. Los registros de ensayo siempre se revierten.
export async function verificarMfa(client) {
  const uid = randomUUID()
  const claims = async (aal, sub = uid) => {
    await client.query("select set_config('request.jwt.claims',$1,true), set_config('request.jwt.claim.sub',$2,true), set_config('request.jwt.claim.role','authenticated',true)", [JSON.stringify({ sub, role: 'authenticated', aal }), sub])
  }
  const visibles = async () => (await client.query('select count(*)::int as n from public.atelune_datos where user_id=$1', [uid])).rows[0].n
  await client.query('begin')
  try {
    await client.query('insert into auth.users(id) values ($1)', [uid])
    await client.query("insert into public.atelune_datos(user_id,datos,version) values ($1,'{}',1)", [uid])
    await claims('aal1')
    await client.query('set local role authenticated')
    assert.equal(await visibles(), 1, 'Cuenta sin MFA debe conservar acceso propio')
    await client.query('reset role')
    await client.query("insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) values ($1,$2,'Ensayo temporal MFA','totp','verified','ensayo-sin-credencial',now(),now())", [randomUUID(), uid])
    await client.query('set local role authenticated')
    assert.equal(await visibles(), 0, 'Contraseña sola no puede leer datos con MFA')
    await client.query('reset role')
    // Simula una escritura desde un RPC SECURITY DEFINER, que omite RLS.
    await client.query('savepoint escritura_mfa')
    let rechazada = false
    try { await client.query('update public.atelune_datos set version=version+1 where user_id=$1', [uid]) }
    catch (error) {
      if (error.code !== '42501') throw error
      rechazada = true
      await client.query('rollback to savepoint escritura_mfa')
    }
    assert.equal(rechazada, true, 'El trigger debe bloquear RPC sin segundo paso')
    await claims('aal2')
    await client.query('set local role authenticated')
    assert.equal(await visibles(), 1, 'MFA completada permite leer datos propios')
    assert.equal((await client.query('update public.atelune_datos set version=version+1 where user_id=$1', [uid])).rowCount, 1)
    await claims('aal2', randomUUID())
    assert.equal(await visibles(), 0, 'MFA no debe permitir leer otra cuenta')
  } finally { await client.query('rollback') }
}
