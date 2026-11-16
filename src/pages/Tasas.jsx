import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { Campo } from '../components/ui.jsx'
import { fecha, hoy, num } from '../lib/format.js'

export default function Tasas() {
  const tasas = useLiveQuery(() => db.tasas.orderBy('fecha').reverse().limit(60).toArray(), [], [])
  const [f, setF] = useState({ fecha: hoy(), tasa: null, fuente: 'BCV' })

  async function guardar(e) {
    e.preventDefault()
    if (!f.tasa || f.tasa <= 0) return alert('Escribe la tasa (Bs por cada $).')
    const existente = await db.tasas.where('fecha').equals(f.fecha).first()
    if (existente) await db.tasas.update(existente.id, { tasa: f.tasa, fuente: f.fuente })
    else await db.tasas.add({ ...f })
    setF({ ...f, tasa: null })
  }

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Tasa de cambio</h1>
          <p>Carga la tasa del día. Las cotizaciones guardan la tasa con la que se hicieron.</p>
        </div>
      </div>
      <form className="tarjeta" onSubmit={guardar}>
        <div className="fila">
          <Campo label="Fecha" tipo="date" valor={f.fecha} onCambio={(v) => setF({ ...f, fecha: v })} />
          <Campo label="Bs por 1 $" tipo="number" valor={f.tasa} onCambio={(v) => setF({ ...f, tasa: v })} />
          <Campo label="Fuente" valor={f.fuente} onCambio={(v) => setF({ ...f, fuente: v })} />
          <div className="campo auto"><button type="submit">Guardar tasa</button></div>
        </div>
        <div className="ayuda">Si ya existe una tasa para esa fecha, se actualiza.</div>
      </form>
      <div className="tarjeta tabla-scroll">
        <table>
          <thead><tr><th>Fecha</th><th className="num">Bs por $</th><th>Fuente</th><th></th></tr></thead>
          <tbody>
            {tasas.map((t) => (
              <tr key={t.id}>
                <td>{fecha(t.fecha)}</td>
                <td className="num">{num(t.tasa, 4)}</td>
                <td>{t.fuente}</td>
                <td className="num"><button className="peligro mini" onClick={() => confirm('¿Eliminar esta tasa?') && db.tasas.delete(t.id)}>Eliminar</button></td>
              </tr>
            ))}
            {!tasas.length && <tr><td colSpan={4} className="vacio">Aún no hay tasas cargadas.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
