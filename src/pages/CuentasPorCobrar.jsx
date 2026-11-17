import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { Campo } from '../components/ui.jsx'
import { usd, fecha, hoy } from '../lib/format.js'
import { reporteCuentasPorCobrar } from '../lib/cuentas-cobrar.js'

const opciones = [
  ['todos', 'Todos los saldos'],
  ['vencido', 'Vencidos'],
  ['por_vencer', 'Por vencer'],
  ['sin_fecha', 'Sin fecha de entrega'],
]

const estado = {
  vencido: 'Vencido',
  por_vencer: 'Por vencer',
  sin_fecha: 'Sin fecha',
}

export default function CuentasPorCobrar() {
  const pedidos = useLiveQuery(() => db.pedidos.toArray(), [], null)
  const [dia, setDia] = useState(hoy())
  const [vista, setVista] = useState('todos')
  const [buscar, setBuscar] = useState('')
  const [error, setError] = useState('')
  const reporte = useMemo(() => {
    if (!pedidos) return null
    try {
      return reporteCuentasPorCobrar(pedidos, dia)
    } catch {
      return null
    }
  }, [pedidos, dia])
  const filas = (reporte?.filas || []).filter(f =>
    (vista === 'todos' || f.clasificacion === vista) &&
    (!buscar || ('PED-' + String(f.numero) + ' ' + f.cliente).toLowerCase().includes(buscar.toLowerCase())),
  )
  const r = reporte?.resumen

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Cuentas por cobrar</h1>
          <p>Consulta saldos actuales por pedido, próximos vencimientos y dinero pendiente de cobro. No se generan cobros ni se modifican pedidos.</p>
        </div>
        <Link className="boton sec" to="/pedidos">Ver pedidos</Link>
      </div>
      <div className="tarjeta">
        <div className="fila">
          <Campo label="Fecha de referencia" tipo="date" valor={dia} onCambio={setDia} />
          <Campo label="Buscar cliente o pedido" valor={buscar} onCambio={setBuscar} placeholder="Cliente o número…" />
          <div className="campo"><label>Mostrar</label>
            <select value={vista} onChange={e => setVista(e.target.value)}>
              {opciones.map(([v, titulo]) => <option key={v} value={v}>{titulo}</option>)}
            </select>
          </div>
        </div>
        {!reporte && !!pedidos && <p role="alert" className="pendiente">Selecciona una fecha de referencia válida.</p>}
        {error && <p role="alert" className="pendiente">{error}</p>}
      </div>

      {r && <>
        <div className="grid g4">
          <div className="tarjeta kpi"><div className="etiqueta">Pendiente total</div><div className="valor">{usd(r.totalPendiente)}</div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Vencido</div><div className="valor">{usd(r.vencido)}</div><div className="desglose">{r.cantidadVencida} pedido(s)</div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Por vencer</div><div className="valor">{usd(r.porVencer)}</div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Sin fecha</div><div className="valor">{usd(r.sinFecha)}</div></div>
        </div>
        <div className="tarjeta">
          <p><strong>{r.cantidadPendiente}</strong> pedidos con saldo · <strong>{usd(r.porCobrarEntregado)}</strong> corresponde a pedidos ya entregados.</p>
          <p className="muted">Los importes se expresan en USD, como están registrados los pedidos. La fecha seleccionada clasifica vencimientos, pero los saldos reflejan el estado actual de los abonos; no reconstruye una cartera histórica.</p>
          {!!r.excesoAbonos && <p className="pendiente">Se detectaron {usd(r.excesoAbonos)} en abonos superiores al total de algunos pedidos. Revisa esos pagos: no se descuentan de otras deudas.</p>}
          {!!r.casosExcluidos && <div className="avisos"><strong>{r.casosExcluidos} pedido(s) excluido(s) por falta de importes confiables.</strong><ul>{reporte.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
          <p className="ayuda">Los pedidos cancelados quedan fuera del cálculo. Cualquier devolución de dinero debe revisarse por separado en el registro original.</p>
        </div>
        <div className="tarjeta tabla-scroll">
          <h2>Detalle de saldos pendientes</h2>
          <table>
            <thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega prevista</th><th>Situación</th><th className="num">Total</th><th className="num">Cobrado</th><th className="num">Pendiente</th></tr></thead>
            <tbody>
              {filas.map(f => <tr key={f.id}>
                <td><Link to={'/pedidos/' + f.id}>PED-{String(f.numero).padStart(4, '0')}</Link></td>
                <td>{f.cliente}</td>
                <td>{f.fechaEntrega ? fecha(f.fechaEntrega) : 'Sin fecha'}</td>
                <td><span className={f.clasificacion === 'vencido' ? 'pendiente' : 'muted'}>{estado[f.clasificacion]}</span></td>
                <td className="num">{usd(f.total)}</td>
                <td className="num">{usd(f.cobrado)}</td>
                <td className="num"><strong>{usd(f.pendiente)}</strong></td>
              </tr>)}
              {!filas.length && <tr><td colSpan={7} className="vacio">No hay saldos pendientes en esta vista.</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
    </>
  )
}
