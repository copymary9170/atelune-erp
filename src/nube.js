// Conexión con la nube (Supabase). Si no hay claves configuradas, la app funciona
// solo en este navegador, como en las etapas anteriores.
import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { db, exportarDatos, importarRespaldo, tieneDatos, TABLAS } from './db.js'
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

function remotoSupabase(uid) {
  return {
    async leer() {
      const { data, error } = await supabase.from(TABLA).select('datos, version').eq('user_id', uid).maybeSingle()
      if (error) throw error
      return data
    },
    async insertar(datos) {
      const { data, error } = await supabase.from(TABLA).insert({ user_id: uid, datos, version: 1, dispositivo: navigator.userAgent.slice(0, 120) }).select('version').single()
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

let hooksInstalados = false
function instalarHooks() {
  if (hooksInstalados) return
  hooksInstalados = true
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
  instalarHooks()
  sinc = crearSincronizador({
    remoto: remotoSupabase(uid),
    local: {
      exportar: exportarDatos,
      // La configuración de este dispositivo no se pisa con el respaldo local; se trae la de la nube.
      importar: (datos) => importarRespaldo({ ...datos, app: 'atelune-erp' }),
      tieneDatos,
    },
    meta: metaPara(uid),
    alEstado: setEstado,
  })
  sinc.uid = uid
  sinc.sincronizar()
}

export function detenerNube() {
  sinc = null
  setEstado('inactivo')
}

export const sincronizarAhora = () => sinc?.sincronizar()
export const resolverConflicto = (eleccion) => sinc?.resolver(eleccion)
export const metaActual = () => (sinc ? metaPara(sinc.uid).get() : null)

// Vuelve a sincronizar al recuperar la conexión, al volver a la pestaña y cada minuto.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => sinc?.sincronizar())
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sinc?.sincronizar() })
  setInterval(() => { if (document.visibilityState === 'visible') sinc?.sincronizar() }, 60000)
}
