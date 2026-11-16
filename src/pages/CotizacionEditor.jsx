import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, tasaVigente } from '../db.js'
import { Avisos, Campo, Selector } from '../components/ui.jsx'
import ItemEditor, { itemVacio } from '../components/ItemEditor.jsx'
import { useDatosCalculo } from './Plantillas.jsx'
import { ESTADOS, codigo } from './Cotizaciones.jsx'
import { calcularCotizacion, avisosCotizacion } from '../lib/calc.js'
import { usd, bs, pct, num } from '../lib/format.js'

// Guarda una copia de los números para la lista y el documento impreso.
export function resumenCalculo(r) {
  return {
    total: r.total, totalBs: r.totalBs, subtotal: r.subtotal, envio: r.envio, comision: r.comision, iva: r.iva,
    costoTotal: r.costoTotal, ganancia: r.ganancia, margenReal: r.margenReal,
    renglones: r.renglones.map((x) => ({ precio: x.precio, precioUnitario: x.precioUnitario, descuento: x.descuento })),
  }
}

export default function CotizacionEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const guardada = useLiveQuery(() => db.cotizaciones.get(Number(id)).then((x) => x ?? null), [id])
  const plantillas = useLiveQuery(() => db.plantillas.orderBy('nombre').toArray(), [], [])
  const datos = useDatosCalculo()
  const [c, setC] = useState(null)
  const [abierto, setAbierto] = useState(0)
  const [aviso, setAviso] = useState('')

  useEffect(() => { if (guardada && !c) setC(guardada) }, [guardada, c])

  const r = useMemo(() => (c ? calcularCotizacion(c, datos) : null), [c, datos])
  const avisos = useMemo(() => (c ? avisosCotizacion(c, datos) : []), [c, datos])

  if (guardada === undefined && !c) return <p className="muted">Cargando…</p>
  if (!c) return <p>No se encontró la cotización.</p>

  const set = (k, v) => setC((x) => ({ ...x, [k]: v }))
  const setItem = (i, it) => set('items', c.items.map((x, j) => (j === i ? it : x)))
  const metodos = datos.config.metodosPago || []

  function agregar(plantillaId) {
    const p = plantillas.find((x) => x.id === Number(plantillaId))
    const base = itemVacio()
    const nuevo = p ? { ...base, ...structuredClone(p), id: undefined, nombre: undefined, cantidad: 1 } : base
    set('items', [...c.items, nuevo])
    setAbierto(c.items.length)
  }

  async function guardar(siguiente) {
    await db.cotizaciones.put({ ...c, calculo: resumenCalculo(r) })
    setAviso('Guardada ✓')
    setTimeout(() => setAviso(''), 2000)
    if (siguiente) navigate(siguiente)
  }

  async function usarTasaDelDia() {
    const t = await tasaVigente()
    if (!t) return alert('No hay tasas cargadas. Ve a «Tasa de cambio».')
    set('tasa', t.tasa)
  }

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{codigo(c.numero)}</h1>
          <p>Los cálculos usan los costos actuales de tu inventario y tus máquinas.</p>
        </div>
        <div className="acciones">
          {aviso && <span className="etiqueta-tipo ok">{aviso}</span>}
          <button className="sec" onClick={() => navigate('/cotizaciones')}>Volver</button>
          <button className="sec" onClick={() => guardar(`/cotizaciones/${c.id}/imprimir`)} disabled={!c.items.length}>Ver / imprimir PDF</button>
          <button onClick={() => guardar()}>Guardar</button>
        </div>
      </div>

      <div className="tarjeta">
        <div className="fila">
          <Campo label="Cliente" valor={c.cliente} onCambio={(v) => set('cliente', v)} />
          <Campo label="Contacto del cliente" valor={c.contactoCliente} onCambio={(v) => set('contactoCliente', v)} />
          <Campo className="auto" label="Fecha" tipo="date" valor={c.fecha} onCambio={(v) => set('fecha', v)} />
          <Selector className="auto" label="Estado" valor={c.estado} onCambio={(v) => set('estado', v)}
            opciones={Object.entries(ESTADOS).map(([value, label]) => ({ value, label }))} />
        </div>
      </div>

      <Avisos lista={avisos} titulo="Para que el precio sea exacto, completa:" />

      {c.items.map((it, i) => {
        const rr = r.renglones[i]
        return (
          <div className="tarjeta" key={i}>
            <div className="encabezado" style={{ marginBottom: abierto === i ? 14 : 0 }}>
              <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => setAbierto(abierto === i ? -1 : i)}>
                <h3 style={{ marginBottom: 2 }}>{abierto === i ? '▾' : '▸'} {it.descripcion || `Trabajo ${i + 1}`}</h3>
                <span className="desglose">
                  {num(it.cantidad)} × {usd(rr.precioUnitario)} = <strong>{usd(rr.precio)}</strong> · costo {usd(rr.costo)} · margen {num(rr.margenPct, 1)} %
                </span>
              </div>
              <button className="peligro mini" onClick={() => { if (confirm('¿Quitar este trabajo?')) set('items', c.items.filter((_, j) => j !== i)) }}>Quitar</button>
            </div>
            {abierto === i && (
              <>
                <ItemEditor item={it} onCambio={(v) => setItem(i, v)} {...datos} esCotizacion />
                <table className="resumen desglose" style={{ maxWidth: 520 }}>
                  <tbody>
                    <tr><td>Materiales (incluye merma {usd(rr.merma)})</td><td className="num">{usd(rr.materiales)}</td></tr>
                    <tr><td>Uso de máquinas</td><td className="num">{usd(rr.maquinas)}</td></tr>
                    <tr><td>Mano de obra (diseño + producción)</td><td className="num">{usd(rr.manoObra)}</td></tr>
                    <tr><td>Otros costos</td><td className="num">{usd(rr.extras)}</td></tr>
                    <tr><td>Parte de costos fijos</td><td className="num">{usd(rr.fijos)}</td></tr>
                    <tr><td><strong>Costo total</strong></td><td className="num"><strong>{usd(rr.costo)}</strong></td></tr>
                    <tr><td>Precio con margen</td><td className="num">{usd(rr.precioLista)}</td></tr>
                    {rr.descuento > 0 && <tr><td>Descuento</td><td className="num">−{usd(rr.descuento)}</td></tr>}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )
      })}

      <div className="tarjeta">
        <div className="fila">
          <Selector valor="" onCambio={(v) => v && agregar(v)} vacio={plantillas.length ? '+ Agregar desde plantilla…' : 'No hay plantillas aún'}
            opciones={plantillas.map((p) => ({ value: p.id, label: p.descripcion }))} />
          <div className="campo auto"><button className="sec" onClick={() => agregar()}>+ Trabajo en blanco</button></div>
        </div>
      </div>

      <div className="grid g2">
        <div className="tarjeta">
          <h2>Condiciones</h2>
          <div className="fila">
            <Campo label="Envío / delivery ($)" tipo="number" valor={c.envio} onCambio={(v) => set('envio', v)} />
            <Selector label="Método de pago" valor={c.metodoPagoIdx} onCambio={(v) => set('metodoPagoIdx', Number(v))}
              opciones={metodos.map((m, i) => ({ value: i, label: m.nombre + (m.comisionPct ? ` (+${m.comisionPct} %)` : '') }))} />
          </div>
          <div className="fila">
            <Campo label="Tasa Bs/$ de esta cotización" tipo="number" valor={c.tasa} onCambio={(v) => set('tasa', v)} />
            <div className="campo auto"><button className="sec" onClick={usarTasaDelDia}>Usar la del día</button></div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--texto)' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!c.aplicarIva} onChange={(e) => set('aplicarIva', e.target.checked)} />
            Aplicar IVA {datos.config.ivaPct != null ? `(${datos.config.ivaPct} %)` : <span className="pendiente">(falta el % en Configuración)</span>}
          </label>
          <Campo label="Notas para el cliente" tipo="textarea" valor={c.notas} onCambio={(v) => set('notas', v)} />
        </div>

        <div className="tarjeta">
          <h2>Resultado</h2>
          <table className="resumen">
            <tbody>
              <tr><td>Subtotal trabajos</td><td className="num">{usd(r.subtotal)}</td></tr>
              {r.envio > 0 && <tr><td>Envío</td><td className="num">{usd(r.envio)}</td></tr>}
              {r.comision > 0 && <tr><td>Comisión método de pago</td><td className="num">{usd(r.comision)}</td></tr>}
              {r.iva > 0 && <tr><td>IVA</td><td className="num">{usd(r.iva)}</td></tr>}
              <tr className="total"><td>Total</td><td className="num">{usd(r.total)}</td></tr>
              <tr><td>Total en bolívares</td><td className="num">{r.totalBs != null ? bs(r.totalBs) : <span className="pendiente">falta tasa</span>}</td></tr>
            </tbody>
          </table>
          <hr style={{ border: 0, borderTop: '1px solid var(--linea)', margin: '14px 0' }} />
          <table className="resumen desglose">
            <tbody>
              <tr><td>Costo total (incluye {usd(r.fijos)} de costos fijos)</td><td className="num">{usd(r.costoTotal)}</td></tr>
              <tr><td><strong>Ganancia</strong></td><td className="num"><strong>{usd(r.ganancia)}</strong></td></tr>
              <tr><td>Margen real</td><td className="num">{pct(r.margenReal)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="acciones">
        <button className="peligro" onClick={async () => {
          if (confirm(`¿Eliminar ${codigo(c.numero)}?`)) { await db.cotizaciones.delete(c.id); navigate('/cotizaciones') }
        }}>Eliminar cotización</button>
      </div>
    </>
  )
}
