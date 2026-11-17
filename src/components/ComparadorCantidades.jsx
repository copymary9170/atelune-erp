import { compararCantidadesCotizacion } from '../lib/comparador-cantidades.js'
import { usd, num } from '../lib/format.js'

const usdUnitario = v => Number.isFinite(v) ? '$' + Number(v).toFixed(4) : '—'

export default function ComparadorCantidades({ cotizacion, indice, datos }) {
  let comparacion
  try {
    const actual = Number(cotizacion.items[indice]?.cantidad)
    const cantidades = [...new Set([10, 50, 100, ...(Number.isSafeInteger(actual) && actual > 0 ? [actual] : [])])].sort((a, b) => a - b)
    comparacion = compararCantidadesCotizacion(cotizacion, indice, datos, cantidades)
  } catch (e) {
    return <div className="subtabla"><p role="alert" className="pendiente">{e?.message || 'No se pudo calcular la comparación.'}</p></div>
  }
  return <section className="subtabla">
    <h4>Comparador de cantidades · 10 / 50 / 100 unidades</h4>
    <p className="ayuda">Escenarios de este trabajo con los costos, tiempos, materiales, merma, uso de máquinas, descuento y condiciones de pago de esta cotización. La comparación no guarda ni cambia la cantidad elegida. El diseño se cobra una vez y los costos fijos se recalculan con los demás trabajos sin cambios.</p>
    {comparacion.tieneCostosPendientes &&
      <p className="pendiente" role="alert">Hay costos o configuraciones incompletos. Las cifras son provisionales: no uses estos precios como confirmados hasta completar los datos.</p>}
    <div className="tabla-scroll">
      <table>
        <thead><tr>
          <th className="num">Unidades</th>
          <th className="num">Costo total</th>
          <th className="num">Costo/u</th>
          <th className="num">Precio/u</th>
          <th className="num">Precio total</th>
          <th className="num">Utilidad</th>
          <th className="num">Margen real</th>
          <th>Condición</th>
        </tr></thead>
        <tbody>
          {comparacion.filas.map(f => <tr key={f.cantidad}>
            <td className="num"><strong>{num(f.cantidad, 0)}</strong>{Number(cotizacion.items[indice].cantidad) === f.cantidad && <div className="desglose">Actual</div>}</td>
            <td className="num">{usd(f.costoTotal)}</td>
            <td className="num">{usdUnitario(f.costoUnitario)}</td>
            <td className="num">{usdUnitario(f.precioUnitario)}</td>
            <td className="num"><strong>{usd(f.precioTotal)}</strong></td>
            <td className="num">{usd(f.utilidad)}</td>
            <td className="num">{f.margenRealPct === null ? '—' : num(f.margenRealPct, 2) + ' %'}</td>
            <td>{f.datosIncompletos ? <span className="pendiente">Costo pendiente</span>
              : f.porDebajoDeCosto ? <span className="pendiente">Por debajo del costo</span>
              : f.descuentoCantidadPct ? `Descuento de ${num(f.descuentoCantidadPct, 1)} %` : 'Sin descuento de volumen'}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="ayuda">Los precios son por este trabajo, sin IVA, comisión del método de pago ni delivery. No son precios mínimos sugeridos: revisa el margen real y evita aceptar trabajos con costos pendientes. La tarifa por unidad y los costos se muestran redondeados; los cálculos internos conservan más precisión.</p>
  </section>
}
