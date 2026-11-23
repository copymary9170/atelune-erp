import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, registrarMovimiento, registrarCompra, TIPOS_PRODUCTO, UNIDADES } from '../db.js'
import { Campo, Modal, Selector, SelectorPago, useConfig } from '../components/ui.jsx'
import { n } from '../lib/calc.js'
import { calcularCompra, centavosFactura, requiereMonedaPago } from '../lib/compras.js'
import { equivalenteBs, monedaMetodoPago } from '../lib/pagos.js'
import { TIPOS_TASA } from '../lib/tasas-multiples.js'
import TasaOperacion from '../components/TasaOperacion.jsx'
import { usd, bs, num, fecha, hoy } from '../lib/format.js'

const opcionesTipo = Object.entries(TIPOS_PRODUCTO).map(([value, label]) => ({ value, label }))
const opcionesUnidad = UNIDADES.map((u) => ({ value: u, label: u }))
const NOMBRE_MOV = { entrada: 'Entrada (compra)', salida: 'Salida (uso/venta)', merma: 'Merma / daño', ajuste: 'Ajuste por conteo' }
const monedas = [{ value: 'USD', label: 'USD' }, { value: 'Bs', label: 'Bs' }]
const importe = (valor, moneda) => moneda === 'Bs' ? bs(valor) : usd(valor)

export const bajoStock = (p) => p.stockMinimo != null && n(p.stock) <= n(p.stockMinimo)

export default function Inventario() {
  const productos = useLiveQuery(() => db.productos.orderBy('nombre').toArray(), [], [])
  const config = useConfig()
  const [buscar, setBuscar] = useState('')
  const [tipo, setTipo] = useState('')
  const [soloBajo, setSoloBajo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [moviendo, setMoviendo] = useState(null)
  const [kardex, setKardex] = useState(null)
  const [comprando, setComprando] = useState(false)

  const lineas = config.lineas || []
  const filtrados = productos.filter(
    (p) =>
      (!buscar || (p.nombre + ' ' + (p.codigo || '')).toLowerCase().includes(buscar.toLowerCase())) &&
      (!tipo || p.tipo === tipo) &&
      (!soloBajo || bajoStock(p)),
  )
  const valorTotal = productos.reduce((s, p) => s + Math.max(0, n(p.stock)) * n(p.costoPromedio), 0)

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Inventario</h1>
          <p>Costo calculado por promedio ponderado. Valor total: <strong>{usd(valorTotal)}</strong></p>
        </div>
        <div className="acciones">
          <button className="sec" onClick={() => setComprando(true)} disabled={!productos.length}>Registrar compra</button>
          <button onClick={() => setEditando({ tipo: 'materia_prima', unidadCompra: 'unidad', unidadUso: 'unidad', factor: 1 })}>+ Nuevo producto</button>
        </div>
      </div>

      <div className="tarjeta">
        <div className="fila">
          <Campo label="Buscar" valor={buscar} onCambio={setBuscar} placeholder="Nombre o código" />
          <Selector label="Tipo" valor={tipo} onCambio={setTipo} opciones={opcionesTipo} vacio="Todos" />
          <div className="campo auto">
            <label>&nbsp;</label>
            <button className={soloBajo ? '' : 'sec'} onClick={() => setSoloBajo(!soloBajo)}>Solo stock bajo</button>
          </div>
        </div>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>Producto</th><th>Tipo</th><th className="num">Stock</th><th className="num">Costo / unidad de uso</th><th className="num">Valor</th><th></th></tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.nombre}</strong>
                    {p.codigo && <span className="muted"> · {p.codigo}</span>}
                    <div className="desglose">{lineas.find((l) => l.id === Number(p.lineaId))?.nombre}</div>
                  </td>
                  <td><span className="etiqueta-tipo">{TIPOS_PRODUCTO[p.tipo]}</span></td>
                  <td className="num">
                    {num(p.stock)} {p.unidadUso}{' '}
                    {bajoStock(p) && <span className="etiqueta-tipo bajo">bajo</span>}
                  </td>
                  <td className="num">{n(p.costoPromedio) ? usd(p.costoPromedio) : <span className="pendiente">sin costo</span>}</td>
                  <td className="num">{usd(Math.max(0, n(p.stock)) * n(p.costoPromedio))}</td>
                  <td className="num">
                    <div className="acciones" style={{ justifyContent: 'flex-end' }}>
                      <button className="mini" onClick={() => setMoviendo({ producto: p, tipo: 'entrada' })}>Movimiento</button>
                      <button className="mini sec" onClick={() => setKardex(p)}>Kardex</button>
                      <button className="mini sec" onClick={() => setEditando(p)}>Editar</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtrados.length && (
                <tr><td colSpan={6} className="vacio">{productos.length ? 'Ningún producto coincide con el filtro.' : 'Aún no hay productos. Crea el primero con «+ Nuevo producto».'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editando && <ProductoForm inicial={editando} lineas={lineas} onCerrar={() => setEditando(null)} />}
      {moviendo && <MovimientoForm {...moviendo} onCerrar={() => setMoviendo(null)} />}
      {comprando && <CompraForm productos={productos} config={config} onCerrar={() => setComprando(false)} />}
      {kardex && <Kardex producto={kardex} onCerrar={() => setKardex(null)} />}
    </>
  )
}

