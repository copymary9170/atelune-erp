import { useEffect, useState } from 'react'
import { supabase } from '../nube.js'
import { comprobarSegundoPaso, mensajeErrorMfa, sesionMfaVerificada, verificarCodigo } from '../lib/mfa.js'
import { Marca } from './ui.jsx'

const nombreAutenticador = f => f.friendly_name?.replace(/^Atelune · /, '').replace(/ · \d{13}$/, '') || 'Aplicación autenticadora'

export function useSegundoPaso(sesion) {
  const token = sesion?.access_token
  const [resultado, setResultado] = useState({ token: null, fase: 'comprobando', factores: [] })
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    let vigente = true
    if (!token || !supabase) return
    comprobarSegundoPaso(supabase.auth).then(datos => {
      if (vigente) setResultado({ token, ...datos })
    }).catch(error => {
      if (vigente) setResultado({ token, fase: 'error', factores: [], error: mensajeErrorMfa(error) })
    })
    return () => { vigente = false }
  }, [token, intento])
  return {
    ...(sesionMfaVerificada(sesion) ? { fase: 'permitida', factores: [] }
      : resultado.token === token ? resultado : { fase: 'comprobando', factores: [] }),
    reintentar: () => { setResultado({ token: null, fase: 'comprobando', factores: [] }); setIntento(x => x + 1) },
  }
}

function CampoCodigo({ codigo, setCodigo, id = 'codigo-mfa' }) {
  return <div className="campo">
    <label htmlFor={id}>Código de 6 dígitos</label>
    <input id={id} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
      value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} required autoFocus />
  </div>
}

export function SegundoPaso({ estado }) {
  const [factorId, setFactorId] = useState('')
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const elegido = factorId || estado.factores[0]?.id
  async function verificar(e) {
    e.preventDefault(); setOcupado(true); setError('')
    try {
      await verificarCodigo(supabase.auth, elegido, codigo)
      setCodigo(''); estado.reintentar()
    } catch (err) { setError(mensajeErrorMfa(err)); setCodigo('') }
    finally { setOcupado(false) }
  }
  return <div className="acceso"><div className="tarjeta">
    <Marca size={38} />
    <h1>Verificación en dos pasos</h1>
    {estado.fase === 'comprobando' ? <p role="status">Comprobando la seguridad de tu cuenta…</p>
      : estado.fase === 'error' ? <>
        <p role="alert" className="pendiente">{estado.error}</p>
        <button onClick={estado.reintentar}>Volver a intentar</button>
      </> : <form onSubmit={verificar}>
        <p>Abre tu aplicación autenticadora y escribe el código de Atelune para entrar.</p>
        {estado.factores.length > 1 && <div className="campo"><label htmlFor="factor-mfa">Autenticador</label>
          <select id="factor-mfa" value={elegido} onChange={e => { setFactorId(e.target.value); setCodigo('') }}>
            {estado.factores.map(f => <option key={f.id} value={f.id}>{nombreAutenticador(f)}</option>)}
          </select></div>}
        <CampoCodigo codigo={codigo} setCodigo={setCodigo} />
        {error && <p className="pendiente" role="alert">{error}</p>}
        <button type="submit" disabled={ocupado || codigo.length !== 6}>{ocupado ? 'Verificando…' : 'Verificar y entrar'}</button>
        <details style={{ marginTop: 16 }}><summary>¿No tienes acceso al autenticador?</summary>
          <p className="ayuda">Usa otro autenticador que hayas vinculado. Si perdiste todos, la recuperación requiere verificar tu identidad con la administración de Atelune; cambiar la contraseña no elimina este paso.</p>
        </details>
      </form>}
    <button className="sec" style={{ marginTop: 16 }} disabled={ocupado} onClick={async () => {
      try {
        const { error: fallo } = await supabase.auth.signOut({ scope: 'local' })
        if (fallo) throw fallo
      } catch { setError('No se pudo cerrar la sesión. Vuelve a intentarlo.') }
    }}>Volver al inicio de sesión</button>
  </div></div>
}

