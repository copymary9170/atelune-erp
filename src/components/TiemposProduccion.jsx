import { useState } from 'react'
import { db } from '../db.js'
import { ETAPAS } from '../lib/produccion.js'
import { resumenTiempos, tiempoLegible, validarTiempo } from '../lib/tiempos.js'
import { usd } from '../lib/format.js'

const limpio = { etapa: '', responsable: '', minutos: '', tarifaHora: '', nota: '' }

export default function TiemposProduccion({ pedido }) {
  const [formularios, setFormularios] = useState({})
  const [ocupado, setOcupado] = useState(false)
  const bloqueado = ocupado || ['entregado', 'cancelado'].includes(pedido.estado)
  const todos = Object.values(pedido.tiemposProduccion || {}).flat()
  const suma = resumenTiempos(todos)

  async function modificar(indice, operacion) {
    setOcupado(true)
    try {
      await db.transaction('rw', db.pedidos, async () => {
        const actual = await db.pedidos.get(pedido.id)
        if (!actual || ['cancelado', 'entregado'].includes(actual.estado)) throw new Error('El pedido está cerrado o no existe')
        const clave = String(indice)
        const estado = { ...(actual.tiemposProduccion || {}) }
        estado[clave] = operacion(estado[clave] || [], actual.produccionEtapas?.[clave])
        await db.pedidos.update(pedido.id, { tiemposProduccion: estado })
      })
    } catch (e) { alert(e.message) }
    finally { setOcupado(false) }
  }

  async function agregar(indice) {
    const f = formularios[indice] || limpio
    // Validar nuevamente dentro de la transacción ante un cambio concurrente de ruta.
    await modificar(indice, (actual, ruta) => {
      const valido = validarTiempo(f, ruta)
      return [...actual, { ...valido, id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, fecha: new Date().toISOString() }]
    })
  }

  function eliminar(indice, id) {
    if (!confirm('¿Eliminar este tiempo registrado? No cambiará pagos ni inventario.')) return
    modificar(indice, items => items.filter(x => x.id !== id))
  }

  return <div className="tarjeta">
    <h2>Tiempo real de mano de obra</h2>
    <p className="muted">Registra cada sesión por trabajo y etapa. La tarifa es opcional: si no la conoces, el costo se mostrará como incompleto. No se modifica el precio cotizado, el reparto ni los asientos contables.</p>
    <div className="fila">
      <span className="etiqueta-tipo neutro">Tiempo registrado: {tiempoLegible(suma.minutos)}</span>
      <span className="etiqueta-tipo proceso">Mano de obra con tarifa: {usd(suma.costoConocido)}</span>
      {suma.sinTarifa > 0 && <span className="etiqueta-tipo bajo">{suma.sinTarifa} sesión(es) sin tarifa · costo incompleto</span>}
    </div>
    {(pedido.items || []).map((item, indice) => {
      const ruta = pedido.produccionEtapas?.[String(indice)]
      const registros = pedido.tiemposProduccion?.[String(indice)] || []
      const resumen = resumenTiempos(registros)
      const f = formularios[indice] || limpio
      const campo = (key, value) => setFormularios(old => ({ ...old, [indice]: { ...(old[indice] || limpio), [key]: value } }))
      return <section className="flujo-item" key={indice}>
        <div className="flujo-cabecera"><strong>{indice + 1}. {item.descripcion || `Trabajo ${indice + 1}`}</strong><span className="desglose">{tiempoLegible(resumen.minutos)} · {resumen.sinTarifa ? 'Costo incompleto' : usd(resumen.costoConocido)}</span></div>
        {registros.length > 0 && <div className="tabla-scroll"><table><thead><tr><th>Etapa y responsable</th><th>Fecha</th><th>Duración</th><th>Costo conocido</th><th></th></tr></thead><tbody>
          {registros.map(r => <tr key={r.id}><td>{ETAPAS[r.etapa] || r.etapa}<div className="desglose">{r.responsable}{r.nota ? ` · ${r.nota}` : ''}</div></td><td>{new Date(r.fecha).toLocaleDateString('es-VE')}</td><td>{tiempoLegible(r.minutos)}</td><td>{r.tarifaHora == null ? 'Sin tarifa' : usd(r.minutos * r.tarifaHora / 60)}</td><td><button type="button" className="peligro mini" disabled={bloqueado} onClick={() => eliminar(indice, r.id)} aria-label="Eliminar sesión">×</button></td></tr>)}
        </tbody></table></div>}
        {!ruta ? <p className="muted">Primero selecciona una ruta en «Etapas por trabajo».</p> : !bloqueado && <div className="tiempo-formulario">
          <label className="campo">Etapa<select value={f.etapa} onChange={e => campo('etapa', e.target.value)}><option value="">Seleccionar…</option>{ruta.etapas.map(e => <option key={e.id} value={e.id}>{ETAPAS[e.id] || e.id}</option>)}</select></label>
          <label className="campo">Responsable<input value={f.responsable} onChange={e => campo('responsable', e.target.value)} placeholder="Nombre" maxLength={90}/></label>
          <label className="campo">Minutos reales<input type="number" min="1" max="1440" step="1" value={f.minutos} onChange={e => campo('minutos', e.target.value)} placeholder="Ej. 45" /></label>
          <label className="campo">Tarifa por hora ($) · opcional<input type="number" min="0" step="0.01" value={f.tarifaHora} onChange={e => campo('tarifaHora', e.target.value)} placeholder="Sin definir" /></label>
          <label className="campo">Nota<input value={f.nota} onChange={e => campo('nota', e.target.value)} maxLength={500} placeholder="Ej. recorte manual" /></label>
          <button type="button" disabled={ocupado} onClick={() => agregar(indice)}>+ Registrar tiempo</button>
        </div>}
      </section>
    })}
  </div>
}