function ProductoForm({ inicial, lineas, onCerrar }) {
  const [p, setP] = useState(inicial)
  const [stockInicial, setStockInicial] = useState(null)
  const [costoInicial, setCostoInicial] = useState(null)
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }))
  const nuevo = !inicial.id

  async function guardar() {
    if (!p.nombre?.trim()) return alert('Escribe el nombre del producto.')
    if (!(n(p.factor) > 0)) return alert('El factor de conversión debe ser mayor que 0.')
    const datos = { ...p, nombre: p.nombre.trim(), factor: n(p.factor), lineaId: p.lineaId ? Number(p.lineaId) : null }
    if (nuevo) {
      const id = await db.productos.add({ ...datos, stock: 0, costoPromedio: 0 })
      if (n(stockInicial) > 0) {
        await registrarMovimiento({
          productoId: id, tipo: 'entrada', cantidad: n(stockInicial),
          costoUnitario: n(costoInicial) / n(stockInicial), referencia: 'Inventario inicial',
        })
      }
    } else {
      const { stock, costoPromedio, ...resto } = datos
      await db.productos.update(p.id, resto)
    }
    onCerrar()
  }

  async function eliminar() {
    const movs = await db.movimientos.where('productoId').equals(p.id).count()
    if (!confirm(`¿Eliminar «${p.nombre}»${movs ? ` y sus ${movs} movimientos` : ''}? No se puede deshacer.`)) return
    await db.transaction('rw', db.productos, db.movimientos, async () => {
      await db.movimientos.where('productoId').equals(p.id).delete()
      await db.productos.delete(p.id)
    })
    onCerrar()
  }

  return (
    <Modal titulo={nuevo ? 'Nuevo producto' : 'Editar producto'} onCerrar={onCerrar}>
      <div className="fila">
        <Campo label="Nombre" valor={p.nombre} onCambio={(v) => set('nombre', v)} autoFocus placeholder="Ej.: Taza blanca 11 oz para sublimar" />
        <Campo className="angosto" label="Código" valor={p.codigo} onCambio={(v) => set('codigo', v)} />
      </div>
      <div className="fila">
        <Selector label="Tipo" valor={p.tipo} onCambio={(v) => set('tipo', v)} opciones={opcionesTipo} />
        <Selector label="Línea de servicio" valor={p.lineaId} onCambio={(v) => set('lineaId', v)} vacio="General"
          opciones={lineas.map((l) => ({ value: l.id, label: l.nombre }))} />
      </div>
      <div className="fila">
        <Selector label="Unidad en que compras" valor={p.unidadCompra} onCambio={(v) => set('unidadCompra', v)} opciones={opcionesUnidad} />
        <Selector label="Unidad en que usas/vendes" valor={p.unidadUso} onCambio={(v) => set('unidadUso', v)} opciones={opcionesUnidad} />
        <Campo label={`${p.unidadUso || 'unidades'} por cada ${p.unidadCompra || 'unidad'}`} tipo="number" valor={p.factor} onCambio={(v) => set('factor', v)} />
      </div>
      <div className="ayuda" style={{ marginTop: -6, marginBottom: 12 }}>
        Ej.: compras vinil por <em>rollo</em> y usas por <em>cm²</em> → escribe cuántos cm² trae el rollo. El stock y el costo se llevan en la unidad de uso.
      </div>
      <div className="fila">
        <Campo label={`Stock mínimo (${p.unidadUso})`} tipo="number" valor={p.stockMinimo} onCambio={(v) => set('stockMinimo', v)} />
        {p.tipo === 'reventa' && <Campo label="Precio de venta ($)" tipo="number" valor={p.precioVenta} onCambio={(v) => set('precioVenta', v)} />}
      </div>
      {nuevo && (
        <div className="subtabla">
          <h4>Inventario inicial (opcional)</h4>
          <div className="fila">
            <Campo label={`Cantidad que tienes hoy (${p.unidadUso})`} tipo="number" valor={stockInicial} onCambio={setStockInicial} />
            <Campo label="Lo que te costó en total ($)" tipo="number" valor={costoInicial} onCambio={setCostoInicial} />
          </div>
        </div>
      )}
      <Campo label="Notas" tipo="textarea" valor={p.notas} onCambio={(v) => set('notas', v)} placeholder="Proveedor habitual, medidas, color…" />
      <div className="modal-pie">
        {!nuevo && <button className="peligro" onClick={eliminar} style={{ marginRight: 'auto' }}>Eliminar</button>}
        <button className="sec" onClick={onCerrar}>Cancelar</button>
        <button onClick={guardar}>Guardar</button>
      </div>
    </Modal>
  )
}

