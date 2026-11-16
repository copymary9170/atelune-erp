import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, datosContables } from '../db.js'
import { Campo, Modal, Selector, useConfig } from '../components/ui.jsx'
import {
  generarAsientos, infoCuenta, mayor, balanceComprobacion, estadoResultados, balanceGeneral,
  GRUPOS, CUENTAS_FIJAS, cuentaDisponible, cuentaVenta, cuentaGasto, CATEGORIAS_GASTO,
} from '../lib/contabilidad.js'
import { n } from '../lib/calc.js'
import { usd, fecha, hoy } from '../lib/format.js'

const PESTANAS = [
  ['diario', 'Libro diario'],
  ['mayor', 'Libro mayor'],
  ['comprobacion', 'Balance de comprobación'],
  ['resultados', 'Estado de resultados'],
  ['balance', 'Balance general'],
  ['manuales', 'Asientos manuales'],
]

const ENLACE_ORIGEN = { pedido: (o) => '/pedidos/' + o.id, gasto: () => '/gastos', inventario: () => '/inventario', activo: () => '/activos', manual: () => null }

function inicioMes() { return hoy().slice(0, 8) + '01' }

export default function Contabilidad() {
  const config = useConfig()
  // Se recalcula cada vez que cambia cualquier tabla de origen.
  const datos = useLiveQuery(() => datosContables(), [], null)
  const asientos = useMemo(() => (datos ? generarAsientos(datos) : []), [datos])
  const [tab, setTab] = useState('diario')
  const [desde, setDesde] = useState(inicioMes())
  const [hasta, setHasta] = useState(hoy())

  if (!datos) return <p className="muted">Calculando…</p>

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Contabilidad</h1>
          <p>Los asientos se generan solos a partir de pedidos, pagos, inventario, gastos y activos. Reportes de gestión interna: valídalos con tu contador.</p>
        </div>
      </div>
      <div className="acciones" style={{ marginBottom: 14 }}>
        {PESTANAS.map(([k, l]) => <button key={k} className={tab === k ? '' : 'sec'} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab !== 'manuales' && (
        <div className="tarjeta">
          <div className="fila">
            {tab !== 'balance' && <Campo label="Desde" tipo="date" valor={desde} onCambio={setDesde} />}
            <Campo label={tab === 'balance' ? 'Al' : 'Hasta'} tipo="date" valor={hasta} onCambio={setHasta} />
            <div className="campo auto"><label>&nbsp;</label>
              <div className="acciones">
                <button className="sec mini" onClick={() => { setDesde(inicioMes()); setHasta(hoy()) }}>Este mes</button>
                <button className="sec mini" onClick={() => { setDesde(hoy().slice(0, 4) + '-01-01'); setHasta(hoy()) }}>Este año</button>
                <button className="sec mini" onClick={() => { setDesde(''); setHasta(hoy()) }}>Todo</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {tab === 'diario' && <Diario asientos={asientos} config={config} desde={desde} hasta={hasta} />}
      {tab === 'mayor' && <Mayor asientos={asientos} config={config} desde={desde} hasta={hasta} />}
      {tab === 'comprobacion' && <Comprobacion asientos={asientos} config={config} desde={desde} hasta={hasta} />}
      {tab === 'resultados' && <Resultados asientos={asientos} config={config} desde={desde} hasta={hasta} />}
      {tab === 'balance' && <Balance asientos={asientos} config={config} hasta={hasta} />}
      {tab === 'manuales' && <Manuales config={config} asientos={asientos} />}
    </>
  )
}

const nombre = (c, config) => infoCuenta(c, config).nombre

function Diario({ asientos, config, desde, hasta }) {
  const lista = asientos.filter((a) => (!desde || a.fecha >= desde) && (!hasta || a.fecha <= hasta))
  const totD = lista.reduce((s, a) => s + a.lineas.reduce((t, l) => t + l.debe, 0), 0)
  const totH = lista.reduce((s, a) => s + a.lineas.reduce((t, l) => t + l.haber, 0), 0)
  return (
    <div className="tarjeta tabla-scroll">
      <table>
        <thead><tr><th>Fecha</th><th>Cuenta / concepto</th><th className="num">Debe</th><th className="num">Haber</th></tr></thead>
        <tbody>
          {lista.map((a, i) => {
            const enlace = ENLACE_ORIGEN[a.origen?.tipo]?.(a.origen)
            return [
              <tr key={i + 'h'} style={{ background: 'var(--papel)' }}>
                <td><strong>{fecha(a.fecha)}</strong></td>
                <td colSpan={3}><strong>{a.concepto}</strong>{enlace && <> · <Link to={enlace} className="desglose">ver origen</Link></>}</td>
              </tr>,
              ...a.lineas.map((l, j) => (
                <tr key={i + '-' + j}>
                  <td></td>
                  <td style={{ paddingLeft: l.haber ? 36 : 10 }}>{nombre(l.cuenta, config)}</td>
                  <td className="num">{l.debe ? usd(l.debe) : ''}</td>
                  <td className="num">{l.haber ? usd(l.haber) : ''}</td>
                </tr>
              )),
            ]
          })}
          {!lista.length && <tr><td colSpan={4} className="vacio">No hay asientos en este período.</td></tr>}
          {lista.length > 0 && <tr className="resumen"><td></td><td><strong>Totales ({lista.length} asientos)</strong></td><td className="num"><strong>{usd(totD)}</strong></td><td className="num"><strong>{usd(totH)}</strong></td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function cuentasUsadas(asientos) {
  return [...new Set(asientos.flatMap((a) => a.lineas.map((l) => l.cuenta)))].sort()
}

function Mayor({ asientos, config, desde, hasta }) {
  const cuentas = cuentasUsadas(asientos)
  const [cuenta, setCuenta] = useState(cuentas[0] ?? '')
  const m = cuenta ? mayor(asientos, cuenta, config, desde, hasta) : null
  return (
    <div className="tarjeta">
      <Selector label="Cuenta" valor={cuenta} onCambio={setCuenta} vacio={cuentas.length ? undefined : 'Aún no hay movimientos'}
        opciones={cuentas.map((c) => ({ value: c, label: `${c.split(':')[0]} · ${nombre(c, config)}` }))} />
      {m && (
        <div className="tabla-scroll">
          <table>
            <thead><tr><th>Fecha</th><th>Concepto</th><th className="num">Debe</th><th className="num">Haber</th><th className="num">Saldo</th></tr></thead>
            <tbody>
              <tr className="desglose"><td></td><td>Saldo inicial</td><td></td><td></td><td className="num">{usd(m.saldoInicial)}</td></tr>
              {m.filas.map((f, i) => (
                <tr key={i}><td>{fecha(f.fecha)}</td><td>{f.concepto}</td><td className="num">{f.debe ? usd(f.debe) : ''}</td><td className="num">{f.haber ? usd(f.haber) : ''}</td><td className="num">{usd(f.saldo)}</td></tr>
              ))}
              <tr className="resumen total"><td></td><td>Saldo final</td><td></td><td></td><td className="num">{usd(m.saldoFinal)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Comprobacion({ asientos, config, desde, hasta }) {
  const b = balanceComprobacion(asientos, config, desde, hasta)
  const cuadra = Math.abs(b.debe - b.haber) < 0.01
  return (
    <div className="tarjeta tabla-scroll">
      <p><span className={'etiqueta-tipo' + (cuadra ? ' ok' : ' bajo')}>{cuadra ? 'Cuadrado ✓' : 'Descuadre'}</span></p>
      <table>
        <thead><tr><th>Código</th><th>Cuenta</th><th className="num">Debe</th><th className="num">Haber</th><th className="num">Saldo deudor</th><th className="num">Saldo acreedor</th></tr></thead>
        <tbody>
          {b.filas.map((f) => (
            <tr key={f.codigo}><td className="desglose">{f.codigo.split(':')[0]}</td><td>{f.nombre}</td><td className="num">{usd(f.debe)}</td><td className="num">{usd(f.haber)}</td><td className="num">{f.saldoDeudor ? usd(f.saldoDeudor) : ''}</td><td className="num">{f.saldoAcreedor ? usd(f.saldoAcreedor) : ''}</td></tr>
          ))}
          {!b.filas.length && <tr><td colSpan={6} className="vacio">Sin movimientos en este período.</td></tr>}
          <tr className="resumen total"><td></td><td>Totales</td><td className="num">{usd(b.debe)}</td><td className="num">{usd(b.haber)}</td><td className="num">{usd(b.saldoDeudor)}</td><td className="num">{usd(b.saldoAcreedor)}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

function Resultados({ asientos, config, desde, hasta }) {
  const r = estadoResultados(asientos, config, desde, hasta)
  const Bloque = ({ titulo, lista, total }) => (
    <>
      <tr><td colSpan={2}><strong>{titulo}</strong></td></tr>
      {lista.map((x) => <tr key={x.codigo}><td style={{ paddingLeft: 24 }}>{x.nombre}</td><td className="num">{usd(x.monto)}</td></tr>)}
      {!lista.length && <tr><td style={{ paddingLeft: 24 }} className="muted">—</td><td></td></tr>}
      <tr><td style={{ paddingLeft: 24 }}><em>Total {titulo.toLowerCase()}</em></td><td className="num"><em>{usd(total)}</em></td></tr>
    </>
  )
  return (
    <div className="tarjeta" style={{ maxWidth: 680 }}>
      <h2>Estado de resultados</h2>
      <p className="muted">Del {desde ? fecha(desde) : 'inicio'} al {fecha(hasta)}</p>
      <table className="resumen">
        <tbody>
          <Bloque titulo="Ingresos" lista={r.ingresos} total={r.totalIngresos} />
          <Bloque titulo="Costos" lista={r.costos} total={r.totalCostos} />
          <tr className="total"><td>Utilidad bruta</td><td className="num">{usd(r.utilidadBruta)}</td></tr>
          <Bloque titulo="Gastos" lista={r.gastos} total={r.totalGastos} />
          <tr className="total"><td>{r.utilidadNeta >= 0 ? 'Utilidad neta' : 'Pérdida neta'}</td><td className="num">{usd(r.utilidadNeta)}</td></tr>
        </tbody>
      </table>
      <p className="ayuda">Tu mano de obra no aparece como gasto porque no es un pago a terceros: está dentro de la utilidad. Los ingresos se reconocen cuando el pedido se marca como entregado.</p>
    </div>
  )
}

function Balance({ asientos, config, hasta }) {
  const b = balanceGeneral(asientos, config, hasta)
  const cuadra = Math.abs(b.totalActivo - b.totalPasivo - b.totalPatrimonio) < 0.01
  const Lista = ({ lista }) => lista.map((x) => (
    <tr key={x.codigo}><td style={{ paddingLeft: 24 }}>{x.nombre}</td><td className="num">{x.contra ? '−' + usd(x.saldo) : usd(x.saldo)}</td></tr>
  ))
  return (
    <div className="grid g2">
      <div className="tarjeta">
        <h2>Activo</h2>
        <table className="resumen"><tbody>
          <Lista lista={b.activo} />
          <tr className="total"><td>Total activo</td><td className="num">{usd(b.totalActivo)}</td></tr>
        </tbody></table>
      </div>
      <div className="tarjeta">
        <h2>Pasivo y patrimonio</h2>
        <table className="resumen"><tbody>
          <tr><td colSpan={2}><strong>Pasivo</strong></td></tr>
          <Lista lista={b.pasivo} />
          <tr><td style={{ paddingLeft: 24 }}><em>Total pasivo</em></td><td className="num"><em>{usd(b.totalPasivo)}</em></td></tr>
          <tr><td colSpan={2}><strong>Patrimonio</strong></td></tr>
          <Lista lista={b.patrimonio} />
          <tr><td style={{ paddingLeft: 24 }}>Resultados acumulados</td><td className="num">{usd(b.resultado)}</td></tr>
          <tr><td style={{ paddingLeft: 24 }}><em>Total patrimonio</em></td><td className="num"><em>{usd(b.totalPatrimonio)}</em></td></tr>
          <tr className="total"><td>Total pasivo + patrimonio</td><td className="num">{usd(b.totalPasivo + b.totalPatrimonio)}</td></tr>
        </tbody></table>
        <p><span className={'etiqueta-tipo' + (cuadra ? ' ok' : ' bajo')}>{cuadra ? 'Activo = Pasivo + Patrimonio ✓' : 'Descuadre'}</span></p>
      </div>
    </div>
  )
}

// ---------- Asientos manuales ----------
function catalogo(config, asientos) {
  const codigos = new Set([
    ...Object.keys(CUENTAS_FIJAS),
    ...(config.metodosPago || []).map((m) => cuentaDisponible(m.nombre)),
    ...(config.lineas || []).map((l) => cuentaVenta(l.id)),
    ...(config.categoriasGasto || CATEGORIAS_GASTO).map((c) => cuentaGasto(c)),
    ...cuentasUsadas(asientos),
  ])
  return GRUPOS.map(([tipo, titulo]) => ({
    titulo,
    cuentas: [...codigos].map((c) => infoCuenta(c, config)).filter((x) => x.tipo === tipo).sort((a, b) => (a.codigo < b.codigo ? -1 : 1)),
  }))
}

function Manuales({ config, asientos }) {
  const manuales = useLiveQuery(() => db.asientosManuales.orderBy('fecha').reverse().toArray(), [], [])
  const [editando, setEditando] = useState(null)
  return (
    <div className="tarjeta">
      <div className="encabezado">
        <p className="muted" style={{ maxWidth: 640 }}>Para lo que no sale de otra pantalla: saldos iniciales, correcciones, préstamos, pago de IVA, etc.
          Los aportes, retiros y gastos se registran mejor en <Link to="/gastos">Gastos y pagos</Link>.</p>
        <button onClick={() => setEditando({ fecha: hoy(), concepto: '', lineas: [{ cuenta: '', debe: null, haber: null }, { cuenta: '', debe: null, haber: null }] })}>+ Nuevo asiento</button>
      </div>
      <table>
        <tbody>
          {manuales.map((m) => (
            <tr key={m.id} className="clic" onClick={() => setEditando(m)}>
              <td>{fecha(m.fecha)}</td><td>{m.concepto}</td>
              <td className="num">{usd(m.lineas.reduce((s, l) => s + n(l.debe), 0))}</td>
            </tr>
          ))}
          {!manuales.length && <tr><td className="vacio">No hay asientos manuales.</td></tr>}
        </tbody>
      </table>
      {editando && <ManualForm inicial={editando} grupos={catalogo(config, asientos)} onCerrar={() => setEditando(null)} />}
    </div>
  )
}

function ManualForm({ inicial, grupos, onCerrar }) {
  const [a, setA] = useState(structuredClone(inicial))
  const setLinea = (i, k, v) => setA((x) => ({ ...x, lineas: x.lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }))
  const debe = a.lineas.reduce((s, l) => s + n(l.debe), 0)
  const haber = a.lineas.reduce((s, l) => s + n(l.haber), 0)
  const cuadra = Math.abs(debe - haber) < 0.005 && debe > 0

  async function guardar() {
    if (!a.concepto?.trim()) return alert('Escribe el concepto.')
    if (a.lineas.some((l) => (n(l.debe) || n(l.haber)) && !l.cuenta)) return alert('Elige la cuenta de cada línea.')
    if (!cuadra) return alert('El asiento no cuadra: el total del debe debe ser igual al del haber.')
    await db.asientosManuales.put({ ...a, lineas: a.lineas.filter((l) => n(l.debe) || n(l.haber)).map((l) => ({ cuenta: l.cuenta, debe: n(l.debe), haber: n(l.haber) })) })
    onCerrar()
  }

  return (
    <Modal titulo={inicial.id ? 'Editar asiento' : 'Nuevo asiento'} onCerrar={onCerrar} ancho>
      <div className="fila">
        <Campo className="auto" label="Fecha" tipo="date" valor={a.fecha} onCambio={(v) => setA({ ...a, fecha: v })} />
        <Campo label="Concepto" valor={a.concepto} onCambio={(v) => setA({ ...a, concepto: v })} placeholder="Ej.: Saldo inicial en banco" />
      </div>
      {a.lineas.map((l, i) => (
        <div className="fila" key={i}>
          <div className="campo">
            {i === 0 && <label>Cuenta</label>}
            <select value={l.cuenta} onChange={(e) => setLinea(i, 'cuenta', e.target.value)}>
              <option value="">Elegir cuenta…</option>
              {grupos.map((g) => (
                <optgroup key={g.titulo} label={g.titulo}>
                  {g.cuentas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo.split(':')[0]} · {c.nombre}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <Campo className="angosto" label={i === 0 ? 'Debe' : ''} tipo="number" valor={l.debe} onCambio={(v) => setLinea(i, 'debe', v)} />
          <Campo className="angosto" label={i === 0 ? 'Haber' : ''} tipo="number" valor={l.haber} onCambio={(v) => setLinea(i, 'haber', v)} />
          <div className="campo auto"><button className="peligro mini" onClick={() => setA({ ...a, lineas: a.lineas.filter((_, j) => j !== i) })}>×</button></div>
        </div>
      ))}
      <button className="sec mini" onClick={() => setA({ ...a, lineas: [...a.lineas, { cuenta: '', debe: null, haber: null }] })}>+ Línea</button>
      <p className={cuadra ? 'ayuda' : 'pendiente'} style={{ marginTop: 10 }}>Debe {usd(debe)} · Haber {usd(haber)} {cuadra ? '✓ cuadra' : '— debe cuadrar'}</p>
      <div className="modal-pie">
        {inicial.id && <button className="peligro" style={{ marginRight: 'auto' }} onClick={async () => { if (confirm('¿Eliminar este asiento?')) { await db.asientosManuales.delete(inicial.id); onCerrar() } }}>Eliminar</button>}
        <button className="sec" onClick={onCerrar}>Cancelar</button>
        <button onClick={guardar}>Guardar</button>
      </div>
    </Modal>
  )
}
