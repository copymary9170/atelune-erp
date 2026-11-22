import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, codigoPedido } from '../db.js'
import { Campo, Modal, Selector, SelectorPago, useConfig } from '../components/ui.jsx'
import { CATEGORIAS_GASTO } from '../lib/contabilidad.js'
import TasaOperacion from '../components/TasaOperacion.jsx'
import { n, personas } from '../lib/calc.js'
import { usd, bs, fecha, hoy } from '../lib/format.js'
import { TIPOS_TASA } from '../lib/tasas-multiples.js'

export const TIPOS_GASTO = {
  gasto: 'Gasto del negocio',
  pago_proveedor: 'Pago a proveedor (deuda)',
  pago_mano_obra: 'Pago de mano de obra',
  reparto: 'Reparto de utilidades',
  retiro: 'Retiro del dueño',
  aporte: 'Aporte de capital',
}

/** Deudas con proveedores: compras y gastos a crédito menos pagos. */
export function porPagarPorProveedor(movimientos, gastos) {
  const m = new Map()
  const sumar = (id, v) => m.set(id ?? 0, (m.get(id ?? 0) || 0) + v)
  for (const x of movimientos) if (x.tipo === 'entrada' && x.pagadoCon === 'credito') sumar(x.proveedorId, n(x.cantidad) * n(x.costoUnitario))
  for (const g of gastos) {
    if (g.tipo === 'gasto' && g.pagadoCon === 'credito') sumar(g.proveedorId, n(g.monto))
    if (g.tipo === 'pago_proveedor') sumar(g.proveedorId, -n(g.monto))
  }
  return m
}

export default function Gastos() {
  const config = useConfig()
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const gastos = useLiveQuery(() => db.gastos.orderBy('fecha').reverse().toArray(), [], [])
  const proveedores = useLiveQuery(() => db.proveedores.orderBy('nombre').toArray(), [], [])
  const movimientos = useLiveQuery(() => db.movimientos.where('tipo').equals('entrada').toArray(), [], [])
  const [editando, setEditando] = useState(null)

  const delMes = gastos.filter((g) => !mes || g.fecha?.startsWith(mes))
  const soloGastos = delMes.filter((g) => g.tipo === 'gasto' || g.tipo === 'pago_mano_obra')
  const porCategoria = new Map()
  for (const g of soloGastos) {
    const cat = g.tipo === 'pago_mano_obra' ? 'Mano de obra' : g.categoria
    porCategoria.set(cat, (porCategoria.get(cat) || 0) + n(g.monto))
  }
  const deudas = [...porPagarPorProveedor(movimientos, gastos)].filter(([, v]) => Math.abs(v) > 0.004)
  const nombreProv = (id) => proveedores.find((p) => p.id === id)?.nombre ?? 'Sin proveedor'

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Gastos y pagos</h1>
          <p>Gastos del negocio, pagos a proveedores, retiros y aportes. Cada registro genera su asiento contable.</p>
        </div>
        <button onClick={() => setEditando({ tipo: 'gasto', fecha: hoy(), categoria: (config.categoriasGasto || CATEGORIAS_GASTO)[0], pagadoCon: config.metodosPago?.[0]?.nombre ?? '' })}>+ Registrar</button>
      </div>

      <div className="grid g3">
        <div className="tarjeta kpi">
          <div className="etiqueta">Gastos del mes</div><div className="valor">{usd(soloGastos.reduce((s, g) => s + n(g.monto), 0))}</div>
          <Campo tipo="month" valor={mes} onCambio={setMes} />
        </div>
        <div className="tarjeta">
          <div className="etiqueta muted" style={{ fontSize: '.85rem' }}>Por categoría</div>
          <table className="desglose"><tbody>
            {[...porCategoria].sort((a, b) => b[1] - a[1]).map(([c, v]) => <tr key={c}><td>{c}</td><td className="num">{usd(v)}</td></tr>)}
            {!porCategoria.size && <tr><td className="muted">Sin gastos este mes.</td></tr>}
          </tbody></table>
        </div>
        <div className="tarjeta">
          <div className="etiqueta muted" style={{ fontSize: '.85rem' }}>Deudas con proveedores</div>
          <table className="desglose"><tbody>
            {deudas.map(([id, v]) => <tr key={id}><td>{nombreProv(id)}</td><td className="num">{v > 0 ? <span className="pendiente">{usd(v)}</span> : <>a favor {usd(-v)}</>}</td></tr>)}
            {!deudas.length && <tr><td className="muted">No debes nada a proveedores.</td></tr>}
          </tbody></table>
        </div>
      </div>

      <div className="tarjeta tabla-scroll">
        <table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Pago</th><th className="num">Monto</th></tr></thead>
          <tbody>
            {delMes.map((g) => (
              <tr key={g.id} className="clic" onClick={() => setEditando(g)}>
                <td>{fecha(g.fecha)}</td>
                <td><span className="etiqueta-tipo">{TIPOS_GASTO[g.tipo]}</span></td>
                <td>{g.tipo === 'gasto' && <strong>{g.categoria}</strong>}{g.personaNombre && <strong>{g.personaNombre}</strong>} {g.descripcion}{g.proveedorId ? <div className="desglose">{nombreProv(g.proveedorId)}</div> : null}</td>
                <td>{g.pagadoCon === 'credito' ? <span className="pendiente">a crédito</span> : g.pagadoCon || 'aporte propio'}</td>
                <td className="num">{usd(g.monto)}{n(g.tasa) > 0 && <div className="desglose">{bs(n(g.monto) * n(g.tasa))}{g.tasaDetalle?.tipo ? ' · ' + (TIPOS_TASA[g.tasaDetalle.tipo]?.nombre || g.tasaDetalle.tipo) : ' · tasa histórica'}</div>}</td>
              </tr>
            ))}
            {!delMes.length && <tr><td colSpan={5} className="vacio">No hay registros en este período.</td></tr>}
          </tbody>
        </table>
      </div>

      {editando && <GastoForm inicial={editando} config={config} proveedores={proveedores} onCerrar={() => setEditando(null)} />}
    </>
  )
}

