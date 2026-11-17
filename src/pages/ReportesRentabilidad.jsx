import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { Campo, useConfig } from '../components/ui.jsx'
import { usd, fecha, hoy } from '../lib/format.js'
import { reporteRentabilidad } from '../lib/reporte-rentabilidad.js'

const inicioMes = () => hoy().slice(0, 8) + '01'
const dinero = x => x === null || x === undefined ? 'Pendiente' : usd(x)
function TablaRentabilidad({ titulo, filas, vacio, columnaCantidad = false }) {
  return <div className="tarjeta tabla-scroll">
    <h2>{titulo}</h2>
    <table>
      <thead><tr><th>Grupo</th>{columnaCantidad && <th className="num">Unidades</th>}
        <th className="num">Ventas de trabajos</th><th className="num">Costo presupuestado</th>
        <th className="num">Utilidad presupuestada</th><th className="num">Margen</th></tr></thead>
      <tbody>
        {filas.map(f => <tr key={f.clave}><td><strong>{f.nombre}</strong></td>
          {columnaCantidad && <td className="num">{f.cantidad}</td>}
          <td className="num">{usd(f.venta)}</td><td className="num">{usd(f.costo)}</td>
          <td className="num">{usd(f.utilidad)}</td>
          <td className="num">{f.margenPct === null ? '—' : f.margenPct + ' %'}</td>
        </tr>)}
        {!filas.length && <tr><td className="vacio" colSpan={columnaCantidad ? 6 : 5}>{vacio}</td></tr>}
      </tbody>
    </table>
  </div>
}

