import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, ESTADOS_PEDIDO, ESTADOS_CON_CONSUMO, codigoPedido, cambiarEstadoPedido, registrarAbono } from '../db.js'
import { Campo, Selector, Modal, useConfig } from '../components/ui.jsx'
import { codigo } from './Cotizaciones.jsx'
import RepartoPedido from '../components/RepartoPedido.jsx'
import FlujoProduccion from '../components/FlujoProduccion.jsx'
import TiemposProduccion from '../components/TiemposProduccion.jsx'
import FichaRentabilidad from '../components/FichaRentabilidad.jsx'
import TasaOperacion from '../components/TasaOperacion.jsx'
import ConsumoMateriales from '../components/ConsumoMateriales.jsx'
import { consumoPedido, saldoPedido, totalAbonos, n } from '../lib/calc.js'
import { usd, bs, num, fecha, hoy } from '../lib/format.js'
import { TIPOS_TASA } from '../lib/tasas-multiples.js'
import { equivalenteBs, monedaMetodoPago } from '../lib/pagos.js'

const FLUJO = ['aprobado', 'en_diseno', 'en_produccion', 'listo', 'entregado']
const claseEstado = (e) => (e === 'entregado' ? ' ok' : e === 'cancelado' ? ' bajo' : ['en_diseno', 'en_produccion'].includes(e) ? ' proceso' : ' neutro')

