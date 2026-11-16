import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, tasaVigente } from '../db.js'
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
  const lista = cots.filter(
    (c) => (!estado || c.estado === estado) && (!buscar || (codigo(c.numero) + ' ' + c.cliente).toLowerCase().includes(buscar.toLowerCase())),
  )

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Cotizaciones</h1>
          <p>Calcula el precio de cualquier trabajo con tus costos reales.</p>
        </div>
        <button onClick={async () => navigate('/cotizaciones/' + (await nuevaCotizacion()))}>+ Nueva cotización</button>
      </div>
      <div className="tarjeta">
        <div className="fila">
          <Campo label="Buscar" valor={buscar} onCambio={setBuscar} placeholder="Número o cliente" />
          <Selector label="Estado" valor={estado} onCambio={setEstado} vacio="Todos"
            opciones={Object.entries(ESTADOS).map(([value, label]) => ({ value, label }))} />
        </div>
        <div className="tabla-scroll">
          <table>
            <thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Estado</th><th className="num">Total $</th><th className="num">Total Bs</th><th className="num">Ganancia</th></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="clic" onClick={() => navigate('/cotizaciones/' + c.id)}>
                  <td><strong>{codigo(c.numero)}</strong></td>
                  <td>{fecha(c.fecha)}</td>
                  <td>{c.cliente || <span className="muted">sin cliente</span>}</td>
                  <td><span className={'etiqueta-tipo' + (c.estado === 'aprobada' ? ' ok' : c.estado === 'rechazada' ? ' bajo' : '')}>{ESTADOS[c.estado]}</span></td>
                  <td className="num">{usd(c.calculo?.total)}</td>
                  <td className="num">{bs(c.calculo?.totalBs)}</td>
                  <td className="num">{usd(c.calculo?.ganancia)}</td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={7} className="vacio">{cots.length ? 'Ninguna cotización coincide.' : 'Aún no hay cotizaciones.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