function exportarCsv(r) {
  // Exportación sin bibliotecas ni cambios en la base. UTF-8 + BOM para Excel.
  const columnas = ['Pedido', 'Fecha de entrega', 'Cliente', 'Ventas trabajos USD', 'Costo presupuestado USD', 'Utilidad presupuestada USD', 'Margen %', 'Incompleto']
  const escapar = v => '"' + String(v == null ? '' : v).replaceAll('"', '""') + '"'
  const filas = [columnas, ...r.filas.map(f => [
    'PED-' + String(f.numero).padStart(4, '0'), f.fecha, f.cliente, f.venta, f.costo,
    f.utilidad, f.margenPct, f.incompleto ? 'Sí' : 'No',
  ])]
  const csv = '\uFEFF' + filas.map(f => f.map(escapar).join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'atelune-rentabilidad-pedidos.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReportesRentabilidad() {
  const config = useConfig()
  const pedidos = useLiveQuery(() => db.pedidos.toArray(), [], null)
  const [desde, setDesde] = useState(inicioMes())
  const [hasta, setHasta] = useState(hoy())
  const [vista, setVista] = useState('lineas')
  const r = useMemo(() => pedidos ? reporteRentabilidad(pedidos, { desde, hasta, config }) : null,
    [pedidos, desde, hasta, config])
  const rangoInvalido = desde && hasta && desde > hasta
  const vistaFilas = vista === 'lineas' ? r?.porLinea : vista === 'trabajos' ? r?.porTrabajo : r?.porMes

  return <>
    <div className="encabezado">
      <div>
        <h1>Reportes de rentabilidad</h1>
        <p>Resultados presupuestados de pedidos entregados, separados de los cobros reales y de las proyecciones. No reemplazan el estado de resultados contable.</p>
      </div>
      <button className="sec" disabled={!r?.filas.length} onClick={() => exportarCsv(r)}>Exportar pedidos CSV</button>
    </div>
    <div className="tarjeta">
      <div className="fila">
        <Campo label="Desde (fecha de entrega)" tipo="date" valor={desde} onCambio={setDesde} />
        <Campo label="Hasta" tipo="date" valor={hasta} onCambio={setHasta} />
        <div className="campo auto"><label>&nbsp;</label><div className="acciones">
          <button className="sec mini" onClick={() => { setDesde(inicioMes()); setHasta(hoy()) }}>Este mes</button>
          <button className="sec mini" onClick={() => { setDesde(hoy().slice(0, 4) + '-01-01'); setHasta(hoy()) }}>Este año</button>
          <button className="sec mini" onClick={() => { setDesde(''); setHasta('') }}>Todo</button>
        </div></div>
      </div>
      {rangoInvalido && <p className="pendiente" role="alert">La fecha inicial no puede ser posterior a la final.</p>}
    </div>
    {!pedidos ? <p className="muted">Calculando datos de pedidos…</p> : r && <>
      <div className="grid g4">
        <div className="tarjeta kpi"><div className="etiqueta">Ventas con costo evaluado</div><div className="valor">{usd(r.ventasEvaluadas)}</div></div>
        <div className="tarjeta kpi"><div className="etiqueta">Costo presupuestado</div><div className="valor">{usd(r.costosEvaluados)}</div></div>
        <div className="tarjeta kpi"><div className="etiqueta">Utilidad presupuestada</div><div className="valor">{usd(r.utilidadEvaluada)}</div></div>
        <div className="tarjeta kpi"><div className="etiqueta">Margen presupuestado</div><div className="valor">{r.margenEvaluadoPct == null ? '—' : r.margenEvaluadoPct + ' %'}</div></div>
      </div>
      <div className="tarjeta">
        <h2>Cobertura de los datos</h2>
        <p><strong>{r.evaluados}</strong> pedidos entregados evaluados · <strong>{r.incompletos}</strong> entregados con costo incompleto · <strong>{r.sinFecha}</strong> entregados sin fecha verificable.</p>
        <p className="muted">Ventas de pedidos entregados con subtotal conocido: <strong>{usd(r.ventasConocidas)}</strong>. La utilidad solo se calcula para los pedidos con información completa.</p>
        <p className="muted">Pedidos abiertos en el rango por fecha de creación: <strong>{r.abiertos}</strong> · presupuestos de trabajos: <strong>{usd(r.presupuestoAbierto)}</strong>. No son ventas realizadas ni se suman a las cifras superiores.</p>
        {r.avisos.length > 0 && <div className="avisos"><strong>Limitaciones de datos:</strong><ul>{r.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
        <p className="ayuda">Los costos de materiales, máquinas, mano de obra y fijos son los congelados al crear cada pedido, no gastos reales comprobados. IVA, delivery y recargos no se incluyen en las ventas de trabajos. Consulta <Link to="/contabilidad">Contabilidad</Link> para el estado de resultados.</p>
      </div>
      <div className="acciones" style={{ marginBottom: 12 }}>
        {[['lineas', 'Por línea de servicio'], ['trabajos', 'Por tipo de trabajo'], ['meses', 'Por mes de entrega']].map(([id, nombre]) =>
          <button key={id} className={vista === id ? '' : 'sec'} onClick={() => setVista(id)}>{nombre}</button>)}
      </div>
      <TablaRentabilidad
        titulo={vista === 'lineas' ? 'Por línea de servicio' : vista === 'trabajos' ? 'Por trabajo / descripción' : 'Por mes de entrega'}
        filas={vistaFilas || []}
        columnaCantidad={vista !== 'meses'}
        vacio="Sin registros conciliados para este desglose y período." />
      <div className="tarjeta tabla-scroll">
        <h2>Detalle de pedidos entregados</h2>
        <table><thead><tr><th>Pedido</th><th>Entrega</th><th>Cliente</th>
          <th className="num">Ventas de trabajos</th><th className="num">Costo</th><th className="num">Utilidad</th><th>Estado</th></tr></thead>
          <tbody>
            {r.filas.map(p => <tr key={p.id}>
              <td><Link to={'/pedidos/' + p.id}>PED-{String(p.numero).padStart(4, '0')}</Link></td>
              <td>{fecha(p.fecha)}</td><td>{p.cliente || '—'}</td>
              <td className="num">{dinero(p.venta)}</td><td className="num">{dinero(p.costo)}</td>
              <td className="num">{dinero(p.utilidad)}</td>
              <td>{p.incompleto ? <span className="pendiente">Costo pendiente</span>
                : !p.desgloseDisponible ? 'Sin desglose conciliado' : 'Evaluado'}</td></tr>)}
            {!r.filas.length && <tr><td colSpan={7} className="vacio">No hay pedidos entregados con fecha en este período.</td></tr>}
          </tbody></table>
      </div>
    </>}
  </>
}
