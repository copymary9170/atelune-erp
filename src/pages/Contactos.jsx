import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, codigoPedido, ESTADOS_PEDIDO } from '../db.js'
import { Campo, Modal } from '../components/ui.jsx'
import { codigo, ESTADOS } from './Cotizaciones.jsx'
import { saldoPedido, n } from '../lib/calc.js'
import { usd, fecha, num } from '../lib/format.js'

// Una sola pantalla para clientes y proveedores; cambia la tabla y los textos.
const TIPOS = {
  clientes: {
    titulo: 'Clientes',
    singular: 'cliente',
    descripcion: 'Historial de cotizaciones, pedidos y lo que te deben.',
    campos: [
      ['nombre', 'Nombre o empresa'],
      ['telefono', 'Teléfono / WhatsApp'],
      ['instagram', 'Instagram / TikTok'],
      ['email', 'Correo'],
      ['direccion', 'Dirección o zona de entrega'],
    ],
  },
  proveedores: {
    titulo: 'Proveedores',
    singular: 'proveedor',
    descripcion: 'A quién le compras y cuánto le has comprado.',
    campos: [
      ['nombre', 'Nombre o empresa'],
      ['rif', 'RIF'],
      ['telefono', 'Teléfono / WhatsApp'],
      ['instagram', 'Instagram / web'],
      ['email', 'Correo'],
      ['direccion', 'Dirección'],
      ['productos', 'Qué le compras'],
    ],
  },
}

