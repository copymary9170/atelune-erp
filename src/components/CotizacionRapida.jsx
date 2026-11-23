import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { datosCotizacion, db, guardarCotizacionRapida } from '../db.js'
import { calcularCotizacionRapida } from '../lib/cotizaciones.js'
import { usd } from '../lib/format.js'
import { Avisos, Campo, Modal, Selector } from './ui.jsx'

export default function CotizacionRapida({ onCerrar }) {
  const plantillas = useLiveQuery(() => db.plantillas.orderBy('nombre').toArray(), [])
  const datos = useLiveQuery(datosCotizacion, [])
  const navigate = useNavigate()
  const [servicio, setServicio] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const plantilla = plantillas?.find(p => p.id === Number(servicio))
  const resultado = plantilla && datos ? calcularCotizacionRapida(plantilla, cantidad, datos) : null
  const calculo = resultado?.cotizacion?.calculo

  async function guardar() {
    if (!plantilla || !calculo || guardando) return
    setGuardando(true)
    setError('')
    try {
      const id = await guardarCotizacionRapida(plantilla.id, cantidad, calculo.total)
      onCerrar()
      navigate('/cotizaciones/' + id)
    } catch (errorGuardado) {
      setError(errorGuardado.message || 'No se pudo guardar el borrador.')
      setGuardando(false)
    }
  }

  return (
    <Modal titulo="Cotización rápida" onCerrar={() => { if (!guardando) onCerrar() }}>
      {!plantillas || !datos ? <p role="status">Cargando servicios…</p> : plantillas.length === 0 ? (
        <p>Para cotizar rápido, guarda un servicio en <Link to="/plantillas">Plantillas de trabajo</Link>.</p>
      ) : (
        <div className="fila">
          <Selector label="Servicio" valor={servicio} vacio="Selecciona un servicio"
            opciones={plantillas.map(p => ({ value: p.id, label: p.descripcion || p.nombre }))}
            onCambio={valor => { setServicio(valor); setError('') }} />
          <Campo label="Cantidad" className="angosto" tipo="number" min={1} step={1} valor={cantidad}
            onCambio={valor => { setCantidad(valor); setError('') }} />
        </div>
      )}
      {calculo && (
        <div className="resumen" aria-live="polite">
          <p>Total en USD <strong>{usd(calculo.total)}</strong> · {usd(calculo.total / cantidad)} por unidad</p>
          {calculo.comision > 0 && <p className="ayuda">Incluye {usd(calculo.comision)} de comisión por {datos.config.metodosPago[0].nombre}.</p>}
          {calculo.ganancia < 0 && <p className="pendiente">El precio del servicio está por debajo del costo.</p>}
        </div>
      )}
      <Avisos lista={resultado?.avisos} titulo="Revisa este servicio" />
      {error && <p role="alert" className="pendiente">{error}</p>}
      <div className="modal-pie">
        <button className="sec" onClick={onCerrar} disabled={guardando}>Cerrar</button>
        <button onClick={guardar} disabled={!calculo || guardando}>{guardando ? 'Guardando…' : 'Guardar borrador'}</button>
      </div>
    </Modal>
  )
}
