import { useState } from 'react'
import { crearRuta, marcarEtapa, obtenerRuta, progresoRuta, RUTAS, ETAPAS } from '../lib/produccion.js'

export default function FlujoProduccion({ pedido }) {
  const [ocupado, setOcupado] = useState(false)
  const bloqueado = ocupado || ['cancelado', 'entregado'].includes(pedido.estado)

  async function guardar(indice, ruta) {
    setOcupado(true)
    try {
      // Leer el registro más reciente impide pisar cambios de otras secciones.
      const { db } = await import('../db.js')
      await db.transaction('rw', db.pedidos, async () => {
        const actual = await db.pedidos.get(pedido.id)
        if (!actual) throw new Error('El pedido ya no existe')
        if (['cancelado', 'entregado'].includes(actual.estado)) throw new Error('No se puede editar un pedido cerrado')
        await db.pedidos.update(pedido.id, { produccionEtapas: { ...(actual.produccionEtapas || {}), [String(indice)]: ruta } })
      })
    } catch (e) { alert(e.message) }
    finally { setOcupado(false) }
  }

  function rutaNueva(indice, preset) {
    const anterior = obtenerRuta(pedido.produccionEtapas, indice)
    if (anterior && anterior.etapas.some(e => e.completada) && !confirm('Cambiar la ruta borrará el avance registrado en este trabajo. ¿Continuar?')) return
    guardar(indice, crearRuta(preset))
  }

  function cambiar(indice, ruta, etapa) {
    try { guardar(indice, marcarEtapa(ruta, etapa.id, !etapa.completada)) }
    catch (e) { alert(e.message) }
  }

  const opciones = Object.entries(RUTAS)
  return <div className="tarjeta">
    <h2>Etapas por trabajo</h2>
    <p className="muted">Elige el proceso para cada renglón y registra su avance. No cambia automáticamente el estado general, los costos ni el inventario.</p>
    {(pedido.items || []).map((item, indice) => {
      const ruta = obtenerRuta(pedido.produccionEtapas, indice)
      const avance = progresoRuta(ruta)
      return <section key={indice} className="flujo-item">
        <div className="flujo-cabecera">
          <div><strong>{indice + 1}. {item.descripcion || `Trabajo ${indice + 1}`}</strong><div className="desglose">Cantidad: {item.cantidad ?? 1}</div></div>
          {ruta && <span className={'etiqueta-tipo ' + (avance.completa ? 'ok' : 'proceso')}>{avance.hechas}/{avance.total} · {avance.porcentaje}%</span>}
        </div>
        <label className="flujo-select">Tipo de producción
          <select disabled={bloqueado} value={ruta?.preset || ''} onChange={e => e.target.value && rutaNueva(indice, e.target.value)}>
            <option value="">Seleccionar proceso…</option>
            {opciones.map(([id, def]) => <option key={id} value={id}>{def.nombre}</option>)}
          </select>
        </label>
        {ruta ? <>
          <div className="flujo-barra" role="progressbar" aria-valuenow={avance.porcentaje} aria-valuemin="0" aria-valuemax="100" aria-label={`Avance del trabajo ${indice + 1}`}><span style={{ width: `${avance.porcentaje}%` }} /></div>
          <div className="flujo-pasos">
            {ruta.etapas.map((etapa, pos) => {
              const habilitada = pos === 0 || ruta.etapas[pos - 1]?.completada
              return <label className={'flujo-paso' + (etapa.completada ? ' completo' : '')} key={etapa.id}>
                <input type="checkbox" disabled={bloqueado || (!etapa.completada && !habilitada)} checked={!!etapa.completada} onChange={() => cambiar(indice, ruta, etapa)} />
                <span>{ETAPAS[etapa.id] || etapa.id}{etapa.fecha && <small> · {new Date(etapa.fecha).toLocaleString('es-VE')}</small>}</span>
              </label>
            })}
          </div>
          {avance.completa && <p className="desglose">Trabajo preparado. Confirma la entrega desde el estado general del pedido.</p>}
        </> : <p className="desglose">Sin ruta asignada. Puedes elegirla según los procesos reales de este trabajo.</p>}
      </section>
    })}
    {!pedido.items?.length && <p className="muted">El pedido no tiene trabajos registrados.</p>}
  </div>
}