export default function Contactos({ tipo }) {
  const t = TIPOS[tipo]
  const lista = useLiveQuery(() => db[tipo].orderBy('nombre').toArray(), [tipo], [])
  const pedidos = useLiveQuery(() => db.pedidos.toArray(), [], [])
  const compras = useLiveQuery(() => db.movimientos.where('tipo').equals('entrada').toArray(), [], [])
  const [buscar, setBuscar] = useState('')
  const [editando, setEditando] = useState(null)
  const [viendo, setViendo] = useState(null)

  const filtrada = lista.filter((x) => !buscar || JSON.stringify(x).toLowerCase().includes(buscar.toLowerCase()))
  const resumen = (x) => {
    if (tipo === 'clientes') {
      const ps = pedidos.filter((p) => p.clienteId === x.id && p.estado !== 'cancelado')
      return { a: ps.length, b: ps.reduce((s, p) => s + n(p.total), 0), c: ps.reduce((s, p) => s + Math.max(0, saldoPedido(p)), 0) }
    }
    const cs = compras.filter((m) => m.proveedorId === x.id)
    return { a: cs.length, b: cs.reduce((s, m) => s + n(m.cantidad) * n(m.costoUnitario), 0) }
  }

  return (
    <>
      <div className="encabezado">
        <div><h1>{t.titulo}</h1><p>{t.descripcion}</p></div>
        <button onClick={() => setEditando({})}>+ Nuevo {t.singular}</button>
      </div>
      <div className="tarjeta">
        <Campo label="Buscar" valor={buscar} onCambio={setBuscar} placeholder="Nombre, teléfono, Instagram…" />
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Nombre</th><th>Contacto</th>
                {tipo === 'clientes'
                  ? <><th className="num">Pedidos</th><th className="num">Comprado</th><th className="num">Te debe</th></>
                  : <><th className="num">Compras</th><th className="num">Total comprado</th></>}
              </tr>
            </thead>
            <tbody>
              {filtrada.map((x) => {
                const r = resumen(x)
                return (
                  <tr key={x.id} className="clic" onClick={() => setViendo(x)}>
                    <td><strong>{x.nombre}</strong></td>
                    <td>{[x.telefono, x.instagram].filter(Boolean).join(' · ')}</td>
                    <td className="num">{r.a}</td>
                    <td className="num">{usd(r.b)}</td>
                    {tipo === 'clientes' && <td className="num">{r.c > 0 ? <strong style={{ color: 'var(--alerta)' }}>{usd(r.c)}</strong> : usd(0)}</td>}
                  </tr>
                )
              })}
              {!filtrada.length && <tr><td colSpan={5} className="vacio">{lista.length ? 'Nada coincide con la búsqueda.' : `Aún no hay ${t.titulo.toLowerCase()}.`}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {editando && <ContactoForm tipo={tipo} inicial={editando} onCerrar={() => setEditando(null)} />}
      {viendo && <Ficha tipo={tipo} contacto={viendo} pedidos={pedidos} compras={compras}
        onEditar={() => { setEditando(viendo); setViendo(null) }} onCerrar={() => setViendo(null)} />}
    </>
  )
}

function ContactoForm({ tipo, inicial, onCerrar }) {
  const t = TIPOS[tipo]
  const [x, setX] = useState(inicial)
  const nuevo = !inicial.id
  async function guardar() {
    if (!x.nombre?.trim()) return alert('Escribe el nombre.')
    await db[tipo].put({ ...x, nombre: x.nombre.trim() })
    onCerrar()
  }
  return (
    <Modal titulo={(nuevo ? 'Nuevo ' : 'Editar ') + t.singular} onCerrar={onCerrar}>
      {t.campos.map(([k, label], i) => (
        <Campo key={k} label={label} valor={x[k]} onCambio={(v) => setX({ ...x, [k]: v })} autoFocus={i === 0} />
      ))}
      <Campo label="Notas" tipo="textarea" valor={x.notas} onCambio={(v) => setX({ ...x, notas: v })} />
      <div className="modal-pie">
        {!nuevo && (
          <button className="peligro" style={{ marginRight: 'auto' }}
            onClick={async () => { if (confirm(`¿Eliminar a «${x.nombre}»? Sus pedidos y compras se conservan.`)) { await db[tipo].delete(x.id); onCerrar() } }}>
            Eliminar
          </button>
        )}
        <button className="sec" onClick={onCerrar}>Cancelar</button>
        <button onClick={guardar}>Guardar</button>
      </div>
    </Modal>
  )
}

function Ficha({ tipo, contacto: x, pedidos, compras, onEditar, onCerrar }) {
  const t = TIPOS[tipo]
  const cots = useLiveQuery(() => db.cotizaciones.filter((c) => c.clienteId === x.id).toArray(), [x.id], [])
  const productos = useLiveQuery(() => db.productos.toArray(), [], [])
  const ps = pedidos.filter((p) => p.clienteId === x.id)
  const cs = compras.filter((m) => m.proveedorId === x.id).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))

  return (
    <Modal titulo={x.nombre} onCerrar={onCerrar} ancho>
      <div className="grid g2">
        <div>{t.campos.slice(1).map(([k, label]) => x[k] ? <div key={k}><span className="muted">{label}:</span> {x[k]}</div> : null)}</div>
        <div style={{ whiteSpace: 'pre-wrap' }} className="muted">{x.notas}</div>
      </div>
      {tipo === 'clientes' ? (
        <>
          <h3 style={{ marginTop: 18 }}>Pedidos</h3>
          <table><tbody>
            {ps.map((p) => (
              <tr key={p.id}>
                <td><Link to={'/pedidos/' + p.id} onClick={onCerrar}>{codigoPedido(p.numero)}</Link></td>
                <td>{fecha(p.fecha)}</td><td><span className="etiqueta-tipo">{ESTADOS_PEDIDO[p.estado]}</span></td>
                <td className="num">{usd(p.total)}</td>
                <td className="num">{saldoPedido(p) > 0.005 ? <span className="pendiente">debe {usd(saldoPedido(p))}</span> : <span className="etiqueta-tipo ok">pagado</span>}</td>
              </tr>
            ))}
            {!ps.length && <tr><td className="vacio">Sin pedidos.</td></tr>}
          </tbody></table>
          <h3 style={{ marginTop: 18 }}>Cotizaciones</h3>
          <table><tbody>
            {cots.map((c) => (
              <tr key={c.id}>
                <td><Link to={'/cotizaciones/' + c.id} onClick={onCerrar}>{codigo(c.numero)}</Link></td>
                <td>{fecha(c.fecha)}</td><td><span className="etiqueta-tipo">{ESTADOS[c.estado]}</span></td>
                <td className="num">{usd(c.calculo?.total)}</td>
              </tr>
            ))}
            {!cots.length && <tr><td className="vacio">Sin cotizaciones.</td></tr>}
          </tbody></table>
        </>
      ) : (
        <>
          <h3 style={{ marginTop: 18 }}>Compras registradas</h3>
          <table><tbody>
            {cs.map((m) => {
              const p = productos.find((y) => y.id === m.productoId)
              return (
                <tr key={m.id}>
                  <td>{fecha(m.fecha)}</td><td>{p?.nombre ?? '—'}</td>
                  <td className="num">{num(m.cantidad)} {p?.unidadUso}</td>
                  <td className="num">{usd(n(m.cantidad) * n(m.costoUnitario))}</td>
                  <td className="desglose">{m.referencia}</td>
                </tr>
              )
            })}
            {!cs.length && <tr><td className="vacio">Las compras aparecen aquí cuando registras una entrada de inventario y eliges este proveedor.</td></tr>}
          </tbody></table>
        </>
      )}
      <div className="modal-pie"><button className="sec" onClick={onEditar}>Editar</button><button onClick={onCerrar}>Cerrar</button></div>
    </Modal>
  )
}
