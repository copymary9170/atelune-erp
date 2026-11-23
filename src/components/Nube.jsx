import { useState } from 'react'
import { Marca, Modal } from './ui.jsx'
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
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave })
      if (error) setError(/invalid/i.test(error.message) ? 'Correo o contraseña incorrectos.' : 'No se pudo entrar. Revisa tu conexión y vuelve a intentarlo.')
      else setClave('')
    } catch { setError('No se pudo entrar. Revisa tu conexión y vuelve a intentarlo.') }
    finally { setCargando(false) }
  }

  return (
    <div className="acceso">
      <form onSubmit={entrar} className="tarjeta">
        <Marca size={38} />
        <div className="campo"><label>Correo</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus /></div>
        <div className="campo"><label>Contraseña</label><input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required /></div>
        {error && <p className="pendiente">{error}</p>}
        <button type="submit" disabled={cargando} style={{ width: '100%', justifyContent: 'center' }}>{cargando ? 'Entrando…' : 'Entrar'}</button>
        <p className="ayuda" style={{ marginTop: 12 }}>Si activaste la verificación en dos pasos, te pediremos el código de tu aplicación autenticadora después de la contraseña. Necesitas internet para verificar el acceso.</p>
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
    <button className="sec mini indicador-nube" onClick={() => sincronizarAhora()} title="Sincronizar ahora"
      style={{ whiteSpace: 'normal', textAlign: 'left', justifyContent: 'flex-start' }}>
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
    setOcupado(true)
    try {
      await resolverConflicto(e)
    } catch (error) {
      alert('No se pudo resolver el conflicto: ' + (error?.message || 'Error desconocido') + '. Los datos locales se conservan.')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <Modal titulo="¿Qué datos conservo?" onCerrar={() => {}}>
      {detalle?.financiero ? <p>La copia de este dispositivo cambia abonos de la nube. Descarga un respaldo y concilia los cobros antes de continuar.</p> : <>
        <p>Este dispositivo y la nube tienen cambios distintos. Revisa las diferencias antes de elegir una copia.</p>
        <p className="desglose">En la nube: {n('clientes')} clientes · {n('pedidos')} pedidos · {n('cotizaciones')} cotizaciones · {n('productos')} productos · {n('gastos')} gastos.</p>
      </>}
      <p className="ayuda">Si no estás segura, descarga primero un respaldo de este dispositivo:</p>
      <button className="sec mini" onClick={async () => {
        const datos = await exportarDatos()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }))
        a.download = `atelune-respaldo-dispositivo-${datos.fecha.slice(0, 10)}.json`
        a.click()
      }}>Descargar respaldo de este dispositivo</button>
      {!detalle?.financiero && <div className="modal-pie">
        <button className="sec" disabled={ocupado} onClick={() => elegir('local')}>Conservar este dispositivo</button>
        <button disabled={ocupado} onClick={() => elegir('nube')}>Usar lo de la nube</button>
      </div>}
    </Modal>
  )
}
