// Conexión con la nube (Supabase). Si no hay claves configuradas, la app funciona
// solo en este navegador, como en las etapas anteriores.
import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { anularAbonoLocal, db, exportarDatos, importarRespaldo, nombreBaseCuenta, prepararAbono, registrarAbono, tieneDatos, TABLAS } from './db.js'
import { estadoErrorCobro, generarRespaldoCobros } from './lib/respaldo-cobros.js'
import { validarRespuestaRemota } from './lib/validacion-nube.js'
import { crearSincronizador } from './lib/sincronizador.js'

// Vercel + Supabase crea estas variables. Solo se leen la URL y la clave pública (anon):
// la seguridad la dan las políticas RLS de la tabla (cada usuaria solo ve su fila).
// Los valores los inyecta vite.config.js al compilar (solo URL y clave pública).
/* global __SUPABASE_URL__, __SUPABASE_CLAVE__ */
const URL = __SUPABASE_URL__
const CLAVE = __SUPABASE_CLAVE__

export const nubeConfigurada = Boolean(URL && CLAVE)
export const supabase = nubeConfigurada ? createClient(URL, CLAVE, { auth: { persistSession: true, autoRefreshToken: true } }) : null

const TABLA = 'atelune_datos'
export const mensajeOperacion = {
  local: 'Guardado localmente.',
  pendiente: 'Pendiente de confirmación. El saldo confirmado sigue igual.',
  nube: 'Confirmado en la nube.',
  conflicto: 'Rechazado por conflicto. Revisa el saldo compartido y el comprobante antes de registrar un nuevo intento.',
  conciliacion: 'Requiere conciliación manual. Revisa el pedido y sus abonos en la nube antes de registrar otro intento.',
}

// ---------- Estado observable ----------
let estado = { fase: 'inactivo', detalle: null }
const oyentes = new Set()
function setEstado(fase, detalle) {
  estado = { fase, detalle }
  oyentes.forEach((f) => f(estado))
}
export function useEstadoNube() {
  const [e, setE] = useState(estado)
  useEffect(() => { oyentes.add(setE); return () => oyentes.delete(setE) }, [])
  return e
}

