import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, tasaVigente, duplicarCotizacion } from '../db.js'
import { Campo, Selector } from '../components/ui.jsx'
import { usd, bs, fecha, hoy } from '../lib/format.js'

export const ESTADOS = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

export async function nuevaCotizacion() {
  const ultima = await db.cotizaciones.orderBy('numero').last()
  const numero = (ultima?.numero ?? 0) + 1
  const tasa = await tasaVigente()
  return db.cotizaciones.add({
    numero, fecha: hoy(), estado: 'borrador', cliente: '', contactoCliente: '',
    items: [], envio: null, metodoPagoIdx: 0, aplicarIva: false, tasa: tasa?.tasa ?? null, notas: '', calculo: null,
  })
}

export const codigo = (num) => 'COT-' + String(num).padStart(4, '0')

export default function Cotizaciones() {
  const cots = useLiveQuery(() => db.cotizaciones.orderBy('numero').reverse().toArray(), [], [])
  const navigate = useNavigate()
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState('')
  const [duplicando, setDuplicando] = useState(null)
  const [error, setError] = useState('')
  const lista = cots.filter(
    (c) => (!estado || c.estado === estado) && (!buscar || (codigo(c.numero) + ' ' + c.cliente).toLowerCase().includes(buscar.toLowerCase())),
  )

  async function duplicar(c) {
    if (duplicando !== null) return
    setError('')
    setDuplicando(c.id)
    try {
      const nuevaId = await duplicarCotizacion(c.id)
      navigate('/cotizaciones/' + nuevaId)
    } catch (e) {
      setError(e?.message || 'No se pudo duplicar la cotización.')
    } finally {
      setDuplicando(null)
    }
  }

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Cotizaciones</h1>
          <p>Calcula el precio de cualquier trabajo con tus costos reales.</p>
        </div>
        <button onClick={async () => navigate('/cotizaciones/' + (await nuevaCotizacion()))}>+ Nueva cotización</button>
      </div>
      {error && <p className="pendiente" role="alert">{error}</p>}
      <div className="tarjeta">
        <div className="fila">
          <Campo label="Buscar" valor={buscar} onCambio={setBuscar} placeholder="Número o cliente" />
          <Selector label="Estado" valor={estado} onCambio={setEstado} vacio="Todos"
            opciones={Object.entries(ESTADOS).map(([value, label]) => ({ value, label }))} />
        </div>
        <div className="tabla-scroll">
          <table>
            <thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Estado</th><th className="num">Total $</th><th className="num">Total Bs</th><th className="num">Ganancia</th><th>Acciones</th></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="clic" onClick={() => navigate('/cotizaciones/' + c.id)}>
                  <td><strong>{codigo(c.numero)}</strong></td>
                  <td>{fecha(c.fecha)}</td>
                  <td>{c.cliente || <span className="muted">sin cliente</span>}</td>
                  <td><span className={'etiqueta-tipo' + (c.estado === 'aprobada' ? ' ok' : c.estado === 'rechazada' ? ' bajo' : c.estado === 'enviada' ? ' proceso' : ' neutro')}>{ESTADOS[c.estado]}</span></td>
                  <td className="num">{usd(c.calculo?.total)}</td>
                  <td className="num">{bs(c.calculo?.totalBs)}</td>
                  <td className="num">{usd(c.calculo?.ganancia)}</td>
                  <td><button className="sec mini" disabled={duplicando !== null}
                    onClick={(ev) => { ev.stopPropagation(); duplicar(c) }}
                    aria-label={'Duplicar ' + codigo(c.numero)}>
                    {duplicando === c.id ? 'Duplicando…' : 'Duplicar'}
                  </button></td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={8} className="vacio">{cots.length ? 'Ninguna cotización coincide.' : 'Aún no hay cotizaciones.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