function MovimientoForm({ producto: p, tipo: tipoInicial, onCerrar }) {
  const [tipo, setTipo] = useState(tipoInicial)
  const [unidad, setUnidad] = useState('compra')
  const [cantidad, setCantidad] = useState(null)
  const [costoTotal, setCostoTotal] = useState(null)
  const [f, setF] = useState(hoy())
  const [referencia, setReferencia] = useState('')
  const [nota, setNota] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [pagadoCon, setPagadoCon] = useState('')
  const [tasaMov, setTasaMov] = useState({ tasa: null, tipoTasa: 'bcv_usd', tasaDetalle: null })
  const config = useConfig()
  const proveedores = useLiveQuery(() => db.proveedores.orderBy('nombre').toArray(), [], [])
  const factor = n(p.factor) || 1
  const cantUso = tipo === 'entrada' && unidad === 'compra' ? n(cantidad) * factor : n(cantidad)

  async function guardar() {
    if (tipo !== 'ajuste' && !(cantUso > 0)) return alert('Escribe una cantidad mayor que 0.')
    if (tipo === 'ajuste' && (cantidad == null || cantidad < 0)) return alert('Escribe el stock contado.')
    if (tipo === 'entrada' && costoTotal == null) return alert('Escribe cuánto pagaste en total.')
    try {
      await registrarMovimiento({
        productoId: p.id, tipo, cantidad: cantUso,
        costoUnitario: tipo === 'entrada' ? n(costoTotal) / cantUso : undefined,
        fecha: f, referencia, nota,
        proveedorId: tipo === 'entrada' && proveedorId ? Number(proveedorId) : null,
        pagadoCon: tipo === 'entrada' ? pagadoCon || null : null,
        tasa: tipo === 'entrada' ? tasaMov.tasa : null,
        tasaDetalle: tipo === 'entrada' ? tasaMov.tasaDetalle : null,
      })
      onCerrar()
    } catch (error) {
      alert(error.message)
    }
  }

  return (
    <Modal titulo={`Movimiento · ${p.nombre}`} onCerrar={onCerrar}>
      <p className="muted">Stock actual: {num(p.stock)} {p.unidadUso} · Costo promedio: {usd(p.costoPromedio)} por {p.unidadUso}</p>
      <div className="fila">
        <Selector label="Tipo" valor={tipo} onCambio={setTipo} opciones={Object.entries(NOMBRE_MOV).map(([value, label]) => ({ value, label }))} />
        <Campo label="Fecha" tipo="date" valor={f} onCambio={setF} />
      </div>
      <div className="fila">
        <Campo label={tipo === 'ajuste' ? `Stock contado (${p.unidadUso})` : 'Cantidad'} tipo="number" valor={cantidad} onCambio={setCantidad} autoFocus />
        {tipo === 'entrada' && factor !== 1 && (
          <Selector label="En" valor={unidad} onCambio={setUnidad}
            opciones={[{ value: 'compra', label: p.unidadCompra }, { value: 'uso', label: p.unidadUso }]} />
        )}
        {tipo === 'entrada' && <Campo label="Costo total pagado ($)" tipo="number" valor={costoTotal} onCambio={setCostoTotal} />}
      </div>
      {tipo === 'entrada' && cantUso > 0 && costoTotal != null && (
        <p className="ayuda">= {num(cantUso)} {p.unidadUso} a {usd(n(costoTotal) / cantUso)} c/u</p>
      )}
      {tipo === 'entrada' && (
        <Selector label="Proveedor" valor={proveedorId} onCambio={setProveedorId} vacio={proveedores.length ? 'Sin proveedor' : 'Aún no hay proveedores registrados'}
          opciones={proveedores.map((x) => ({ value: x.id, label: x.nombre }))} />
      )}
      {tipo === 'entrada' && <SelectorPago valor={pagadoCon} onCambio={setPagadoCon} metodos={config.metodosPago || []} />}
      {tipo === 'entrada' && <TasaOperacion valor={tasaMov} fecha={f} montoUsd={costoTotal}
        opcional={monedaMetodoPago(pagadoCon) !== 'Bs'}
        onCambio={cambios => setTasaMov(actual => ({ ...actual, ...cambios }))} />}
      <Campo label="Referencia" valor={referencia} onCambio={setReferencia} placeholder="N.º de factura, nota de entrega…" />
      <Campo label="Nota" valor={nota} onCambio={setNota} />
      <div className="modal-pie">
        <button className="sec" onClick={onCerrar}>Cancelar</button>
        <button onClick={guardar}>Registrar</button>
      </div>
    </Modal>
  )
}

