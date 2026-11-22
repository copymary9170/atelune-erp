import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { Campo, Selector } from '../components/ui.jsx'
import { fecha, hoy, num } from '../lib/format.js'
import { TIPOS_TASA, crearDetalleTasa, tipoTasaHistorica } from '../lib/tasas-multiples.js'

export default function Tasas() {
  const tasas = useLiveQuery(() => db.tasas.orderBy('fecha').reverse().toArray(), [], [])
  const [f, setF] = useState({ fecha: hoy(), hora: '', tipo: 'bcv_usd',
    tasa: null, usdPorUnidad: null, entidad: '', sentido: 'compra', comisionPct: 0 })
  const [error, setError] = useState('')
  const tipo = TIPOS_TASA[f.tipo]
  const set = (campo, valor) => setF(prev => ({ ...prev, [campo]: valor }))

  async function guardar(e) {
    e.preventDefault()
    setError('')
    try {
      const detalle = crearDetalleTasa(f)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) throw new Error('Introduce una fecha válida.')
      if (f.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.hora)) throw new Error('Hora inválida.')
      // Historial append-only: actualizar la tasa del día NO altera operaciones
      // ni sobrescribe tasas de otras fuentes o momentos del mismo día.
      await db.tasas.add({
        fecha: f.fecha, hora: f.hora || new Date().toTimeString().slice(0, 5),
        tipo: f.tipo, tasa: detalle.bsPorUnidad, usdPorUnidad: detalle.usdPorUnidad,
        unidad: detalle.unidad, fuente: tipo.nombre, entidad: detalle.entidad,
        sentido: detalle.sentido, comisionPct: detalle.comisionPct,
        registradoEn: new Date().toISOString(),
      })
      setF(prev => ({ ...prev, tasa: null, usdPorUnidad: null }))
    } catch (err) {
      setError(err?.message || 'No se pudo guardar la tasa.')
    }
  }
  return <>
    <div className="encabezado">
      <div>
        <h1>Tasas de cambio</h1>
        <p>Registra cada referencia por separado. Ninguna tasa reemplaza automáticamente otra ni modifica operaciones anteriores.</p>
      </div>
    </div>
    <form className="tarjeta" onSubmit={guardar}>
      <h2>Nueva tasa</h2>
      <div className="fila">
        <Campo label="Fecha" tipo="date" valor={f.fecha} onCambio={v => set('fecha', v)} />
        <Campo label="Hora (opcional)" tipo="time" valor={f.hora} onCambio={v => set('hora', v)} />
        <Selector label="Tipo de tasa" valor={f.tipo} onCambio={v => set('tipo', v)}
          opciones={Object.entries(TIPOS_TASA).map(([value, v]) => ({ value, label: v.nombre }))} />
        <Campo label={'Bs por 1 ' + tipo.unidad} tipo="number" valor={f.tasa} onCambio={v => set('tasa', v)} />
      </div>
      {(f.tipo === 'bcv_eur' || f.tipo === 'usdt') && <div className="fila">
        <Campo label={'Equivalencia USD por 1 ' + tipo.unidad} tipo="number" valor={f.usdPorUnidad}
          onCambio={v => set('usdPorUnidad', v)} />
        <p className="ayuda">Necesaria para cotizaciones expresadas en USD. Debes introducir la equivalencia de la operación; no se inventa.</p>
      </div>}
      {f.tipo === 'menudeo' && <div className="fila">
        <Campo label="Banco / entidad" valor={f.entidad} onCambio={v => set('entidad', v)} />
        <Selector label="Operación de divisas" valor={f.sentido} onCambio={v => set('sentido', v)}
          opciones={[{ value: 'compra', label: 'Compras divisas' }, { value: 'venta', label: 'Vendes divisas' }]} />
        <Campo label="Comisión informativa (%)" tipo="number" valor={f.comisionPct} onCambio={v => set('comisionPct', v)} />
      </div>}
      <p className="ayuda">Las comisiones se guardan como información; registra la tasa realmente aplicada. Las tasas de fechas y horas diferentes permanecen en el historial.</p>
      {error && <p role="alert" className="pendiente">{error}</p>}
      <button type="submit">Guardar nueva cotización de tasa</button>
    </form>
    <div className="tarjeta tabla-scroll">
      <h2>Historial de tasas</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Hora</th><th>Tipo / fuente</th><th className="num">Bs por unidad</th><th>Equiv. USD</th><th>Banco / sentido</th></tr></thead>
        <tbody>
          {tasas.map(t => {
            const identificada = tipoTasaHistorica(t)
            return <tr key={t.id}>
              <td>{fecha(t.fecha)}</td><td>{t.hora || '—'}</td>
              <td>{identificada ? TIPOS_TASA[identificada].nombre : 'Histórica sin clasificar'}{!t.tipo && <div className="desglose">Origen: {t.fuente || 'desconocido'}</div>}</td>
              <td className="num">{num(t.tasa, 4)} Bs/{TIPOS_TASA[identificada]?.unidad || '?'}</td>
              <td>{t.usdPorUnidad || '—'}</td><td>{[t.entidad, t.sentido].filter(Boolean).join(' · ') || '—'}</td>
            </tr>
          })}
          {!tasas.length && <tr><td colSpan={6} className="vacio">Aún no hay tasas cargadas.</td></tr>}
        </tbody>
      </table>
    </div>
  </>
}
