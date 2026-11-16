import { useState } from 'react'
import { Logo, Modal } from './ui.jsx'
import { supabase, useEstadoNube, resolverConflicto, sincronizarAhora } from '../nube.js'
import { exportarDatos } from '../db.js'

export function Acceso() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setCargando(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave })
    setCargando(false)
    if (error) setError(/invalid/i.test(error.message) ? 'Correo o contraseña incorrectos.' : 'No se pudo entrar: ' + error.message)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: 'var(--tinta)' }}>
      <form onSubmit={entrar} className="tarjeta" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
          <div style={{ background: 'var(--tinta)', borderRadius: 10, padding: 6, display: 'flex' }}><Logo size={36} /></div>
          <div><h1 style={{ margin: 0 }}>Atelune</h1><span className="muted">Administración</span></div>
        </div>
        <div className="campo"><label>Correo</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus /></div>
        <div className="campo"><label>Contraseña</label><input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required /></div>
        {error && <p className="pendiente">{error}</p>}
        <button type="submit" disabled={cargando} style={{ width: '100%', justifyContent: 'center' }}>{cargando ? 'Entrando…' : 'Entrar'}</button>
        <p className="ayuda" style={{ marginTop: 12 }}>Después del primer ingreso, la app funciona aunque se vaya el internet y guarda en la nube al volver.</p>
      </form>
    </div>
  )
}

const TEXTO = {
  inactivo: ['', 'Solo en este dispositivo'],
  sincronizando: ['⟳', 'Guardando en la nube…'],
  ok: ['☁', 'Guardado en la nube'],
  sin_conexion: ['⚠', 'Sin internet: se guardará al volver'],
  conflicto: ['⚠', 'Hay cambios en otro dispositivo'],
  error: ['⚠', 'Error al sincronizar'],
}

export function IndicadorNube() {
  const { fase } = useEstadoNube()
  const [icono, texto] = TEXTO[fase] || TEXTO.inactivo
  return (
    <button className="sec mini" onClick={() => sincronizarAhora()} title="Sincronizar ahora"
      style={{ color: 'var(--papel)', borderColor: 'transparent', opacity: .8, whiteSpace: 'normal', textAlign: 'left', margin: '14px 6px 0' }}>
      {icono} {texto}
    </button>
  )
}

export function ConflictoNube() {
  const { fase, detalle } = useEstadoNube()
  const [ocupado, setOcupado] = useState(false)
  if (fase !== 'conflicto') return null
  const n = (k) => detalle?.datos?.[k]?.length ?? 0
  async function elegir(e) {
    if (e === 'local' && !confirm('Se reemplazará lo que hay en la nube por lo de este dispositivo. ¿Continuar?')) return
    if (e === 'nube' && !confirm('Se reemplazará lo de este dispositivo por lo que hay en la nube. ¿Continuar?')) return
    setOcupado(true); await resolverConflicto(e); setOcupado(false)
  }
  return (
    <Modal titulo="¿Qué datos conservo?" onCerrar={() => {}}>
      <p>Este dispositivo y la nube tienen cambios distintos. Elige cuál conservar; el otro se reemplaza.</p>
      <p className="desglose">En la nube: {n('clientes')} clientes · {n('pedidos')} pedidos · {n('cotizaciones')} cotizaciones · {n('productos')} productos · {n('gastos')} gastos.</p>
      <p className="ayuda">Si no estás segura, descarga primero un respaldo de este dispositivo:</p>
      <button className="sec mini" onClick={async () => {
        const datos = await exportarDatos()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }))
        a.download = `atelune-respaldo-dispositivo-${datos.fecha.slice(0, 10)}.json`
        a.click()
      }}>Descargar respaldo de este dispositivo</button>
      <div className="modal-pie">
        <button className="sec" disabled={ocupado} onClick={() => elegir('local')}>Conservar este dispositivo</button>
        <button disabled={ocupado} onClick={() => elegir('nube')}>Usar lo de la nube</button>
      </div>
    </Modal>
  )
}