function Kardex({ producto: p, onCerrar }) {
  const movs = useLiveQuery(() => db.movimientos.where('productoId').equals(p.id).reverse().sortBy('fecha'), [p.id], [])
  return (
    <Modal titulo={`Kardex · ${p.nombre}`} onCerrar={onCerrar} ancho>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Tipo</th><th className="num">Cantidad</th><th className="num">Costo unit.</th><th className="num">Stock</th><th className="num">Costo prom.</th><th>Referencia</th></tr>
          </thead>
          <tbody>
            {movs.map((m) => (
              <tr key={m.id}>
                <td>{fecha(m.fecha)}</td>
                <td>{NOMBRE_MOV[m.tipo]}</td>
                <td className="num">{m.tipo === 'entrada' ? '+' : m.tipo === 'ajuste' ? '=' : '−'}{num(m.cantidad)}</td>
                <td className="num">{usd(m.costoUnitario)}</td>
                <td className="num">{num(m.stockResultante)}</td>
                <td className="num">{usd(m.costoPromedioResultante)}</td>
                <td>{m.referencia}{m.nota && <div className="desglose">{m.nota}</div>}
                  {m.compra && <div className="desglose">
                    Factura: {importe(m.compra.totalFactura, m.compra.monedaFactura)}
                    {m.compra.delivery > 0 && ' · Incluye ' + importe(m.compra.delivery, m.compra.monedaFactura) + ' de delivery'}
                    {m.compra.monedaPago && <div>Pago: {importe(m.compra.importePago, m.compra.monedaPago)} · {m.pagadoCon}</div>}
                  </div>}
                  {m.tipo === 'entrada' && m.tasa > 0 && <div className="desglose">
                    {bs(m.montoBs ?? equivalenteBs(m.cantidad * m.costoUnitario, m.tasa))} · {num(m.tasa, 4)} Bs/USD
                    {m.compra && m.tasaDetalle && (
                      <> · {m.tasaDetalle.fuenteExterna || m.tasaDetalle.fuente || TIPOS_TASA[m.tasaDetalle.tipo]?.nombre || 'Captura manual'}
                        {m.tasaDetalle.fecha && ' · ref. ' + fecha(m.tasaDetalle.fecha)}</>
                    )}
                  </div>}
                </td>
              </tr>
            ))}
            {!movs.length && <tr><td colSpan={7} className="vacio">Sin movimientos.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="modal-pie"><button onClick={onCerrar}>Cerrar</button></div>
    </Modal>
  )
}

// Compra de varios materiales con delivery repartido entre ellos.
function CompraForm({ productos, config, onCerrar }) {
  const proveedores = useLiveQuery(() => db.proveedores.orderBy('nombre').toArray(), [], [])
  const [c, setC] = useState({ fecha: hoy(), proveedorId: '', pagadoCon: '', referencia: '', delivery: null,
    reparto: 'costo', monedaFactura: 'USD', monedaPago: '', tasa: null, tipoTasa: 'bcv_usd', tasaDetalle: null })
  const [lineas, setLineas] = useState([{ productoId: '', cantidad: null, unidad: 'compra', costo: null }])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => {
    setError('')
    setC(x => k === 'pagadoCon' ? { ...x, pagadoCon: v, monedaPago: '' } : { ...x, [k]: v })
  }
  const setLinea = (i, k, v) => {
    setError('')
    setLineas(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l))
  }
  const prod = (l) => productos.find((p) => p.id === Number(l.productoId))
  const cantUso = (l) => { const p = prod(l); return p ? n(l.cantidad) * (l.unidad === 'compra' ? n(p.factor) || 1 : 1) : 0 }
  const monedaPagoFija = monedaMetodoPago(c.pagadoCon)
  const requiereTasa = c.monedaFactura === 'Bs' || (monedaPagoFija || c.monedaPago) === 'Bs'
  let calculo, errorCalculo
  try {
    calculo = calcularCompra({ ...c, importes: lineas.map(l => l.costo) })
  } catch (e) {
    errorCalculo = e.message
  }

  async function guardar() {
    if (lineas.some(l => !prod(l))) return setError('Elige el producto de cada renglón.')
    if (lineas.some(l => !(cantUso(l) > 0))) return setError('Escribe una cantidad mayor que cero por renglón.')
    if (new Set(lineas.map(l => Number(l.productoId))).size !== lineas.length)
      return setError('Hay un producto repetido. Agrúpalo en un solo renglón.')
    if (!calculo) return setError(errorCalculo)
    setGuardando(true)
    try {
      await registrarCompra({
        ...c,
        proveedorId: c.proveedorId ? Number(c.proveedorId) : null,
        pagadoCon: c.pagadoCon || null,
        lineas: lineas.map(l => ({ productoId: Number(l.productoId), cantidadUso: cantUso(l), importeFactura: l.costo })),
      })
      onCerrar()
    } catch (error) {
      setError(error.message)
      setGuardando(false)
    }
  }

  return (
    <Modal titulo="Registrar compra" onCerrar={() => { if (!guardando) onCerrar() }} ancho>
      <div className="fila">
        <Campo className="auto" label="Fecha" tipo="date" valor={c.fecha} onCambio={(v) => set('fecha', v)} />
        <Selector label="Proveedor" valor={c.proveedorId} onCambio={(v) => set('proveedorId', v)} vacio="Sin proveedor"
          opciones={proveedores.map((x) => ({ value: x.id, label: x.nombre }))} />
        <Campo label="Referencia" valor={c.referencia} onCambio={(v) => set('referencia', v)} placeholder="N.º de factura…" />
        <Selector label="Moneda de la factura" valor={c.monedaFactura} onCambio={v => set('monedaFactura', v)} opciones={monedas} />
      </div>
      <div className="subtabla">
        <h4>Materiales comprados</h4>
        {lineas.map((l, i) => {
          const p = prod(l)
          return (
            <div className="fila" key={i}>
              <Selector label="Producto" valor={l.productoId} onCambio={(v) => setLinea(i, 'productoId', v)} vacio="Elegir…"
                opciones={productos.map((x) => ({ value: x.id, label: x.nombre }))} />
              <Campo className="angosto" label="Cantidad" tipo="number" valor={l.cantidad} onCambio={(v) => setLinea(i, 'cantidad', v)} />
              <Selector className="angosto" label="Unidad" valor={l.unidad} onCambio={(v) => setLinea(i, 'unidad', v)}
                opciones={p && (n(p.factor) || 1) !== 1 ? [{ value: 'compra', label: p.unidadCompra }, { value: 'uso', label: p.unidadUso }] : [{ value: 'compra', label: p?.unidadUso ?? '—' }]} />
              <Campo className="angosto" label={`Importe (${c.monedaFactura})`} inputMode="decimal"
                valor={l.costo} onCambio={(v) => setLinea(i, 'costo', v)} />
              <div className="campo auto desglose" style={{ width: 150, textAlign: 'right' }}>
                {calculo && p && cantUso(l) > 0 && (
                  <><strong>{usd(calculo.lineas[i].costoTotalUsd)}</strong> costo en USD<br />
                    ${num(calculo.lineas[i].costoTotalUsd / cantUso(l), 4)} por {p.unidadUso}
                    {calculo.lineas[i].delivery > 0 && <><br />Incluye {importe(calculo.lineas[i].delivery, c.monedaFactura)} de delivery</>}
                  </>
                )}
              </div>
              <div className="campo auto"><button className="peligro mini" aria-label={`Quitar material ${i + 1}`}
                disabled={lineas.length === 1} onClick={() => { setError(''); setLineas(lineas.filter((_, j) => j !== i)) }}>×</button></div>
            </div>
          )
        })}
        <button className="sec mini" onClick={() => setLineas([...lineas, { productoId: '', cantidad: null, unidad: 'compra', costo: null }])}>+ Material</button>
      </div>
      <div className="fila">
        <Campo label={`Delivery (${c.monedaFactura})`} inputMode="decimal" valor={c.delivery} onCambio={(v) => set('delivery', v)} />
        {centavosFactura(c.delivery) > 0 && lineas.length > 1 && <Selector label="Repartir el delivery" valor={c.reparto} onCambio={v => set('reparto', v)}
          opciones={[{ value: 'costo', label: 'Según el importe de cada material' }, { value: 'igual', label: 'En partes iguales' }]} />}
        <SelectorPago valor={c.pagadoCon} onCambio={(v) => set('pagadoCon', v)} metodos={config.metodosPago || []} />
        {requiereMonedaPago(c.pagadoCon) && <Selector label="Moneda del pago" valor={c.monedaPago} vacio="Elige USD o Bs"
          onCambio={v => set('monedaPago', v)} opciones={monedas} />}
        {monedaPagoFija && <p className="ayuda">Moneda del pago: <strong>{monedaPagoFija}</strong></p>}
      </div>
      <TasaOperacion valor={c} fecha={c.fecha} opcional={!requiereTasa}
        onCambio={cambios => { setError(''); setC(actual => ({ ...actual, ...cambios })) }} />
      {calculo && <div aria-live="polite">
        <p>Total de la factura: <strong>{importe(calculo.totalFactura, c.monedaFactura)}</strong></p>
        {c.monedaFactura === 'Bs' && <p>Equivalente en USD: <strong>{usd(calculo.totalUsd)}</strong></p>}
        {calculo.monedaPago && calculo.monedaPago !== c.monedaFactura && (
          <p>Importe del pago: <strong>{calculo.monedaPago === 'Bs' ? bs(calculo.totalBs) : usd(calculo.totalUsd)}</strong></p>
        )}
      </div>}
      {error && <p className="pendiente" role="alert">{error}</p>}
      <div className="modal-pie">
        <button className="sec" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button onClick={guardar} disabled={guardando}>Registrar compra</button>
      </div>
    </Modal>
  )
}
