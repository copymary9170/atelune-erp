import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { Modal, useConfig } from '../components/ui.jsx'
import ItemEditor, { itemVacio } from '../components/ItemEditor.jsx'
import { costoItem, precioDesdeMargen, fijosPorPedido, n } from '../lib/calc.js'
import { usd } from '../lib/format.js'

export function useDatosCalculo() {
  const productos = useLiveQuery(() => db.productos.orderBy('nombre').toArray(), [], [])
  const activos = useLiveQuery(() => db.activos.orderBy('nombre').toArray(), [], [])
  const config = useConfig()
  return { productos, activos, config }
}

export default function Plantillas() {
  const plantillas = useLiveQuery(() => db.plantillas.orderBy('nombre').toArray(), [], [])
  const datos = useDatosCalculo()
  const [editando, setEditando] = useState(null)
  const lineas = datos.config.lineas || []

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Plantillas de trabajo</h1>
          <p>Guarda la «receta» de los trabajos que repites (materiales, máquinas, tiempos) para cotizar en segundos.</p>
        </div>
        <button onClick={() => setEditando(itemVacio())}>+ Nueva plantilla</button>
      </div>
      <div className="tarjeta tabla-scroll">
        <table>
          <thead><tr><th>Plantilla</th><th>Línea</th><th className="num">Costo por unidad*</th><th className="num">Precio sugerido*</th></tr></thead>
          <tbody>
            {plantillas.map((p) => {
              const c = costoItem({ ...p, cantidad: 1 }, datos).total
              const margen = lineas.find((l) => l.id === Number(p.lineaId))?.margenPct
              return (
                <tr key={p.id} className="clic" onClick={() => setEditando(p)}>
                  <td><strong>{p.descripcion}</strong></td>
                  <td>{lineas.find((l) => l.id === Number(p.lineaId))?.nombre ?? '—'}</td>
                  <td className="num">{usd(c)}</td>
                  <td className="num">{margen != null ? usd(precioDesdeMargen(c, margen)) : <span className="pendiente">falta margen</span>}</td>
                </tr>
              )
            })}
            {!plantillas.length && <tr><td colSpan={4} className="vacio">Aún no hay plantillas. Ejemplos: «Taza sublimada 11 oz», «Llavero MDF grabado», «Topper comestible», «Pieza 3D».</td></tr>}
          </tbody>
        </table>
        <p className="ayuda">* Para 1 unidad, con el diseño incluido completo y sin costos fijos ({usd(fijosPorPedido(datos.config))} por pedido). El precio final se ve en la cotización.</p>
      </div>
      {editando && <PlantillaForm inicial={editando} datos={datos} onCerrar={() => setEditando(null)} />}
    </>
  )
}

function PlantillaForm({ inicial, datos, onCerrar }) {
  const [p, setP] = useState(inicial)
  const nuevo = !inicial.id
  const costo = costoItem({ ...p, cantidad: 1 }, datos)

  async function guardar() {
    if (!p.descripcion?.trim()) return alert('Escribe el nombre de la plantilla.')
    const { cantidad, margenPct, descuentoPct, ...resto } = p
    await db.plantillas.put({ ...resto, nombre: p.descripcion.trim() })
    onCerrar()
  }

  return (
    <Modal titulo={nuevo ? 'Nueva plantilla' : 'Editar plantilla'} onCerrar={onCerrar} ancho>
      <ItemEditor item={p} onCambio={setP} {...datos} />
      <p className="desglose">
        Costo de 1 unidad: materiales {usd(costo.materiales)} · máquinas {usd(costo.maquinas)} · mano de obra {usd(costo.manoObra)} · otros {usd(costo.extras)} ·{' '}
        <strong>total {usd(costo.total)}</strong>
        {!n(datos.config.tarifaHora) && ' (sin mano de obra: falta tu tarifa por hora)'}
      </p>
      <div className="modal-pie">
        {!nuevo && (
          <button className="peligro" style={{ marginRight: 'auto' }}
            onClick={async () => { if (confirm('¿Eliminar esta plantilla?')) { await db.plantillas.delete(p.id); onCerrar() } }}>
            Eliminar
          </button>
        )}
        <button className="sec" onClick={onCerrar}>Cancelar</button>
        <button onClick={guardar}>Guardar</button>
      </div>
    </Modal>
  )
}
