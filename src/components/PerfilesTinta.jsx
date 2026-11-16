import { Campo, Selector } from './ui.jsx'
import { CANALES, mlPorCartaLlena } from '../lib/tinta.js'
import { num } from '../lib/format.js'

// Impresoras y rendimiento de sus tintas, para estimar la tinta de un archivo.
export default function PerfilesTinta({ perfiles, productos, onCambio }) {
  const tintas = productos.filter((p) => p.unidadUso === 'ml')
  const setPerfil = (i, cambios) => onCambio(perfiles.map((p, j) => (j === i ? { ...p, ...cambios } : p)))
  const setCanal = (i, canal, k, v) => setPerfil(i, { canales: { ...perfiles[i].canales, [canal]: { ...(perfiles[i].canales?.[canal] || {}), [k]: v } } })
  const nuevoId = Math.max(0, ...perfiles.map((p) => p.id)) + 1

  return (
    <div className="tarjeta">
      <h2>Impresoras y tinta</h2>
      <p className="muted">Sirve para «Calcular tinta desde un archivo» en las cotizaciones. Por cada color indica la tinta del inventario, los ml de la botella y las páginas que rinde según el fabricante (dato de la caja o la ficha técnica, medido con 5 % de cobertura).</p>
      {perfiles.map((p, i) => (
        <div className="subtabla" key={p.id}>
          <div className="fila">
            <Campo label="Impresora" valor={p.nombre} onCambio={(v) => setPerfil(i, { nombre: v })} placeholder="Ej.: HP Smart Tank 580" />
            <div className="campo auto"><button className="peligro mini" onClick={() => confirm('¿Quitar esta impresora?') && onCambio(perfiles.filter((_, j) => j !== i))}>Quitar</button></div>
          </div>
          {CANALES.map(([canal, etiqueta], fila) => {
            const c = p.canales?.[canal] || {}
            const ml100 = mlPorCartaLlena(c)
            return (
              <div className="fila" key={canal}>
                <Selector label={fila === 0 ? 'Tinta del inventario' : ''} valor={c.productoId ?? ''} onCambio={(v) => setCanal(i, canal, 'productoId', v ? Number(v) : null)}
                  vacio={`${etiqueta}: elegir…`} opciones={tintas.map((t) => ({ value: t.id, label: `${etiqueta}: ${t.nombre}` }))} />
                <Campo className="angosto" label={fila === 0 ? 'ml botella' : ''} tipo="number" valor={c.mlBotella} onCambio={(v) => setCanal(i, canal, 'mlBotella', v)} />
                <Campo className="angosto" label={fila === 0 ? 'Páginas' : ''} tipo="number" valor={c.paginas} onCambio={(v) => setCanal(i, canal, 'paginas', v)} placeholder="pendiente" />
                <div className="campo auto desglose" style={{ width: 150 }}>{ml100 != null ? `${num(ml100, 3)} ml por carta llena` : <span className="pendiente">pendiente</span>}</div>
              </div>
            )
          })}
        </div>
      ))}
      {!tintas.length && <p className="ayuda">Aún no hay tintas en el inventario (productos cuya unidad de uso sea «ml»).</p>}
      <button className="sec" onClick={() => onCambio([...perfiles, { id: nuevoId, nombre: '', canales: {} }])}>+ Agregar impresora</button>
    </div>
  )
}
