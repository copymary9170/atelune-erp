import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, reglaGeneral } from '../db.js'
import { Avisos } from './ui.jsx'
import { GastoForm } from '../pages/Gastos.jsx'
import { repartir, utilidadPedido, manoObraPorPersona, saldoPedido, personas, n, redondear } from '../lib/calc.js'
import { usd, hoy } from '../lib/format.js'

/** Estado del reparto de un pedido: utilidad, partes, pagos registrados y por qué es provisional. */
export function estadoReparto(p, config, gastos) {
  const regla = p.reparto?.destinos?.length ? p.reparto : reglaGeneral(config)
  const utilidad = utilidadPedido(p)
  const res = repartir(utilidad, regla)
  const pagos = gastos.filter((g) => g.pedidoId === p.id)
  const pagado = (tipo, personaId) => pagos.filter((g) => g.tipo === tipo && g.personaId === personaId).reduce((s, g) => s + n(g.monto), 0)
  const provisional = []
  if (p.costoIncompleto?.length) provisional.push('Costo incompleto: ' + p.costoIncompleto.join('; '))
  if (!p.precios?.some((x) => x.manoObra != null)) provisional.push('Pedido anterior a esta función: no tiene la mano de obra separada por persona.')
  if (p.estado !== 'entregado') provisional.push('El pedido aún no está entregado.')
  if (saldoPedido(p) > 0.005) provisional.push(`El cliente aún debe ${usd(saldoPedido(p))}: lo repartible en efectivo es menor que la utilidad.`)
  const mo = [...manoObraPorPersona(p)].map(([personaId, monto]) => ({ personaId, monto, pagado: pagado('pago_mano_obra', personaId) }))
  const partes = res.destinos.map((d) => ({ ...d, pagado: d.tipo === 'persona' ? pagado('reparto', d.personaId) : null }))
  return { regla, utilidad, res, partes, mo, provisional, usaGeneral: !p.reparto?.destinos?.length }
}

export default function RepartoPedido({ pedido: p, config }) {
  const gastos = useLiveQuery(() => db.gastos.toArray(), [], [])
  const [pagando, setPagando] = useState(null)
  const [editando, setEditando] = useState(false)
  const e = estadoReparto(p, config, gastos)
  const nombre = (id) => personas(config).find((x) => x.id === id)?.nombre ?? 'Persona'
  const setPct = (i, v) => db.pedidos.update(p.id, { reparto: { destinos: e.regla.destinos.map((d, j) => (j === i ? { ...d, pct: v === '' ? null : Number(v) } : d)) } })

  return (
    <div className="tarjeta">
      <div className="encabezado" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>Utilidad y reparto</h2>
        <div className="acciones">
          <button className="sec mini" onClick={() => setEditando(!editando)}>{editando ? 'Listo' : 'Cambiar regla de este pedido'}</button>
          {!e.usaGeneral && editando && (
            <button className="sec mini" onClick={() => db.pedidos.update(p.id, { reparto: structuredClone(reglaGeneral(config)) })}>Usar la regla general</button>
          )}
        </div>
      </div>
      <p className="desglose">Utilidad = precio de los trabajos − costos (materiales, máquinas, mano de obra y fijos). No incluye envío, recargos ni IVA.</p>
      <table className="resumen">
        <tbody>
          <tr className="total"><td>Utilidad del pedido</td><td className="num">{usd(e.utilidad)}</td></tr>
        </tbody>
      </table>

      {e.mo.length > 0 && (
        <>
          <h3 style={{ marginTop: 14 }}>Mano de obra (ya descontada como costo)</h3>
          <table><tbody>
            {e.mo.map((m) => (
              <tr key={m.personaId}>
                <td>{nombre(m.personaId)}</td>
                <td className="num">{usd(m.monto)}</td>
                <td className="num desglose">pagado {usd(m.pagado)}</td>
                <td className="num">{m.monto - m.pagado > 0.005 && (
                  <button className="mini sec" onClick={() => setPagando({ tipo: 'pago_mano_obra', personaId: m.personaId, monto: redondear(m.monto - m.pagado, 2) })}>Registrar pago</button>
                )}</td>
              </tr>
            ))}
          </tbody></table>
        </>
      )}

      <h3 style={{ marginTop: 14 }}>Reparto {e.usaGeneral ? '(regla general)' : '(regla propia de este pedido)'}</h3>
      {editando && (
        <div className="subtabla">
          {e.regla.destinos.map((d, i) => (
            <div className="fila" key={i}>
              <div className="campo" style={{ alignSelf: 'center' }}>{d.tipo === 'reinversion' ? 'Reinversión' : nombre(d.personaId)}</div>
              <div className="campo angosto"><input type="number" step="any" value={d.pct ?? ''} onChange={(ev) => setPct(i, ev.target.value)} placeholder="%" /></div>
            </div>
          ))}
          <p className="ayuda">Solo cambia este pedido. La regla general y los demás pedidos no se tocan.</p>
        </div>
      )}
      {e.res.valido ? (
        <table><tbody>
          {e.partes.map((d, i) => (
            <tr key={i}>
              <td>{d.tipo === 'reinversion' ? 'Reinversión (queda en el negocio)' : nombre(d.personaId)}</td>
              <td className="num desglose">{d.pct} %</td>
              <td className="num"><strong>{usd(d.monto)}</strong></td>
              <td className="num desglose">{d.tipo === 'persona' ? 'pagado ' + usd(d.pagado) : ''}</td>
              <td className="num">{d.tipo === 'persona' && d.monto - d.pagado > 0.005 && (
                <button className="mini sec" onClick={() => setPagando({ tipo: 'reparto', personaId: d.personaId, monto: redondear(d.monto - d.pagado, 2) })}>Registrar pago</button>
              )}</td>
            </tr>
          ))}
        </tbody></table>
      ) : <p className="pendiente">{e.res.motivo}{/Faltan|suman/.test(e.res.motivo) && ' Defínela en Configuración o con «Cambiar regla de este pedido».'}</p>}
      <Avisos tono="suave" titulo="Reparto provisional" lista={e.provisional} />

      {pagando && (
        <GastoForm config={config} proveedores={[]} onCerrar={() => setPagando(null)}
          inicial={{ ...pagando, pedidoId: p.id, fecha: hoy(), pagadoCon: config.metodosPago?.[0]?.nombre ?? '', descripcion: '' }} />
      )}
    </div>
  )
}
