import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, ESTADOS_PEDIDO, codigoPedido, datosContables } from '../db.js'
import { generarAsientos, estadoResultados } from '../lib/contabilidad.js'
import { useConfig, useTasa, Avisos } from '../components/ui.jsx'
import { bajoStock } from './Inventario.jsx'
import { codigo, ESTADOS } from './Cotizaciones.jsx'
import { n, saldoPedido, personas } from '../lib/calc.js'
import { usd, num, fecha, hoy } from '../lib/format.js'

export default function Inicio() {
  const config = useConfig()
  const tasa = useTasa()
  const productos = useLiveQuery(() => db.productos.toArray(), [], [])
  const activos = useLiveQuery(() => db.activos.count(), [], 0)
  const pedidos = useLiveQuery(() => db.pedidos.toArray(), [], [])
  const datosC = useLiveQuery(() => datosContables(), [], null)
  const resMes = useMemo(() => (datosC ? estadoResultados(generarAsientos(datosC), datosC.config, hoy().slice(0, 8) + '01', hoy()) : null), [datosC])
  const cots = useLiveQuery(() => db.cotizaciones.orderBy('numero').reverse().toArray(), [], [])

  const mes = hoy().slice(0, 7)
  const delMes = cots.filter((c) => c.fecha?.startsWith(mes))
  const aprobadasMes = delMes.filter((c) => c.estado === 'aprobada')
  const valorInv = productos.reduce((s, p) => s + Math.max(0, n(p.stock)) * n(p.costoPromedio), 0)
  const bajos = productos.filter(bajoStock)

  const activosPed = pedidos.filter((p) => !['entregado', 'cancelado'].includes(p.estado))
    .sort((a, b) => (a.fechaEntrega || '9999') < (b.fechaEntrega || '9999') ? -1 : 1)
  const porCobrar = pedidos.filter((p) => p.estado !== 'cancelado').reduce((s, p) => s + Math.max(0, saldoPedido(p)), 0)
  const pendientes = []
  if (personas(config).some((p) => !n(p.tarifaHora))) pendientes.push('La tarifa por hora de cada persona')
  if (!config.reparto?.destinos?.every((d) => d.pct != null && d.pct !== '')) pendientes.push('Tu regla de reparto de utilidades')
  if (config.mermaPorDefecto == null) pendientes.push('El % de merma por defecto')
  if ((config.lineas || []).some((l) => l.margenPct == null)) pendientes.push('El margen de cada línea de servicio')
  if (!config.costosFijos?.length) pendientes.push('Tus costos fijos mensuales')
  if (!n(config.costoKwh)) pendientes.push('El costo de la electricidad (kWh)')
  if (!tasa || tasa.fecha !== hoy()) pendientes.push('La tasa de cambio de hoy')
  if (!productos.length) pendientes.push('Tus productos y materiales en Inventario')
  if (!activos) pendientes.push('Tus máquinas en Activos')
  const diasRespaldo = config.ultimoRespaldo ? (Date.now() - new Date(config.ultimoRespaldo)) / 864e5 : null

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Hola, bienvenida a Atelune</h1>
          <p>Resumen de hoy, {fecha(hoy())}</p>
        </div>
        <Link className="boton" to="/cotizaciones">Ir a cotizaciones</Link>
      </div>

      <div className="grid g4">
        <div className="tarjeta kpi"><div className="etiqueta">Tasa del día</div><div className="valor">{tasa ? num(tasa.tasa, 2) : '—'}</div><div className="desglose">{tasa ? `Bs/$ · ${fecha(tasa.fecha)}` : 'sin cargar'}</div></div>
        <div className="tarjeta kpi"><div className="etiqueta">Pedidos pendientes</div><div className="valor">{activosPed.length}</div><div className="desglose">{delMes.length} cotizaciones este mes · {aprobadasMes.length} aprobadas</div></div>
        <div className="tarjeta kpi"><div className="etiqueta">Por cobrar</div><div className="valor">{usd(porCobrar)}</div><div className="desglose">saldos de pedidos</div></div>
        <div className="tarjeta kpi"><div className="etiqueta">Valor del inventario</div><div className="valor">{usd(valorInv)}</div><div className="desglose">{productos.length} productos</div></div>
      </div>

      {resMes && (
        <div className="tarjeta">
          <div className="encabezado" style={{ marginBottom: 6 }}>
            <h2 style={{ margin: 0 }}>Resultado de este mes</h2>
            <Link to="/contabilidad" className="desglose">ver contabilidad →</Link>
          </div>
          <div className="grid g4">
            <div className="kpi"><div className="etiqueta">Ingresos (entregado)</div><div className="valor">{usd(resMes.totalIngresos)}</div></div>
            <div className="kpi"><div className="etiqueta">Costos</div><div className="valor">{usd(resMes.totalCostos)}</div></div>
            <div className="kpi"><div className="etiqueta">Gastos</div><div className="valor">{usd(resMes.totalGastos)}</div></div>
            <div className="kpi"><div className="etiqueta">{resMes.utilidadNeta >= 0 ? 'Utilidad' : 'Pérdida'}</div><div className="valor" style={{ color: resMes.utilidadNeta >= 0 ? 'var(--ok)' : 'var(--alerta)' }}>{usd(resMes.utilidadNeta)}</div></div>
          </div>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="avisos">
          <strong>Para que el cotizador calcule bien, falta cargar:</strong>
          <ul>{pendientes.map((p) => <li key={p}>{p}</li>)}</ul>
          <div style={{ marginTop: 8 }} className="acciones">
            <Link className="boton sec" to="/configuracion">Configuración</Link>
            <Link className="boton sec" to="/tasas">Tasa</Link>
            <Link className="boton sec" to="/inventario">Inventario</Link>
            <Link className="boton sec" to="/activos">Activos</Link>
          </div>
        </div>
      )}
      {(diasRespaldo == null || diasRespaldo > 7) && (productos.length > 0 || cots.length > 0) && (
        <Avisos tono="suave" titulo="Respaldo" lista={[diasRespaldo == null ? 'Aún no has descargado ningún respaldo.' : `Tu último respaldo fue hace ${Math.floor(diasRespaldo)} días.`]} />
      )}

      <div className="tarjeta">
        <h2>Próximas entregas</h2>
        {activosPed.length ? (
          <table><tbody>{activosPed.slice(0, 8).map((p) => (
            <tr key={p.id}>
              <td><Link to={'/pedidos/' + p.id}>{codigoPedido(p.numero)}</Link></td>
              <td>{p.cliente}</td>
              <td><span className={'etiqueta-tipo' + (['en_diseno', 'en_produccion'].includes(p.estado) ? ' proceso' : p.estado === 'listo' ? ' ok' : ' neutro')}>{ESTADOS_PEDIDO[p.estado]}</span></td>
              <td className={p.fechaEntrega && p.fechaEntrega < hoy() ? 'pendiente' : ''}>{p.fechaEntrega ? fecha(p.fechaEntrega) : 'sin fecha'}</td>
              <td className="num">{saldoPedido(p) > 0.005 ? <span className="pendiente">debe {usd(saldoPedido(p))}</span> : ''}</td>
            </tr>
          ))}</tbody></table>
        ) : <p className="muted">No hay pedidos pendientes.</p>}
      </div>

      <div className="grid g2">
        <div className="tarjeta">
          <h2>Stock bajo</h2>
          {bajos.length ? (
            <table><tbody>{bajos.map((p) => (
              <tr key={p.id}><td>{p.nombre}</td><td className="num">{num(p.stock)} {p.unidadUso}</td><td className="num desglose">mín. {num(p.stockMinimo)}</td></tr>
            ))}</tbody></table>
          ) : <p className="muted">Nada por reponer.</p>}
        </div>
        <div className="tarjeta">
          <h2>Últimas cotizaciones</h2>
          {cots.length ? (
            <table><tbody>{cots.slice(0, 6).map((c) => (
              <tr key={c.id}>
                <td><Link to={'/cotizaciones/' + c.id}>{codigo(c.numero)}</Link></td>
                <td>{c.cliente || <span className="muted">sin cliente</span>}</td>
                <td><span className={'etiqueta-tipo' + (c.estado === 'aprobada' ? ' ok' : c.estado === 'rechazada' ? ' bajo' : c.estado === 'enviada' ? ' proceso' : ' neutro')}>{ESTADOS[c.estado]}</span></td>
                <td className="num">{usd(c.calculo?.total)}</td>
              </tr>
            ))}</tbody></table>
          ) : <p className="muted">Aún no hay cotizaciones.</p>}
        </div>
      </div>
    </>
  )
}