export default function Pedidos() {
  const pedidos = useLiveQuery(() => db.pedidos.orderBy('numero').reverse().toArray(), [], [])
  const navigate = useNavigate()
  const [estado, setEstado] = useState('activos')
  const [buscar, setBuscar] = useState('')

  const lista = pedidos.filter(
    (p) =>
      (estado === 'activos' ? !['entregado', 'cancelado'].includes(p.estado) : estado === 'por_cobrar' ? p.estado !== 'cancelado' && saldoPedido(p) > 0.005 : !estado || p.estado === estado) &&
      (!buscar || (codigoPedido(p.numero) + ' ' + p.cliente).toLowerCase().includes(buscar.toLowerCase())),
  )
  const porCobrar = pedidos.filter((p) => p.estado !== 'cancelado').reduce((s, p) => s + Math.max(0, saldoPedido(p)), 0)
  const conteo = (e) => pedidos.filter((p) => p.estado === e).length

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Pedidos y producción</h1>
          <p>Los pedidos se crean desde una cotización con «Convertir en pedido».</p>
        </div>
        <Link className="boton" to="/cotizaciones">Ir a cotizaciones</Link>
      </div>

      <div className="grid g4">
        {['aprobado', 'en_diseno', 'en_produccion', 'listo'].map((e) => (
          <div key={e} className="tarjeta kpi clic" style={{ cursor: 'pointer' }} onClick={() => setEstado(e)}>
            <div className="etiqueta">{ESTADOS_PEDIDO[e]}</div><div className="valor">{conteo(e)}</div>
          </div>
        ))}
      </div>

      <div className="tarjeta">
        <div className="fila">
          <Campo label="Buscar" valor={buscar} onCambio={setBuscar} placeholder="Número o cliente" />
          <Selector label="Mostrar" valor={estado} onCambio={setEstado}
            opciones={[{ value: 'activos', label: 'Pendientes (sin entregar)' }, { value: 'por_cobrar', label: `Por cobrar (${usd(porCobrar)})` }, { value: '', label: 'Todos' },
              ...Object.entries(ESTADOS_PEDIDO).map(([value, label]) => ({ value, label }))]} />
        </div>
        <div className="tabla-scroll">
          <table>
            <thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Estado</th><th className="num">Total</th><th className="num">Saldo</th></tr></thead>
            <tbody>
              {lista.map((p) => {
                const atrasado = p.fechaEntrega && p.fechaEntrega < hoy() && !['entregado', 'cancelado'].includes(p.estado)
                return (
                  <tr key={p.id} className="clic" onClick={() => navigate('/pedidos/' + p.id)}>
                    <td><strong>{codigoPedido(p.numero)}</strong><div className="desglose">{fecha(p.fecha)}</div></td>
                    <td>{p.cliente || <span className="muted">sin cliente</span>}</td>
                    <td>{p.fechaEntrega ? <span className={atrasado ? 'pendiente' : ''}>{fecha(p.fechaEntrega)}{atrasado && ' · atrasado'}</span> : <span className="muted">sin fecha</span>}</td>
                    <td><span className={'etiqueta-tipo' + claseEstado(p.estado)}>{ESTADOS_PEDIDO[p.estado]}</span></td>
                    <td className="num">{usd(p.total)}</td>
                    <td className="num">{saldoPedido(p) > 0.005 && p.estado !== 'cancelado' ? <span className="pendiente">{usd(saldoPedido(p))}</span> : '—'}</td>
                  </tr>
                )
              })}
              {!lista.length && <tr><td colSpan={6} className="vacio">{pedidos.length ? 'No hay pedidos en esta vista.' : 'Aún no hay pedidos.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export function PedidoDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const p = useLiveQuery(() => db.pedidos.get(Number(id)).then((x) => x ?? null), [id])
  const productos = useLiveQuery(() => db.productos.toArray(), [], [])
  const cot = useLiveQuery(() => (p?.cotizacionId ? db.cotizaciones.get(p.cotizacionId) : undefined), [p?.cotizacionId])
  const config = useConfig()
  const [abonando, setAbonando] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  if (p === undefined) return <p className="muted">Cargando…</p>
  if (p === null) return <p>No se encontró el pedido.</p>

  const saldo = saldoPedido(p)
  const consumo = consumoPedido(p.items, config)
  const actualizar = (cambios) => db.pedidos.update(p.id, cambios)

  async function mover(estado) {
    if (estado === p.estado) return
    if (ESTADOS_CON_CONSUMO.includes(estado) && !p.inventarioDescontado && consumo.length &&
      !confirm('Al pasar a este estado se descontarán del inventario los materiales del pedido. ¿Continuar?')) return
    if (estado === 'cancelado' && !confirm('¿Cancelar el pedido? Los materiales usados NO volverán automáticamente al inventario.')) return
    const devolverInventario = estado === 'cancelado' && p.inventarioDescontado && confirm('¿Recuperaste físicamente TODOS los materiales descontados? Aceptar: devolverlos al inventario. Cancelar: cancelar SIN devolver stock. Para devoluciones parciales, registra el reingreso en Inventario.')
    setOcupado(true)
    try { await cambiarEstadoPedido(p.id, estado, { devolverInventario }) } catch (e) { alert(e.message) }
    setOcupado(false)
  }

  const indice = FLUJO.indexOf(p.estado)
  const siguiente = indice >= 0 && indice < FLUJO.length - 1 ? FLUJO[indice + 1] : null

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{codigoPedido(p.numero)} <span className={'etiqueta-tipo' + claseEstado(p.estado)} style={{ fontSize: '.85rem', verticalAlign: 'middle' }}>{ESTADOS_PEDIDO[p.estado]}</span></h1>
          {p.costoIncompleto?.length > 0 && <span className="etiqueta-tipo bajo">costo incompleto</span>}
          <p>{p.cliente || 'Sin cliente'}{p.contactoCliente && ' · ' + p.contactoCliente}{cot && <> · desde <Link to={'/cotizaciones/' + cot.id}>{codigo(cot.numero)}</Link></>}</p>
        </div>
        <div className="acciones">
          <button className="sec" onClick={() => navigate('/pedidos')}>Volver</button>
          {siguiente && <button disabled={ocupado} onClick={() => mover(siguiente)}>Pasar a «{ESTADOS_PEDIDO[siguiente]}» →</button>}
        </div>
      </div>

      <div className="tarjeta">
        <div className="fila">
          <Selector label="Estado" valor={p.estado} onCambio={mover} opciones={Object.entries(ESTADOS_PEDIDO).map(([value, label]) => ({ value, label }))} />
          <Campo label="Fecha del pedido" tipo="date" valor={p.fecha} onCambio={(v) => actualizar({ fecha: v })} />
          <Campo label="Fecha de entrega" tipo="date" valor={p.fechaEntrega} onCambio={(v) => actualizar({ fechaEntrega: v })} />
        </div>
        <Campo label="Notas de producción" tipo="textarea" valor={p.notas} onCambio={(v) => actualizar({ notas: v })}
          placeholder="Colores, tipografía, archivos del cliente, enlace a la carpeta de diseño…" />
      </div>

      <div className="grid g2">
        <div className="tarjeta">
          <h2>Trabajos</h2>
          <table>
            <thead><tr><th>Descripción</th><th className="num">Cant.</th><th className="num">Importe</th></tr></thead>
            <tbody>
              {p.items.map((it, i) => (
                <tr key={i}><td>{it.descripcion || `Trabajo ${i + 1}`}</td><td className="num">{num(it.cantidad)}</td><td className="num">{usd(p.precios?.[i]?.precio)}</td></tr>
              ))}
            </tbody>
          </table>
          <table className="resumen" style={{ marginTop: 10 }}>
            <tbody>
              <tr className="total"><td>Total del pedido</td><td className="num">{usd(p.total)}</td></tr>
              <tr className="desglose"><td>Costo estimado · ganancia estimada</td><td className="num">{usd(p.costoTotal)} · {usd(p.ganancia)}</td></tr>
            </tbody>
          </table>
          <h3 style={{ marginTop: 18 }}>Materiales {p.inventarioDescontado ? <span className="etiqueta-tipo ok">descontados del inventario</span> : <span className="etiqueta-tipo">se descuentan al pasar a producción</span>}</h3>
          <table className="desglose"><tbody>
            {consumo.map((c) => {
              const pr = productos.find((x) => x.id === c.productoId)
              const falta = pr && !p.inventarioDescontado && n(pr.stock) < c.cantidad
              return (
                <tr key={c.productoId}>
                  <td>{pr?.nombre ?? 'Producto eliminado'}</td>
                  <td className="num">{num(c.cantidad)} {pr?.unidadUso}</td>
                  <td className="num">{falta ? <span className="pendiente">stock: {num(pr.stock)}</span> : ''}</td>
                </tr>
              )
            })}
            {!consumo.length && <tr><td className="vacio">Este pedido no tiene materiales del inventario.</td></tr>}
          </tbody></table>
        </div>

        <div className="tarjeta">
          <div className="encabezado" style={{ marginBottom: 6 }}>
            <h2>Pagos</h2>
            {p.estado !== 'cancelado' && <button className="mini" onClick={() => setAbonando(true)}>+ Registrar pago</button>}
          </div>
          <table>
            <tbody>
              {(p.abonos || []).map((a, i) => (
                <tr key={i}>
                  <td>{fecha(a.fecha)}{a.anulado && <span className="etiqueta-tipo bajo">Anulado</span>}<div className="desglose">{a.metodo}{a.nota && ' · ' + a.nota}{a.anulado && a.motivoAnulacion && ' · Motivo: ' + a.motivoAnulacion}</div></td>
                  <td className="num">
                    {a.anulado ? <s>{usd(a.monto)}</s> : usd(a.monto)}
                    {a.tasa && <div className="desglose">
                      {bs(a.montoBs ?? equivalenteBs(a.monto, a.tasa))} · {num(a.tasa, 4)} Bs/USD
                      {' · ' + (a.tasaDetalle?.fuenteExterna || a.tasaDetalle?.fuente || TIPOS_TASA[a.tasaDetalle?.tipo]?.nombre || 'Tasa histórica')}
                      {a.tasaDetalle?.fecha && ' · ref. ' + fecha(a.tasaDetalle.fecha)}
                    </div>}
                    {a.saldoDespues != null && <div className="desglose">
                      {a.saldoDespues < 0 ? 'Excedente al registrar: ' : 'Saldo al registrar: '}{usd(Math.abs(a.saldoDespues))}
                    </div>}
                  </td>
                  <td className="num">{!a.anulado && <button className="peligro mini" onClick={async () => { const motivo = prompt('Motivo de anulación del pago:'); if (!motivo?.trim()) return; await db.transaction('rw',db.pedidos,async () => { const actual = await db.pedidos.get(p.id); const abonos = [...(actual.abonos || [])]; if (abonos[i]?.anulado) return; abonos[i] = {...abonos[i], anulado:true, motivoAnulacion:motivo.trim().slice(0,300), fechaAnulacion:new Date().toISOString()}; await db.pedidos.update(p.id,{abonos}) }) }}>Anular</button>}</td>
                </tr>
              ))}
              {!p.abonos?.length && <tr><td className="vacio">Aún no hay pagos.</td></tr>}
            </tbody>
          </table>
          <table className="resumen" style={{ marginTop: 10 }}>
            <tbody>
              <tr><td>Pagado</td><td className="num">{usd(totalAbonos(p))}</td></tr>
              <tr className="total"><td>{saldo >= -0.005 ? 'Saldo pendiente' : 'Pagado de más'}</td><td className="num">{usd(Math.abs(saldo))}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <FlujoProduccion pedido={p} />
      <TiemposProduccion pedido={p} />
      <ConsumoMateriales pedido={p} productos={productos} />
      <FichaRentabilidad pedido={p} />

      <RepartoPedido pedido={p} config={config} />

      <div className="tarjeta">
        <h3>Historial</h3>
        <div className="desglose">
          {(p.historial || []).map((h, i) => (
            <div key={i}>{new Date(h.fecha).toLocaleString('es-VE')} — {ESTADOS_PEDIDO[h.estado]}</div>
          ))}
        </div>
      </div>

      {abonando && <AbonoForm pedido={p} saldo={saldo} metodos={config.metodosPago || []} onCerrar={() => setAbonando(false)} />}
    </>
  )
}

function AbonoForm({ pedido, saldo, metodos, onCerrar }) {
  const [a, setA] = useState({ fecha: hoy(), monto: saldo > 0 ? Math.round(saldo * 100) / 100 : null, metodo: metodos[0]?.nombre ?? '', tasa: null, tipoTasa: 'bcv_usd', tasaDetalle: null, nota: '' })
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setA((x) => ({ ...x, [k]: v }))
  async function guardar() {
    setGuardando(true)
    try {
      await registrarAbono(pedido.id, a)
      onCerrar()
    } catch (error) {
      alert(error.message)
      setGuardando(false)
    }
  }
  return (
    <Modal titulo="Registrar pago" onCerrar={onCerrar}>
      <p className="muted">Saldo pendiente: {usd(saldo)}. Si te pagan en bolívares, anota el equivalente en $ y la tasa usada.</p>
      <div className="fila">
        <Campo label="Fecha" tipo="date" valor={a.fecha} onCambio={(v) => set('fecha', v)} />
        <Campo label="Monto ($)" tipo="number" valor={a.monto} onCambio={(v) => set('monto', v)} autoFocus />
        <Selector label="Método" valor={a.metodo} onCambio={(v) => set('metodo', v)} opciones={metodos.map((m) => ({ value: m.nombre, label: m.nombre }))} />
      </div>
      <TasaOperacion valor={a} fecha={a.fecha} montoUsd={a.monto}
        opcional={monedaMetodoPago(a.metodo) !== 'Bs'}
        onCambio={cambios => setA(actual => ({ ...actual, ...cambios }))} />
      <Campo label="Nota" valor={a.nota} onCambio={(v) => set('nota', v)} placeholder="N.º de referencia, abono inicial…" />
      <div className="modal-pie"><button className="sec" onClick={onCerrar}>Cancelar</button><button onClick={guardar} disabled={guardando}>Guardar pago</button></div>
    </Modal>
  )
}
