import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { Logo, useConfig } from '../components/ui.jsx'
import { codigo } from './Cotizaciones.jsx'
import { usd, bs, num, fecha } from '../lib/format.js'

function sumarDias(iso, dias) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + Number(dias))
  return d.toISOString().slice(0, 10)
}

export default function CotizacionImprimir() {
  const { id } = useParams()
  const navigate = useNavigate()
  const c = useLiveQuery(() => db.cotizaciones.get(Number(id)), [id])
  const config = useConfig()
  if (!c) return <p style={{ padding: 30 }}>Cargando…</p>
  const k = c.calculo || { renglones: [] }

  return (
    <div style={{ padding: '24px 14px', background: 'var(--papel)', minHeight: '100vh' }}>
      <div className="no-imprimir acciones">
        <button className="sec" onClick={() => navigate('/cotizaciones/' + c.id)}>← Volver a editar</button>
        <button onClick={() => window.print()}>Imprimir / Guardar como PDF</button>
        <span className="ayuda">En la ventana de impresión elige «Guardar como PDF».</span>
      </div>
      <div className="documento">
        <div className="cabecera">
          <div className="membrete">
            <div className="marca-escudo"><Logo size={42} /></div>
            <div>
              <h1>{config.nombreNegocio || 'Atelune'}</h1>
              {config.lema && <div className="lema">{config.lema}</div>}
              {config.contacto && <div className="muted">{config.contacto}</div>}
            </div>
          </div>
          <div className="doc-meta">
            <h2>Cotización</h2>
            <div className="numero">{codigo(c.numero)}</div>
            <div className="muted">{fecha(c.fecha)}</div>
          </div>
        </div>

        <div className="doc-cliente">
          <h4>Cliente</h4>
          <div className="nombre">{c.cliente || '—'}</div>
          {c.contactoCliente && <div className="muted">{c.contactoCliente}</div>}
        </div>

        <table>
          <thead><tr><th>Descripción</th><th className="num">Cant.</th><th className="num">Precio unit.</th><th className="num">Importe</th></tr></thead>
          <tbody>
            {c.items.map((it, i) => (
              <tr key={i}>
                <td>{it.descripcion || `Trabajo ${i + 1}`}{k.renglones[i]?.descuento > 0 && <div className="desglose">Incluye descuento de {usd(k.renglones[i].descuento)}</div>}</td>
                <td className="num">{num(it.cantidad)}</td>
                <td className="num">{usd(k.renglones[i]?.precioUnitario)}</td>
                <td className="num">{usd(k.renglones[i]?.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="resumen" style={{ maxWidth: 320, marginLeft: 'auto', marginTop: 12 }}>
          <tbody>
            <tr><td>Subtotal</td><td className="num">{usd(k.subtotal)}</td></tr>
            {k.envio > 0 && <tr><td>Envío</td><td className="num">{usd(k.envio)}</td></tr>}
            {k.comision > 0 && <tr><td>Recargo método de pago</td><td className="num">{usd(k.comision)}</td></tr>}
            {k.iva > 0 && <tr><td>IVA ({num(config.ivaPct)} %)</td><td className="num">{usd(k.iva)}</td></tr>}
            <tr className="total"><td>Total</td><td className="num">{usd(k.total)}</td></tr>
            {k.totalBs != null && <tr><td className="desglose">En Bs (tasa {num(c.tasa, 4)})</td><td className="num desglose">{bs(k.totalBs)}</td></tr>}
          </tbody>
        </table>

        {c.notas && <p style={{ whiteSpace: 'pre-wrap' }}><strong>Notas:</strong> {c.notas}</p>}
        <div className="doc-pie desglose">
          {config.vigenciaDias ? <p>Cotización válida hasta el {fecha(sumarDias(c.fecha, config.vigenciaDias))}.</p> : null}
          {config.condiciones && <p style={{ whiteSpace: 'pre-wrap' }}>{config.condiciones}</p>}
        </div>
      </div>
    </div>
  )
}