export default function Seguridad() {
  const [factores, setFactores] = useState([])
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [alta, setAlta] = useState(null)
  const [quitar, setQuitar] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('Mi teléfono')
  useEffect(() => {
    let vigente = true
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!vigente) return
      if (error) setError(mensajeErrorMfa(error))
      else setFactores(data.totp)
    }).catch(err => { if (vigente) setError(mensajeErrorMfa(err)) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [])

  async function actuar(accion) {
    setOcupado(true); setError(''); setMensaje('')
    try { await accion() } catch (err) { setError(mensajeErrorMfa(err)) }
    finally { setOcupado(false) }
  }
  async function actualizar() {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) throw error
    setFactores(data.totp)
  }
  function empezar() { return actuar(async () => {
    // Limpiar solamente altas incompletas creadas por esta pantalla.
    const { data: existentes, error: fallo } = await supabase.auth.mfa.listFactors()
    if (fallo) throw fallo
    for (const f of existentes.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified' && f.friendly_name?.startsWith('Atelune · '))) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id })
      if (error) throw error
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Atelune', friendlyName: `Atelune · ${nombre.trim() || 'Autenticador'} · ${Date.now()}` })
    if (error) throw error
    setAlta(data); setCodigo('')
  }) }
  function cancelar() { return actuar(async () => {
    if (alta) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: alta.id })
      if (error) throw error
    }
    setAlta(null); setQuitar(null); setCodigo('')
  }) }
  function confirmar(e) {
    e.preventDefault()
    return actuar(async () => {
      await verificarCodigo(supabase.auth, (alta || quitar).id, codigo)
      if (quitar) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: quitar.id })
        if (error) throw error
        const { error: fallo } = await supabase.auth.refreshSession()
        if (fallo) throw fallo
      }
      setMensaje(alta ? 'Verificación en dos pasos activada.' : 'Autenticador eliminado.')
      setAlta(null); setQuitar(null); setCodigo('')
      await actualizar()
    })
  }
  const qr = alta?.totp?.qr_code
  const fuenteQr = qr?.startsWith('data:') ? qr : qr ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}` : ''
  return <section className="tarjeta" aria-labelledby="seguridad-cuenta">
    <h2 id="seguridad-cuenta">Seguridad: verificación en dos pasos</h2>
    <p>Además de tu contraseña, usa un código de Google Authenticator, Microsoft Authenticator u otra aplicación compatible.</p>
    {cargando ? <p role="status">Consultando autenticadores…</p> : <>
      <p><strong>{factores.length ? 'Activada' : 'Sin activar'}</strong></p>
      {factores.map(f => <div className="acciones" key={f.id} style={{ marginBottom: 12 }}>
        <span>{nombreAutenticador(f)}</span>
        <button className="sec mini" disabled={ocupado || Boolean(alta || quitar)} onClick={() => { setQuitar(f); setCodigo(''); setError(''); setMensaje('') }}>Eliminar autenticador</button>
      </div>)}
      {!alta && !quitar && <>
        <div className="campo"><label htmlFor="nombre-autenticador">Nombre del dispositivo</label>
          <input id="nombre-autenticador" value={nombre} maxLength={40} onChange={e => setNombre(e.target.value)} placeholder="Mi teléfono" /></div>
        <button type="button" disabled={ocupado || Boolean(error)} onClick={empezar}>{ocupado ? 'Preparando…' : factores.length ? 'Añadir autenticador de respaldo' : 'Activar verificación en dos pasos'}</button>
      </>}
      {alta && <>
        <ol>
          <li>Abre tu aplicación autenticadora y elige añadir una cuenta.</li>
          <li>Escanea este QR o escribe la clave manual.</li>
          <li>Introduce el código para terminar la activación.</li>
        </ol>
        <img src={fuenteQr} alt="Código QR para vincular tu autenticador de Atelune" width="220" height="220" style={{ background: '#fff', padding: 12, maxWidth: '100%' }} />
        <details><summary>Ver clave para introducir manualmente</summary>
          <p className="ayuda">Cuenta Atelune · Tipo: basado en tiempo (TOTP)</p>
          <code style={{ overflowWrap: 'anywhere', userSelect: 'all' }}>{alta.totp.secret}</code>
        </details>
        <p className="ayuda">La protección se activa al confirmar el primer código. Mantén esta clave privada.</p>
      </>}
      {quitar && <p>Para eliminar «{nombreAutenticador(quitar)}», introduce su código actual. {factores.length === 1 && 'Al eliminarlo, la cuenta dejará de pedir un segundo paso.'}</p>}
      {(alta || quitar) && <form onSubmit={confirmar} style={{ marginTop: 16 }}>
        <CampoCodigo codigo={codigo} setCodigo={setCodigo} id="codigo-configuracion-mfa" />
        <div className="acciones">
          <button type="submit" disabled={ocupado || codigo.length !== 6}>{ocupado ? 'Verificando…' : alta ? 'Confirmar activación' : 'Confirmar eliminación'}</button>
          <button type="button" className="sec" disabled={ocupado} onClick={cancelar}>Cancelar</button>
        </div>
      </form>}
      {factores.length > 0 && <p className="ayuda">Puedes vincular un segundo dispositivo como respaldo. Guárdalo separado del principal para recuperar el acceso si pierdes tu teléfono.</p>}
    </>}
    {error && <><p role="alert" className="pendiente">{error}</p><button className="sec mini" disabled={ocupado} onClick={() => actuar(actualizar)}>Volver a consultar</button></>}
    {mensaje && <p role="status">{mensaje}</p>}
  </section>
}
