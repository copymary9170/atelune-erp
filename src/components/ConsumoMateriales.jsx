import { useState } from 'react'
import { db } from '../db.js'
import { validarConsumo, resumenMateriales } from '../lib/merma.js'
import { usd } from '../lib/format.js'
const nuevo = { productoId:'', usado:'', desperdicio:'0', nota:'' }
export default function ConsumoMateriales({ pedido, productos }) {
  const [formularios, setFormularios] = useState({})
  const [ocupado, setOcupado] = useState(false)
  const bloqueado = ocupado || ['cancelado','entregado'].includes(pedido.estado)
  const resumen = resumenMateriales(pedido, productos)
  async function cambiar(indice, operacion) {
    setOcupado(true)
    try {
      await db.transaction('rw', db.pedidos, async () => {
        const actual = await db.pedidos.get(pedido.id)
        if (!actual || ['entregado','cancelado'].includes(actual.estado)) throw new Error('El pedido ya está cerrado')
        const clave = String(indice)
        const mapa = { ...(actual.consumosReales || {}) }
        mapa[clave] = operacion(mapa[clave] || [])
        await db.pedidos.update(pedido.id, { consumosReales: mapa })
      })
    } catch(e) { alert(e.message) }
    finally { setOcupado(false) }
  }
  async function agregar(indice) {
    const f = formularios[indice] || nuevo
    // La validación se ejecuta dentro de la transacción sobre los productos disponibles.
    await cambiar(indice, actuales => [...actuales, { ...validarConsumo(f, productos), id:globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, fecha:new Date().toISOString() }])
  }
  function quitar(indice, id) {
    if (!confirm('¿Eliminar este registro de consumo? No se alterará el inventario.')) return
    cambiar(indice, registros => registros.filter(r => r.id !== id))
  }
  return <section className="tarjeta">
    <h2>Materiales utilizados y merma real</h2>
    <p className="muted">Anota el material útil empleado y el material desperdiciado. El costo unitario queda guardado como referencia del momento de registro. Esta sección NO descuenta existencias ni sustituye el consumo automático al cambiar el estado del pedido.</p>
    <div className="fila"><span className="etiqueta-tipo neutro">Registros: {resumen.registrosTotales}</span><span className="etiqueta-tipo proceso">Costo observado conocido: {usd(resumen.valorConocido)}</span>{resumen.costoIncompleto > 0 && <span className="etiqueta-tipo bajo">{resumen.costoIncompleto} registro(s) sin costo verificable</span>}</div>
    {(pedido.items || []).map((it, indice) => {
      const registros = pedido.consumosReales?.[String(indice)] || []
      const f = formularios[indice] || nuevo
      const set = (k,v) => setFormularios(old => ({ ...old, [indice]: { ...(old[indice] || nuevo), [k]:v } }))
      const lineas = resumen.lineas.filter(l => l.trabajo === indice)
      return <div key={indice} className="flujo-item">
        <div className="flujo-cabecera"><strong>{indice+1}. {it.descripcion || `Trabajo ${indice+1}`}</strong><small>{registros.length} anotaciones</small></div>
        {lineas.length > 0 && <div className="tabla-scroll"><table><thead><tr><th>Material</th><th className="num">Útil</th><th className="num">Merma</th><th className="num">Total</th><th className="num">Previsto sin merma</th><th className="num">Diferencia</th><th>Costo observado</th></tr></thead><tbody>
          {lineas.map(l => <tr key={l.productoId}><td>{l.nombre} <small>({l.unidad})</small></td><td className="num">{l.util}</td><td className="num">{l.merma}</td><td className="num">{l.total}</td><td className="num">{l.previsto == null ? 'Sin dato' : l.previsto}</td><td className="num">{l.diferencia == null ? '—' : l.diferencia}</td><td>{l.sinCosto ? 'Incompleto' : usd(l.costo)}</td></tr>)}
        </tbody></table></div>}
        {registros.map(r => <div key={r.id} className="fila" style={{marginTop:6}}><span className="desglose">{r.nombreMaterial}: útil {r.usado} + merma {r.desperdicio} {r.unidad} · {new Date(r.fecha).toLocaleDateString('es-VE')}{r.nota ? ` · ${r.nota}` : ''}</span>{!bloqueado && <button type="button" className="peligro mini" onClick={()=>quitar(indice,r.id)} disabled={ocupado}>Eliminar</button>}</div>)}
        {!bloqueado && <div className="tiempo-formulario">
          <label className="campo">Material<select value={f.productoId} onChange={e=>set('productoId',e.target.value)}><option value="">Seleccionar…</option>{productos.map(p=><option key={p.id} value={p.id}>{p.nombre} ({p.unidadUso || 'unidad'})</option>)}</select></label>
          <label className="campo">Cantidad útil<input type="number" min="0" step="any" value={f.usado} onChange={e=>set('usado',e.target.value)} placeholder="Ej. 2" /></label>
          <label className="campo">Merma (0 si no hubo)<input type="number" min="0" step="any" value={f.desperdicio} onChange={e=>set('desperdicio',e.target.value)}/></label>
          <label className="campo">Nota<input value={f.nota} maxLength={500} onChange={e=>set('nota',e.target.value)} placeholder="Hoja mal impresa, recorte, prueba…"/></label>
          <button type="button" disabled={ocupado} onClick={()=>agregar(indice)}>+ Registrar material</button>
        </div>}
      </div>
    })}
    <p className="ayuda">La diferencia compara el total observado (útil + merma) con el material previsto sin merma. No equivale a una pérdida monetaria real ni verifica por sí sola que se haya registrado todo el consumo.</p>
  </section>
}