export function GastoForm({ inicial, config, proveedores, onCerrar }) {
  const [g, setG] = useState(inicial)
  const set = (k, v) => setG((x) => ({ ...x, [k]: v }))
  const nuevo = !inicial.id
  const metodos = config.metodosPago || []
  const categorias = config.categoriasGasto || CATEGORIAS_GASTO
  const pedidos = useLiveQuery(() => db.pedidos.orderBy('numero').reverse().toArray(), [], [])
  const aPersona = g.tipo === 'pago_mano_obra' || g.tipo === 'reparto'

  async function guardar() {
    if (!(n(g.monto) > 0)) return alert('Escribe el monto en $.')
    if (!g.fecha) return alert('Escribe la fecha.')
    if (/efectivo\s*(?:bs|bol[ií]vares)|pago\s*m[oó]vil/i.test(g.pagadoCon || '') && !(Number(g.tasa) > 0)) return alert('Para una operación en bolívares debes indicar una tasa válida.')
    if (g.tipo !== 'gasto' && (!g.pagadoCon || g.pagadoCon === 'credito')) return alert('Elige con qué método se pagó.')
    if (g.tipo === 'pago_proveedor' && !g.proveedorId) return alert('Elige el proveedor.')
    if (aPersona && !g.personaId) return alert('Elige la persona.')
    const persona = personas(config).find((p) => p.id === Number(g.personaId))
    const datos = {
      ...g,
      proveedorId: g.proveedorId ? Number(g.proveedorId) : null,
      personaId: aPersona ? Number(g.personaId) : null,
      personaNombre: aPersona ? persona?.nombre ?? '' : null,
      pedidoId: aPersona && g.pedidoId ? Number(g.pedidoId) : null,
    }
    if (datos.tipo !== 'gasto') delete datos.categoria
    await db.gastos.put(datos)
    onCerrar()
  }

  return (
    <Modal titulo={nuevo ? 'Registrar' : 'Editar registro'} onCerrar={onCerrar}>
      <div className="fila">
        <Selector label="Tipo" valor={g.tipo} onCambio={(v) => set('tipo', v)} opciones={Object.entries(TIPOS_GASTO).map(([value, label]) => ({ value, label }))} />
        <Campo label="Fecha" tipo="date" valor={g.fecha} onCambio={(v) => set('fecha', v)} />
      </div>
      {g.tipo === 'gasto' && (
        <Selector label="Categoría" valor={g.categoria} onCambio={(v) => set('categoria', v)} opciones={categorias.map((c) => ({ value: c, label: c }))} />
      )}
      {(g.tipo === 'gasto' || g.tipo === 'pago_proveedor') && (
        <Selector label="Proveedor" valor={g.proveedorId ?? ''} onCambio={(v) => set('proveedorId', v)}
          vacio={g.tipo === 'gasto' ? 'Ninguno' : 'Elegir…'} opciones={proveedores.map((p) => ({ value: p.id, label: p.nombre }))} />
      )}
      {aPersona && (
        <div className="fila">
          <Selector label="Persona" valor={g.personaId ?? ''} onCambio={(v) => set('personaId', v)} vacio="Elegir…"
            opciones={personas(config).map((p) => ({ value: p.id, label: p.nombre }))} />
          <Selector label="Pedido (opcional)" valor={g.pedidoId ?? ''} onCambio={(v) => set('pedidoId', v)} vacio="General / varios pedidos"
            opciones={pedidos.map((p) => ({ value: p.id, label: codigoPedido(p.numero) + (p.cliente ? ' · ' + p.cliente : '') }))} />
        </div>
      )}
      <Campo label="Descripción" valor={g.descripcion} onCambio={(v) => set('descripcion', v)} placeholder="Ej.: recibo de noviembre, factura N.º…" />
      <div className="fila">
        <Campo label="Monto ($)" tipo="number" valor={g.monto} onCambio={(v) => set('monto', v)} autoFocus />

      </div>
      <TasaOperacion valor={g} fecha={g.fecha} montoUsd={g.monto}
        onCambio={cambios => setG(actual => ({ ...actual, ...cambios }))} />
      {g.tipo === 'gasto'
        ? <SelectorPago valor={g.pagadoCon ?? ''} onCambio={(v) => set('pagadoCon', v)} metodos={metodos} />
        : <Selector label={g.tipo === 'aporte' ? '¿A dónde entró el dinero?' : '¿De dónde salió el dinero?'} valor={g.pagadoCon ?? ''} onCambio={(v) => set('pagadoCon', v)}
            vacio="Elegir…" opciones={metodos.map((m) => ({ value: m.nombre, label: m.nombre }))} />}
      <div className="modal-pie">
        {!nuevo && (
          <button className="peligro" style={{ marginRight: 'auto' }}
            onClick={async () => { if (confirm('¿Eliminar este registro?')) { await db.gastos.delete(g.id); onCerrar() } }}>Eliminar</button>
        )}
        <button className="sec" onClick={onCerrar}>Cancelar</button>
        <button onClick={guardar}>Guardar</button>
      </div>
    </Modal>
  )
}
