import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { supabase } from '../nube.js'
import { Campo, Selector } from '../components/ui.jsx'
import { fecha, hoy, num } from '../lib/format.js'
import { TIPOS_TASA, tipoTasaHistorica } from '../lib/tasas-multiples.js'
import {
  BANCOS_VENEZUELA, TIPOS_LOTE, crearFilaLote, prepararLoteTasas,
  analizarRespuestaBCV, analizarRespuestaBancos,
} from '../lib/tasas-lote.js'

const filasIniciales = () => TIPOS_LOTE.map(tipo => crearFilaLote(tipo))
const identificadorFila = (_f, i) => String(i)

export default function Tasas() {
  const tasas = useLiveQuery(() => db.tasas.orderBy('fecha').reverse().toArray(), [], [])
  const [fechaLote, setFechaLote] = useState(hoy())
  const [hora, setHora] = useState('')
  const [filas, setFilas] = useState(filasIniciales)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [sugerencias, setSugerencias] = useState([])
  const [origenBCV, setOrigenBCV] = useState('')
  const cambiar = (i, campo, valor) => setFilas(actual => actual.map((f,j) => i === j
    ? { ...f, [campo]: valor, ...(campo === 'tasa' ? { origen: 'manual', enlace: '' } : {}) } : f))
  const agregarBanco = () => setFilas(actual => actual.length < 40
    ? [...actual, crearFilaLote('menudeo')] : actual)
  const agregarPersonalizada = () => setFilas(actual => actual.length < 40
    ? [...actual, crearFilaLote('personalizada')] : actual)

  async function consultarBCV() {
    setError(''); setMensaje(''); setOcupado(true)
    try {
      const respuesta = await fetch('https://bcv.today/api/v1/rate.json', { cache: 'no-store' })
      if (!respuesta.ok) throw new Error('No fue posible consultar las referencias BCV.')
      const resultado = analizarRespuestaBCV(await respuesta.json(), fechaLote)
      setFilas(prev => prev.map(f => f.tipo === 'bcv_usd' ? {
        ...f, tasa: resultado.usd, origen: 'bcv.today', enlace: resultado.enlace,
      } : f.tipo === 'bcv_eur' ? {
        ...f, tasa: resultado.eur, origen: 'bcv.today', enlace: resultado.enlace,
      } : f))
      setOrigenBCV(resultado.fecha)
      setMensaje('Referencias BCV recibidas (fecha valor: ' + resultado.fecha + '). Revísalas antes de guardar. No están guardadas todavía.')
    } catch (e) {
      setError(e.message || 'No se pudo consultar la referencia BCV.')
    } finally { setOcupado(false) }
  }

  async function consultarBancos() {
    setError(''); setMensaje(''); setOcupado(true)
    try {
      if (!supabase) throw new Error('Primero conecta Atelune a Supabase para consultar la API bancaria.')
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) throw new Error('Inicia sesión para consultar referencias bancarias.')
      const resp = await fetch('/api/tasas-bancos', {
        cache: 'no-store', headers: { Authorization: 'Bearer ' + token },
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Conexión bancaria no disponible.')
      const filasBanco = analizarRespuestaBancos(data.datos, fechaLote)
      setSugerencias(filasBanco)
      setMensaje(filasBanco.length
        ? 'Llegaron referencias bancarias orientativas. El proveedor no identifica compra/venta: confirma la tasa directamente con el banco antes de registrarla.'
        : 'La fuente bancaria no presentó cotizaciones recientes válidas. No se ha cambiado ninguna tasa.')
    } catch (e) {
      setError(e.message || 'No se pudo consultar el proveedor bancario.')
    } finally { setOcupado(false) }
  }

  async function guardarLote(e) {
    e.preventDefault()
    setError(''); setMensaje('')
    let registros
    try {
      registros = prepararLoteTasas(filas, fechaLote, hora)
    } catch (err) { setError(err.message || 'Error al validar tasas.'); return }
    setOcupado(true)
    try {
      // Una sola transacción: si una fila falla, NINGUNA de las tasas del lote se guarda.
      await db.transaction('rw', db.tasas, async () => {
        await db.tasas.bulkAdd(registros.map(r => ({
          ...r,
          hora: r.hora || new Date().toTimeString().slice(0, 5),
          registradoEn: new Date().toISOString(),
        })))
      })
      setMensaje('Se guardaron ' + registros.length + ' tasas independientes. No se alteró ninguna tasa antigua.')
      setFilas(filasIniciales())
      setOrigenBCV('')
      setSugerencias([])
    } catch (err) {
      setError(err?.message || 'Error al guardar el lote.')
    } finally { setOcupado(false) }
  }

  return <>
    <div className="encabezado">
      <div>
        <h1>Tasas de cambio</h1>
        <p>Registra todas las referencias juntas. Cada tasa conserva tipo, hora, banco y procedencia; no modifica cotizaciones anteriores.</p>
      </div>
    </div>
    <div className="tarjeta">
      <h2>Consultar fuentes</h2>
      <div className="fila">
        <div className="campo auto"><button type="button" className="sec" disabled={ocupado} onClick={consultarBCV}>Consultar BCV dólar y euro</button></div>
        <div className="campo auto"><button type="button" className="sec" disabled={ocupado} onClick={consultarBancos}>Consultar referencias de bancos</button></div>
        <div className="campo auto"><a href="https://www.bcv.org.ve/" target="_blank" rel="noopener noreferrer">Comprobar en BCV oficial</a></div>
      </div>
      <p className="ayuda">BCV: lectura de <a href="https://bcv.today/api/" target="_blank" rel="noopener noreferrer">bcv.today</a>, una fuente independiente, no la página oficial. Verifica la fecha valor y la cotización antes de guardarla. Los bancos requieren una API autorizada; las referencias disponibles pueden ser antiguas o no distinguir compra y venta.</p>
      {origenBCV && <p className="ayuda">Fecha valor consultada: <strong>{origenBCV}</strong>. Comprueba que corresponda a la fecha del lote.</p>}
      <p className="ayuda">Consulta las condiciones de cada banco en su sitio oficial (sin introducir contraseñas en Atelune):</p>
      <div className="fila">
        {BANCOS_VENEZUELA.map(b => <div className="campo auto" key={b.nombre}>
          <a href={b.url} target="_blank" rel="noopener noreferrer">{b.nombre}</a>
        </div>)}
      </div>
      {sugerencias.length > 0 && <div className="subtabla">
        <h4>Referencias bancarias informativas ({sugerencias.length})</h4>
        <p className="ayuda">No se incorporan automáticamente al libro ni al formulario: la fuente no diferencia la tasa a la que tú compras o vendes divisas. Compruébala con el banco y escríbela en la fila correspondiente.</p>
        <div className="tabla-scroll"><table><thead><tr><th>Entidad</th><th>Tasa publicada Bs/USD</th><th>Fecha publicada</th></tr></thead>
          <tbody>{sugerencias.map((x,i) => <tr key={i}><td>{x.entidad}</td><td>{num(x.tasa,4)}</td><td>{x.fecha}</td></tr>)}</tbody></table></div>
      </div>}
    </div>

    <form className="tarjeta" onSubmit={guardarLote}>
      <h2>Cargar todas las tasas</h2>
      <div className="fila">
        <Campo label="Fecha del registro" tipo="date" valor={fechaLote} onCambio={setFechaLote} />
        <Campo label="Hora (opcional, misma para el lote)" tipo="time" valor={hora} onCambio={setHora} />
      </div>
      <p className="ayuda">Completa las que conozcas y deja las demás vacías. Se guardan todas las filas con tasa válida en una sola operación. Si hay una fila inválida, no se guarda ninguna. Los valores de referencia se pueden cambiar manualmente antes de confirmar.</p>
      {filas.map((f,i) => <div className="subtabla" key={identificadorFila(f,i)}>
        <div className="fila">
          <div className="campo"><label>Referencia</label><strong>{TIPOS_TASA[f.tipo].nombre}</strong></div>
          <Campo label={'Bs por 1 ' + TIPOS_TASA[f.tipo].unidad} tipo="number" valor={f.tasa} onCambio={v => cambiar(i,'tasa',v)} />
          {(f.tipo === 'bcv_eur' || f.tipo === 'usdt') &&
            <Campo label={'USD por 1 ' + TIPOS_TASA[f.tipo].unidad + ' (opcional)'} tipo="number" valor={f.usdPorUnidad} onCambio={v => cambiar(i,'usdPorUnidad',v)} />}
          {f.tipo === 'menudeo' && <>
            <Selector label="Banco" valor={f.entidad} onCambio={v => cambiar(i,'entidad',v)}
              opciones={BANCOS_VENEZUELA.map(b => ({value:b.nombre,label:b.nombre}))} />
            <Selector label="Operación de divisas" valor={f.sentido} onCambio={v => cambiar(i,'sentido',v)}
              opciones={[{value:'compra',label:'Compras divisas'},{value:'venta',label:'Vendes divisas'}]} />
            <Campo label="Comisión (%) informativa" tipo="number" valor={f.comisionPct} onCambio={v => cambiar(i,'comisionPct',v)} />
          </>}
          {i >= TIPOS_LOTE.length && <div className="campo auto">
            <button type="button" className="sec mini" onClick={() => setFilas(prev => prev.filter((_,j) => j !== i))}>Quitar fila</button>
          </div>}
        </div>
        {f.origen !== 'manual' && <p className="ayuda">Importada de {f.origen} (aún sin guardar). Confirma la fecha y el importe.</p>}
      </div>)}
      <div className="fila">
        <div className="campo auto"><button type="button" className="sec" onClick={agregarBanco} disabled={filas.length >= 40}>+ Otro banco / compra o venta</button></div>
        <div className="campo auto"><button type="button" className="sec" onClick={agregarPersonalizada} disabled={filas.length >= 40}>+ Tasa personalizada</button></div>
        <div className="campo auto"><button type="submit" disabled={ocupado}>{ocupado ? 'Procesando…' : 'Guardar todas las tasas completadas'}</button></div>
      </div>
      <p className="ayuda">Menudeo: se guarda por banco y por sentido. Las comisiones se registran como información y no se aplican dos veces. La consulta de tasas no accede a cuentas bancarias ni realiza pagos.</p>
      {error && <p role="alert" className="pendiente">{error}</p>}
      {mensaje && <p role="status" className="ayuda">{mensaje}</p>}
    </form>
    <div className="tarjeta tabla-scroll">
      <h2>Historial de tasas</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Hora</th><th>Tipo / fuente</th><th className="num">Bs por unidad</th><th>Equiv. USD</th><th>Banco / sentido</th><th>Procedencia</th></tr></thead>
        <tbody>{tasas.map(t => {
          const identificada = tipoTasaHistorica(t)
          return <tr key={t.id}>
            <td>{fecha(t.fecha)}</td><td>{t.hora || '—'}</td>
            <td>{identificada ? TIPOS_TASA[identificada].nombre : 'Histórica sin clasificar'}{!t.tipo && <div className="desglose">Fuente antigua: {t.fuente || 'desconocida'}</div>}</td>
            <td className="num">{num(t.tasa,4)} Bs/{TIPOS_TASA[identificada]?.unidad || '?'}</td>
            <td>{t.usdPorUnidad || '—'}</td><td>{[t.entidad,t.sentido].filter(Boolean).join(' · ') || '—'}</td>
            <td>{t.origen || 'Manual / histórico'}</td>
          </tr>
        })}
        {!tasas.length && <tr><td colSpan={7} className="vacio">Aún no hay tasas cargadas.</td></tr>}
        </tbody>
      </table>
    </div>
  </>
}