export function useSesion() {
  const [sesion, setSesion] = useState(undefined)
  useEffect(() => {
    if (!supabase) return setSesion(null)
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return sesion
}

// ---------- Sincronizador ----------
let sinc = null
let temporizador = null

function metaPara(uid) {
  const clave = 'atelune-nube-' + uid
  return {
    get: () => { try { return { version: null, sucio: false, ...JSON.parse(localStorage.getItem(clave) || '{}') } } catch { return { version: null, sucio: false } } },
    set: (p) => {
      try {
        const actual = JSON.parse(localStorage.getItem(clave) || '{}')
        localStorage.setItem(clave, JSON.stringify({ ...actual, ...p }))
      } catch { /* sin almacenamiento: se volverá a sincronizar completo */ }
    },
  }
}

export function reiniciarMetaCuenta(uid) {
  // Una nueva base vacía no puede heredar la versión de una base anterior.
  localStorage.removeItem('atelune-nube-' + uid)
}

function remotoSupabase(uid) {
  return {
    async leer() {
      const { data, error } = await supabase.from(TABLA).select('datos, version').eq('user_id', uid).maybeSingle()
      if (error) throw error
      return validarRespuestaRemota(data)
    },
    async insertar(datos) {
      const { data, error } = await supabase.from(TABLA).insert({ user_id: uid, datos, version: 1, dispositivo: navigator.userAgent.slice(0, 120) }).select('version').single()
      // Dos dispositivos pueden detectar la nube vacía al mismo tiempo.
      // El segundo INSERT viola la clave única: pedir nueva lectura, no dar
      // por sincronizada una copia que Supabase rechazó.
      if (error?.code === '23505') return null
      if (error) throw error
      return data.version
    },
    async actualizar(datos, v) {
      const { data, error } = await supabase.from(TABLA)
        .update({ datos, version: v + 1, actualizado: new Date().toISOString(), dispositivo: navigator.userAgent.slice(0, 120) })
        .eq('user_id', uid).eq('version', v).select('version')
      if (error) throw error
      return data.length ? data[0].version : null
    },
  }
}

const basesConHooks = new WeakSet()
function instalarHooks() {
  if (basesConHooks.has(db)) return
  basesConHooks.add(db)
  const avisar = () => {
    if (!sinc || sinc.aplicandoRemoto) return
    sinc.marcarCambio()
    clearTimeout(temporizador)
    temporizador = setTimeout(() => sinc?.sincronizar(), 2500)
  }
  for (const t of TABLAS) {
    db[t].hook('creating', avisar)
    db[t].hook('updating', avisar)
    db[t].hook('deleting', avisar)
  }
}

export function iniciarNube(uid) {
  if (!supabase || !uid) return
  if (sinc?.uid === uid) return sinc.sincronizar()
  sinc?.detener()
  instalarHooks()
  // Fijar la base por instancia: una respuesta tardía de la cuenta A nunca
  // debe escribir sobre la base actualmente seleccionada para la cuenta B.
  const baseDeSesion = db
  sinc = crearSincronizador({
    remoto: remotoSupabase(uid),
    local: {
      exportar: () => exportarDatos({ origen: baseDeSesion }),
      importar: (datos) => importarRespaldo(datos, { destino: baseDeSesion }),
      tieneDatos: () => tieneDatos({ origen: baseDeSesion }),
    },
    meta: metaPara(uid),
    alEstado: setEstado,
  })
  sinc.uid = uid
  sinc.sincronizar()
}

export function detenerNube() {
  sinc?.detener()
  clearTimeout(temporizador)
  sinc = null
  setEstado('inactivo')
}

export const sincronizarAhora = () => sinc?.sincronizar()
export const resolverConflicto = (eleccion) => sinc?.resolver(eleccion)
export const metaActual = () => (sinc ? metaPara(sinc.uid).get() : null)

export async function exportarRespaldoCobros() {
  const sesion = sinc
  const base = db
  if (!sesion || base.name !== nombreBaseCuenta(sesion.uid)) throw new Error('Abre tu cuenta para respaldar los cobros.')
  const operaciones = await base.transaction('r', base.cobrosPendientes, base.cobrosRevisados, async () =>
    [...await base.cobrosPendientes.toArray(), ...await base.cobrosRevisados.toArray()])
  if (sinc !== sesion || base !== db) throw new Error('La cuenta cambió. Vuelve a descargar el respaldo.')
  return generarRespaldoCobros(sesion.uid, operaciones)
}

export async function archivarCobroRevisado(pedidoId, operacion) {
  const base = db
  await base.transaction('rw', base.cobrosPendientes, base.cobrosRevisados, async () => {
    const actual = await base.cobrosPendientes.get(pedidoId)
    if (!actual || actual.operacion !== operacion || !['conflicto','conciliacion'].includes(actual.estado))
      throw new Error('La operación cambió. Revisa el estado actualizado.')
    await base.cobrosRevisados.add({ ...actual, revisadoEn: new Date().toISOString() })
    await base.cobrosPendientes.delete(pedidoId)
  })
}

export async function guardarCobro(pedidoId, datos) {
  if (!nubeConfigurada) {
    await registrarAbono(pedidoId, datos)
    return 'local'
  }
  const base = db
  const abono = prepararAbono(await base.pedidos.get(pedidoId), datos)
  if (abono.saldoDespues < 0) throw new Error('El importe supera el saldo pendiente de este pedido.')
  return guardarSolicitud(base, pedidoId, datos.idOperacion, 'cobro',
    { abono, modo: datos.modo, saldoEsperado: datos.saldoEsperado })
}

export async function guardarAnulacion(pedidoId, indice, anterior, motivo) {
  if (!nubeConfigurada) {
    await anularAbonoLocal(pedidoId, indice, anterior, motivo)
    return 'local'
  }
  return guardarSolicitud(db, pedidoId, crypto.randomUUID(), 'anulacion', { indice, anterior, motivo })
}

async function guardarSolicitud(base, pedidoId, operacion, tipo, solicitud) {
  try {
    await base.cobrosPendientes.add({ pedidoId, operacion, tipo, solicitud, version: null, estado: 'pendiente' })
  } catch (error) {
    if (error.name === 'ConstraintError') throw new Error('Ya hay una operación para este pedido. Revisa su estado antes de registrar otra.')
    throw error
  }
  return reenviarCobroPendiente(pedidoId, base)
}

export async function reenviarCobroPendiente(pedidoId, base = db) {
  const sesion = sinc
  let pendiente = await base.cobrosPendientes.get(pedidoId)
  if (!pendiente || !sesion || base !== db) return 'pendiente'
  if (pendiente.estado && pendiente.estado !== 'pendiente') return pendiente.estado
  if (pendiente.version == null) {
    await sesion.sincronizar()
    const meta = sinc === sesion ? metaActual() : null
    if (!meta?.version || meta.sucio || estado.fase !== 'ok') return 'pendiente'
    pendiente = await base.transaction('rw', base.cobrosPendientes, async () => {
      const actual = await base.cobrosPendientes.get(pedidoId)
      if (!actual || actual.operacion !== pendiente.operacion || (actual.estado && actual.estado !== 'pendiente')) return null
      if (actual.version != null) return actual
      await base.cobrosPendientes.update(pedidoId, { version: meta.version })
      return { ...actual, version: meta.version }
    })
  }
  if (!pendiente || sinc !== sesion || base !== db) return 'pendiente'
  const { data: versionConfirmada, error } = await supabase.rpc('atelune_confirmar_operacion', {
    p_cuenta: sesion.uid, p_operacion: pendiente.operacion, p_pedido: pedidoId, p_version: pendiente.version,
    p_tipo: pendiente.tipo, p_solicitud: pendiente.solicitud,
  })
  const resultado = error ? estadoErrorCobro(error.code) : 'nube'
  if (resultado === 'pendiente') return resultado
  if (!error && (!Number.isSafeInteger(versionConfirmada) || versionConfirmada <= pendiente.version)) return 'pendiente'
  await base.transaction('rw', base.cobrosPendientes, async () => {
    const actual = await base.cobrosPendientes.get(pedidoId)
    if (actual?.operacion !== pendiente.operacion) return
    if (resultado === 'nube') await base.cobrosPendientes.delete(pedidoId)
    else await base.cobrosPendientes.update(pedidoId, { estado: resultado, codigoError: error.code,
      cambioEstadoEn: new Date().toISOString() })
  })
  if (sinc === sesion) await sesion.sincronizar()
  return resultado
}

// Vuelve a sincronizar al recuperar la conexión, al volver a la pestaña y cada minuto.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => sinc?.sincronizar())
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sinc?.sincronizar() })
  setInterval(() => { if (document.visibilityState === 'visible') sinc?.sincronizar() }, 60000)
}
