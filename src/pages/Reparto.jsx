import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, codigoPedido } from '../db.js'
import { Campo, useConfig } from '../components/ui.jsx'
import { estadoReparto } from '../components/RepartoPedido.jsx'
import { personas, n } from '../lib/calc.js'
import { usd, fecha } from '../lib/format.js'

export default function Reparto() {
  const config = useConfig()
  const pedidos = useLiveQuery(() => db.pedidos.orderBy('numero').reverse().toArray(), [], [])
  const gastos = useLiveQuery(() => db.gastos.toArray(), [], [])
  const [mes, setMes] = useState('')

  const entregados = pedidos.filter((p) => p.estado === 'entregado')
  const fechaEntrega = (p) => [...(p.historial || [])].reverse().find((h) => h.estado === 'entregado')?.fecha?.slice(0, 10) ?? p.fecha
  const lista = entregados.filter((p) => !mes || fechaEntrega(p).startsWith(mes)).map((p) => ({ p, e: estadoReparto(p, config, gastos) }))

  // Totales por persona: lo que le corresponde (mano de obra + reparto) frente a lo pagado.
  const ps = personas(config)
  const tot = new Map(ps.map((x) => [x.id, { mo: 0, moPag: 0, rep: 0, repPag: 0 }]))
  let reinversion = 0, utilidad = 0
  for (const { e } of lista) {
    utilidad += e.utilidad
    for (const m of e.mo) { const t = tot.get(m.personaId); if (t) { t.mo += m.monto; t.moPag += m.pagado } }
    for (const d of e.partes) {
      if (d.tipo === 'reinversion') reinversion += d.monto
      else { const t = tot.get(d.personaId); if (t) { t.rep += d.monto; t.repPag += d.pagado } }
    }
  }
  const sinPedido = gastos.filter((g) => (g.tipo === 'reparto' || g.tipo === 'pago_mano_obra') && !g.pedidoId && (!mes || g.fecha?.startsWith(mes)))

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Reparto de utilidades</h1>
          <p>Pedidos entregados: mano de obra de cada persona, reinversión y reparto según la regla de cada pedido.</p>
        </div>
        <Campo className="auto" label="Mes de entrega" tipo="month" valor={mes} onCambio={setMes} />
      </div>

      <div className="grid g3">
        <div className="tarjeta kpi"><div className="etiqueta">Utilidad de pedidos entregados</div><div className="valor">{usd(utilidad)}</div></div>
        <div className="tarjeta kpi"><div className="etiqueta">Reinversión (queda en el negocio)</div><div className="valor">{usd(reinversion)}</div></div>
        <div className="tarjeta kpi"><div className="etiqueta">Pedidos entregados</div><div className="valor">{lista.length}</div><div className="desglose">{lista.filter((x) => x.e.provisional.length).length} con datos provisionales</div></div>
      </div>

      <div className="tarjeta tabla-scroll">
        <h2>Por persona</h2>
        <table>
          <thead><tr><th>Persona</th><th className="num">Mano de obra</th><th className="num">Pagado</th><th className="num">Reparto</th><th className="num">Pagado</th><th className="num">Pendiente total</th></tr></thead>
          <tbody>
            {ps.map((x) => {
              const t = tot.get(x.id)
              const pend = t.mo - t.moPag + t.rep - t.repPag
              return (
                <tr key={x.id}>
                  <td><strong>{x.nombre}</strong></td>
                  <td className="num">{usd(t.mo)}</td><td className="num">{usd(t.moPag)}</td>
                  <td className="num">{usd(t.rep)}</td><td className="num">{usd(t.repPag)}</td>
                  <td className="num">{pend > 0.005 ? <span className="pendiente">{usd(pend)}</span> : usd(0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="ayuda">Los pagos se registran desde cada pedido («Registrar pago») o en Gastos y pagos. Si no le pagas tu propia mano de obra a ti misma, tu parte queda como pendiente: es informativo.
          {sinPedido.length > 0 && ` Hay ${sinPedido.length} pago(s) sin pedido asociado por ${usd(sinPedido.reduce((s, g) => s + n(g.monto), 0))} que no se reflejan en esta tabla.`}</p>
      </div>

      <div className="tarjeta tabla-scroll">
        <h2>Pedidos</h2>
        <table>
          <thead><tr><th>Pedido</th><th>Entrega</th><th className="num">Utilidad</th><th>Reparto</th><th>Estado</th></tr></thead>
          <tbody>
            {lista.map(({ p, e }) => (
              <tr key={p.id}>
                <td><Link to={'/pedidos/' + p.id}>{codigoPedido(p.numero)}</Link><div className="desglose">{p.cliente}</div></td>
                <td>{fecha(fechaEntrega(p))}</td>
                <td className="num">{usd(e.utilidad)}</td>
                <td className="desglose">{e.res.valido
                  ? e.partes.filter((d) => d.monto > 0).map((d) => `${d.tipo === 'reinversion' ? 'Reinversión' : ps.find((x) => x.id === d.personaId)?.nombre} ${usd(d.monto)}`).join(' · ')
                  : <span className="pendiente">{e.res.motivo}</span>}</td>
                <td>{e.provisional.length ? <span className="etiqueta-tipo bajo" title={e.provisional.join('\n')}>provisional</span> : <span className="etiqueta-tipo ok">completo</span>}</td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={5} className="vacio">No hay pedidos entregados en este período.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
