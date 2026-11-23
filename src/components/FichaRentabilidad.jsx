import { fichaRentabilidad } from '../lib/rentabilidad.js'
import { tiempoLegible } from '../lib/tiempos.js'
import { usd } from '../lib/format.js'
import { resumenMateriales } from '../lib/merma.js'
import { utilidadContablePedido } from '../lib/contabilidad.js'

const monto = v => v == null ? 'Sin datos' : usd(v)

export default function FichaRentabilidad({ pedido, movimientos }) {
  const r = fichaRentabilidad(pedido)
  const m = resumenMateriales(pedido)
  const contable = utilidadContablePedido(pedido, movimientos)
  return <section className="tarjeta">
    <h2>Ficha de rentabilidad del pedido</h2>
    <p className="muted">Comparación entre el presupuesto guardado al crear el pedido y la mano de obra registrada. No se modifican ventas, caja, inventario, reparto ni contabilidad. Los materiales, máquinas, merma y costos fijos siguen siendo presupuestados.</p>
    <div className="grid g4">
      <div className="kpi"><div className="etiqueta">Precio de trabajos (sin envío, recargos ni IVA)</div><div className="valor">{monto(r.precioTrabajos)}</div></div>
      <div className="kpi"><div className="etiqueta">Costo presupuestado</div><div className="valor">{monto(r.costoPresupuestado)}</div></div>
      <div className="kpi"><div className="etiqueta">Utilidad presupuestada</div><div className="valor">{monto(r.gananciaPresupuestada)}</div></div>
      <div className="kpi"><div className="etiqueta">Tiempo anotado</div><div className="valor">{tiempoLegible(r.minutosRegistrados)}</div></div>
    </div>
    <h3>Presupuesto y utilidad bruta contable</h3>
    {contable ? <>
      <div className="fila">
        <strong>Utilidad bruta contable: {usd(contable.utilidad)}</strong>
        {r.gananciaPresupuestada != null && <strong>Diferencia frente al presupuesto: {usd(contable.utilidad - r.gananciaPresupuestada)}</strong>}
      </div>
      <p>Ingresos contabilizados: {usd(contable.ingresos)}. Costo contabilizado: {usd(contable.costo)}.</p>
      {contable.variacionPromedio != null && contable.variacionPromedio !== 0 &&
        <p>El costo promedio al consumir los materiales {contable.variacionPromedio > 0 ? 'aumentó' : 'redujo'} su costo en {usd(Math.abs(contable.variacionPromedio))} frente al costo unitario presupuestado para la misma cantidad.</p>}
      {contable.sinConsumo && <p className="ayuda">No hay salidas vinculadas a este pedido.</p>}
      {contable.variacionPromedio == null && !contable.sinConsumo && <p className="ayuda">No se conservó un costo unitario de referencia para todos los materiales consumidos.</p>}
      <p className="ayuda">La diferencia también puede incluir recargos, envío y partidas presupuestadas que no figuran como costo de ventas.</p>
    </> : <p className="ayuda">Disponible después de registrar la entrega y cargar sus movimientos.</p>}
    <h3>Materiales observados · dato separado</h3>
    <p className="muted">Costo registrado de materiales útiles y desperdiciados: <strong>{usd(m.valorConocido)}</strong>. {m.costoIncompleto ? `${m.costoIncompleto} registro(s) sin costo.` : ''} {m.trabajosSinRegistros ? `${m.trabajosSinRegistros} trabajo(s) sin registro.` : ''} No se añade a la proyección ajustada para evitar duplicar los costos de materiales ya incluidos en el presupuesto. Los materiales observados no garantizan consumo completo.</p>
    <h3>Mano de obra · presupuesto frente a lo anotado</h3>
    <div className="tabla-scroll"><table><thead><tr><th>Trabajo</th><th className="num">Presupuestada</th><th className="num">Registrada conocida</th><th>Estado de registro</th></tr></thead><tbody>
      {r.lineas.map((l, i) => <tr key={i}><td>{l.descripcion}<div className="desglose">{tiempoLegible(l.minutos)} · {l.sesiones} sesión(es)</div></td><td className="num">{monto(l.manoObraPresupuestada)}</td><td className="num">{usd(l.manoObraRegistrada)}</td><td>{l.sinTarifa ? `${l.sinTarifa} sin tarifa` : l.sesiones ? 'Con tarifa' : 'Sin sesiones'}</td></tr>)}
    </tbody></table></div>
    <div className="fila" style={{ marginTop: 12 }}>
      <span className="etiqueta-tipo neutro">Mano de obra presupuestada: {monto(r.manoObraPresupuestada)}</span>
      <span className="etiqueta-tipo proceso">Mano de obra registrada con tarifa: {usd(r.manoObraRegistrada)}</span>
    </div>
    {r.aptoProyeccion ? <div className="subtabla" style={{ marginTop: 12 }}>
      <h3>Proyección ajustada · solo mano de obra</h3>
      <p className="muted">Se sustituye la mano de obra presupuestada por la registrada, sin sumarla dos veces. No equivale a un costo real verificado: otros costos siguen estimados y podrían existir sesiones sin registrar.</p>
      <div className="fila"><strong>Costo proyectado: {usd(r.costoAjustado)}</strong><strong>Utilidad proyectada: {usd(r.utilidadAjustada)}</strong></div>
      {r.pendienteConfirmacion && <p className="pendiente">Pedido no entregado: resultado provisional.</p>}
    </div> : <p className="pendiente">Proyección ajustada no disponible hasta que todos los trabajos tengan sesiones con tarifa y el presupuesto esté completo.</p>}
    {r.avisos.length > 0 && <div className="avisos" style={{ marginTop: 12 }}><strong>Datos pendientes o condiciones:</strong><ul>{r.avisos.map((a,i) => <li key={i}>{a}</li>)}</ul></div>}
  </section>
}
