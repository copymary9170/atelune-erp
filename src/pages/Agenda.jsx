import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, ESTADOS_PEDIDO, codigoPedido } from '../db.js'
import { analizarAgenda } from '../lib/agenda.js'
import { resumenProduccion } from '../lib/produccion.js'
import { usd, fecha, hoy } from '../lib/format.js'

const FILTROS = [
  { id: 'todos', nombre: 'Todos los activos' },
  { id: 'vencido', nombre: 'Atrasados' },
  { id: 'hoy', nombre: 'Para hoy' },
  { id: 'proximo', nombre: 'Próximos 3 días' },
  { id: 'sin_fecha', nombre: 'Sin fecha de entrega' },
  { id: 'cobrar', nombre: 'Con saldo pendiente' },
]

export default function Agenda() {
  const pedidos = useLiveQuery(() => db.pedidos.toArray(), [], [])
  const [filtro, setFiltro] = useState('todos')
  const [buscar, setBuscar] = useState('')
  const agenda = useMemo(() => analizarAgenda(pedidos, hoy()), [pedidos])
  const flujo = resumenProduccion(pedidos)
  const lista = agenda.fichas.filter(p =>
    (filtro === 'todos' || (filtro === 'cobrar' ? p.saldo > 0.005 : p.urgencia === filtro)) &&
    `${codigoPedido(p.numero)} ${p.cliente || ''} ${p.notas || ''}`.toLowerCase().includes(buscar.toLowerCase()),
  )
  return <>
    <div className="encabezado">
      <div><h1>Agenda del taller</h1><p>Prioriza entregas y cobros sin alterar pedidos, materiales ni estados de producción.</p></div>
      <Link className="boton" to="/pedidos">Ver pedidos →</Link>
    </div>
    <div className="grid g4 agenda-kpis">
      <button className="tarjeta kpi agenda-accion" onClick={() => setFiltro('vencido')}><div className="etiqueta">Entregas atrasadas</div><div className="valor" style={{ color: agenda.vencidos.length ? 'var(--alerta)' : 'var(--ok)' }}>{agenda.vencidos.length}</div><div className="desglose">Requieren atención inmediata</div></button>
      <button className="tarjeta kpi agenda-accion" onClick={() => setFiltro('hoy')}><div className="etiqueta">Entregas de hoy</div><div className="valor">{agenda.hoy.length}</div><div className="desglose">Revisar antes de cerrar</div></button>
      <button className="tarjeta kpi agenda-accion" onClick={() => setFiltro('proximo')}><div className="etiqueta">Próximos tres días</div><div className="valor">{agenda.proximos.length}</div><div className="desglose">Preparar materiales y diseños</div></button>
      <button className="tarjeta kpi agenda-accion" onClick={() => setFiltro('cobrar')}><div className="etiqueta">Por cobrar · activos</div><div className="valor">{usd(agenda.porCobrarActivos)}</div><div className="desglose">No incluye pedidos entregados</div></button>
    </div>
    <div className="tarjeta"><h2>Avance del taller por trabajo</h2><p><strong>{flujo.sinRuta}</strong> sin proceso asignado · <strong>{flujo.enProceso}</strong> en proceso · <strong>{flujo.terminados}</strong> con todas las etapas completadas</p><p className="muted">El conteo corresponde a los trabajos individuales de pedidos activos, no a pedidos completos.</p></div>
    {agenda.sinFecha.length > 0 && <div className="avisos"><strong>{agenda.sinFecha.length} pedido(s) sin fecha de entrega.</strong> Completa la fecha en cada pedido para poder priorizar la producción.</div>}
    <div className="tarjeta">
      <div className="encabezado"><div><h2>Cola de trabajo</h2><p className="muted">Pedidos activos ordenados por urgencia. Las entregas de hoy no se consideran atrasadas.</p></div></div>
      <div className="agenda-filtros" role="group" aria-label="Filtrar agenda">{FILTROS.map(f => <button key={f.id} className={'agenda-filtro' + (filtro === f.id ? ' activo' : '')} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.nombre}</button>)}</div>
      <label className="agenda-buscar">Buscar pedido o cliente<input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Número, cliente o notas" /></label>
      <div className="tabla-scroll"><table><thead><tr><th>Prioridad</th><th>Pedido / cliente</th><th>Estado</th><th>Entrega</th><th className="num">Saldo</th><th>Acción</th></tr></thead><tbody>
        {lista.map(p => <tr key={p.id}>
          <td><span className={'etiqueta-tipo ' + (p.urgencia === 'vencido' ? 'bajo' : p.urgencia === 'hoy' ? 'proceso' : p.urgencia === 'sin_fecha' ? 'neutro' : 'ok')}>{p.urgencia === 'vencido' ? `${Math.abs(p.dias)} día(s) tarde` : p.urgencia === 'hoy' ? 'Hoy' : p.urgencia === 'proximo' ? `En ${p.dias} día(s)` : p.urgencia === 'sin_fecha' ? 'Sin fecha' : 'Programado'}</span></td>
          <td><strong>{codigoPedido(p.numero)}</strong><div className="desglose">{p.cliente || 'Sin cliente'}</div></td>
          <td>{ESTADOS_PEDIDO[p.estado] || p.estado}</td>
          <td>{p.fechaEntrega ? fecha(p.fechaEntrega) : '—'}</td>
          <td className="num">{p.saldo > 0.005 ? <strong className="pendiente">{usd(p.saldo)}</strong> : 'Al día'}</td>
          <td><Link to={'/pedidos/' + p.id}>Abrir pedido →</Link></td>
        </tr>)}
        {!lista.length && <tr><td colSpan={6} className="vacio">{pedidos.length ? 'No hay pedidos que coincidan con este filtro.' : 'Todavía no hay pedidos. Crea uno desde una cotización aprobada.'}</td></tr>}
      </tbody></table></div>
    </div>
    <div className="tarjeta"><h2>Control comercial</h2><p>Saldo total pendiente de pedidos no cancelados, incluidos los ya entregados: <strong>{usd(agenda.porCobrar)}</strong>.</p><p className="muted">Este panel es de consulta. El registro de pagos, consumo y cambios de estado se realiza en el detalle del pedido para conservar los controles existentes.</p></div>
  </>
}
