import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { codigoPedido, db } from '../db.js'
import AbonoForm from '../components/AbonoForm.jsx'
import { Campo, useConfig } from '../components/ui.jsx'
import { usd, fecha, hoy } from '../lib/format.js'
import { reporteCuentasPorCobrar } from '../lib/cuentas-cobrar.js'

const opciones = [
  ['todos', 'Todos los saldos'],
  ['vencido', 'Entrega prevista ya pasó'],
  ['por_vencer', 'Entrega prevista futura o hoy'],
  ['sin_fecha', 'Sin fecha de entrega'],
]

const estado = {
  vencido: 'Entrega prevista pasada',
  por_vencer: 'Entrega prevista pendiente',
  sin_fecha: 'Sin fecha',
}

export default function CuentasPorCobrar() {
  const pedidos = useLiveQuery(() => db.pedidos.toArray(), [], null)
  const [dia, setDia] = useState(hoy())
  const [vista, setVista] = useState('todos')
  const [buscar, setBuscar] = useState('')
  const [pedidoId, setPedidoId] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const config = useConfig()
  const pedido = pedidos?.find(p => p.id === pedidoId)
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
    <div className="cxc-panel">
      <div className="encabezado">
        <div>
          <h1>Cuentas por cobrar</h1>
          <p>Consulta saldos por cliente y registra cobros completos o parciales desde el pedido pendiente.</p>
        </div>
        <Link className="boton sec" to="/pedidos">Ver pedidos</Link>
      </div>
      {mensaje && <p role="status">{mensaje}</p>}
      <div className="tarjeta cxc-filtros">
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
      </div>

      {r && <>
        <div className="grid g4 cxc-resumen">
          <div className="tarjeta kpi"><div className="etiqueta">Pendiente total</div><div className="valor">{usd(r.totalPendiente)}</div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Entrega prevista pasada</div><div className="valor">{usd(r.vencido)}</div><div className="desglose">{r.cantidadVencida} pedido(s)</div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Entrega prevista futura</div><div className="valor">{usd(r.porVencer)}</div></div>
          <div className="tarjeta kpi"><div className="etiqueta">Sin fecha</div><div className="valor">{usd(r.sinFecha)}</div></div>
        </div>
        <div className="tarjeta cxc-notas">
          <p><strong>{r.cantidadPendiente}</strong> pedidos con saldo · <strong>{usd(r.porCobrarEntregado)}</strong> corresponde a pedidos ya entregados.</p>
          <p className="muted">Los importes están en USD. La fecha seleccionada compara la entrega prevista con el día indicado; no demuestra vencimiento legal de pago. Los abonos son actuales, por lo que este tablero no reconstruye saldos históricos.</p>
          {!!r.excesoAbonos && <p className="pendiente">Se detectaron {usd(r.excesoAbonos)} en abonos superiores al total de algunos pedidos. Revisa esos pagos: no se descuentan de otras deudas.</p>}
          {!!r.casosExcluidos && <div className="avisos"><strong>{r.casosExcluidos} pedido(s) excluido(s) por falta de importes confiables.</strong><ul>{reporte.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
          <p className="ayuda">Los pedidos cancelados quedan fuera del cálculo. Cualquier devolución de dinero debe revisarse por separado en el registro original.</p>
        </div>
        <div className="tarjeta tabla-scroll cxc-tabla">
          <h2>Saldo pendiente por cliente</h2>
          <p className="muted">Agrupa por ficha de cliente cuando existe; si no, por nombre escrito en el pedido. Los pedidos anónimos se mantienen separados. No se compensan deudas entre clientes.</p>
          <table>
            <thead><tr><th>Cliente</th><th className="num">Pedidos pendientes</th>
              <th className="num">Saldo total</th><th className="num">Ya entregados</th>
              <th className="num">Con fecha prevista pasada</th></tr></thead>
            <tbody>
              {reporte.porCliente.map(c => <tr key={c.clave}>
                <td>{c.nombre}</td><td className="num">{c.pedidos}</td>
                <td className="num"><strong>{usd(c.totalPendiente)}</strong></td>
                <td className="num">{usd(c.entregadoPendiente)}</td>
                <td className="num">{usd(c.fueraDeFechaEntrega)}</td>
              </tr>)}
              {!reporte.porCliente.length && <tr><td colSpan={5} className="vacio">No hay clientes con saldos pendientes.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="tarjeta tabla-scroll cxc-tabla">
          <h2>Detalle de saldos pendientes</h2>
          <table>
            <thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega prevista</th><th>Situación</th><th className="num">Total</th><th className="num">Cobrado</th><th className="num">Pendiente</th><th>Acción</th></tr></thead>
            <tbody>
              {filas.map(f => <tr key={f.id}>
                <td><Link to={'/pedidos/' + f.id}>{codigoPedido(f.numero)}</Link></td>
                <td>{f.cliente}</td>
                <td>{f.fechaEntrega ? fecha(f.fechaEntrega) : 'Sin fecha'}</td>
                <td><span className={f.clasificacion === 'vencido' ? 'pendiente' : 'muted'}>{estado[f.clasificacion]}</span></td>
                <td className="num">{usd(f.total)}</td>
                <td className="num">{usd(f.cobrado)}</td>
                <td className="num"><strong>{usd(f.pendiente)}</strong></td>
                <td><button type="button" className="sec mini" aria-label={'Cobrar ' + codigoPedido(f.numero)}
                  onClick={() => { setMensaje(''); setPedidoId(f.id) }}>Cobrar</button></td>
              </tr>)}
              {!filas.length && <tr><td colSpan={8} className="vacio">No hay saldos pendientes en esta vista.</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
      {pedido && <AbonoForm key={pedido.id} pedido={pedido} metodos={config.metodosPago || []} rapido
        onCerrar={() => setPedidoId(null)} onGuardado={() => setMensaje('Cobro registrado en ' + codigoPedido(pedido.numero) + '.')} />}
    </div>
  )
}
