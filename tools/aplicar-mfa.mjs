// Migración idempotente durante el build de producción de Vercel.
// La conexión ya configurada se usa en el servidor y nunca se escribe ni imprime.
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { verificarMfa } from './verificar-mfa.mjs'

if (process.env.VERCEL_ENV === 'production') {
  const connectionString = process.env.SUPABASE_POSTGRES_URL || process.env.SUPABASE_POSTGRES_URL_NON_POOLING
  if (!connectionString) throw new Error('Falta la conexión a Supabase para aplicar la protección de dos pasos.')
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15000, query_timeout: 30000 })
  try {
    await client.connect()
    await client.query(await readFile(new URL('../supabase/verificacion_dos_pasos.sql', import.meta.url), 'utf8'))
    await verificarMfa(client)
    console.log('Protección de verificación en dos pasos aplicada en Supabase.')
    console.log('Permisos comprobados: sin MFA, AAL1 bloqueada, AAL2 permitida, RPC protegida y cuentas aisladas. Ensayo revertido.')
  } catch (error) {
    // Los errores de conexión pueden incluir credenciales: mensaje deliberadamente fijo.
    console.error('No se pudo aplicar o comprobar la protección MFA en Supabase; el despliegue se detuvo.', /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : '')
    process.exitCode = 1
  } finally { await client.end().catch(() => {}) }
}
