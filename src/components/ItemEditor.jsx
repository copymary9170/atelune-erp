import { useState } from 'react'
import { Campo, Selector } from './ui.jsx'
import TintaArchivo from './TintaArchivo.jsx'
import { costoHoraActivo, n, personas } from '../lib/calc.js'
import { descuentoPorCantidad, escalasInvalidas } from '../lib/escalas-cotizaciones.js'
import { usd } from '../lib/format.js'

// Editor de un trabajo (se usa en plantillas y en renglones de cotización).
export default function ItemEditor({ item, onCambio, productos, activos, config, esCotizacion }) {
  const set = (k, v) => onCambio({ ...item, [k]: v })
  const setSub = (k, i, campo, v) => set(k, (item[k] || []).map((e, j) => (j === i ? { ...e, [campo]: v } : e)))
  const quitar = (k, i) => set(k, (item[k] || []).filter((_, j) => j !== i))
  const agregar = (k, nuevo) => set(k, [...(item[k] || []), nuevo])
  const lineas = config.lineas || []
  const [tinta, setTinta] = useState(false)
  // Reemplaza las tintas ya puestas (mismo producto) y agrega las nuevas.
  const agregarTinta = (nuevos) => set('materiales', [...(item.materiales || []).filter((m) => !nuevos.some((x) => x.productoId === Number(m.productoId))), ...nuevos])

  return (
    <>
      <div className="fila">
        <Campo label={esCotizacion ? 'Descripción (la ve el cliente)' : 'Nombre de la plantilla'} valor={item.descripcion}
          onCambio={(v) => set('descripcion', v)} placeholder="Ej.: Taza sublimada 11 oz con diseño personalizado" />
        <Selector className="auto" label="Línea" valor={item.lineaId} onCambio={(v) => set('lineaId', v ? Number(v) : '')} vacio="Elegir…"
          opciones={lineas.map((l) => ({ value: l.id, label: l.nombre }))} />
        {esCotizacion && <Campo className="angosto" label="Cantidad" tipo="number" valor={item.cantidad} onCambio={(v) => set('cantidad', v)} />}
      </div>

      <div className="subtabla">
        <h4>Materiales por unidad</h4>
        {(item.materiales || []).map((m, i) => {
          const p = productos.find((x) => x.id === Number(m.productoId))
          return (
            <div className="fila" key={i}>
              <Selector valor={m.productoId} onCambio={(v) => setSub('materiales', i, 'productoId', Number(v))} vacio="Elegir del inventario…"
                opciones={productos.map((x) => ({ value: x.id, label: `${x.nombre} (${x.unidadUso})` }))} />
              <Campo className="angosto" tipo="number" valor={m.cantidad} onCambio={(v) => setSub('materiales', i, 'cantidad', v)} placeholder={p?.unidadUso || 'cant.'} />
              <div className="campo auto desglose" style={{ width: 90, textAlign: 'right' }}>{p ? usd(n(m.cantidad) * n(p.costoPromedio)) : ''}</div>
              <div className="campo auto"><button className="peligro mini" onClick={() => quitar('materiales', i)}>×</button></div>
            </div>
          )
        })}
        <div className="acciones">
          <button className="sec mini" onClick={() => agregar('materiales', { productoId: '', cantidad: 1 })}>+ Material</button>
          <button className="sec mini" onClick={() => setTinta(true)}>Calcular tinta desde un archivo…</button>
        </div>
        {tinta && <TintaArchivo productos={productos} config={config} onAgregar={agregarTinta} onCerrar={() => setTinta(false)} />}
        {!productos.length && <span className="ayuda"> Primero registra productos en Inventario.</span>}
      </div>

      <div className="subtabla">
        <h4>Máquinas por unidad</h4>
        {(item.maquinas || []).map((m, i) => {
          const a = activos.find((x) => x.id === Number(m.activoId))
          return (
            <div className="fila" key={i}>
              <Selector valor={m.activoId} onCambio={(v) => setSub('maquinas', i, 'activoId', Number(v))} vacio="Elegir máquina…"
                opciones={activos.map((x) => ({ value: x.id, label: x.nombre }))} />
              <Campo className="angosto" tipo="number" valor={m.minutos} onCambio={(v) => setSub('maquinas', i, 'minutos', v)} placeholder="minutos" />
              <div className="campo auto desglose" style={{ width: 90, textAlign: 'right' }}>{a ? usd((n(m.minutos) / 60) * costoHoraActivo(a, config.costoKwh)) : ''}</div>
              <div className="campo auto"><button className="peligro mini" onClick={() => quitar('maquinas', i)}>×</button></div>
            </div>
          )
        })}
        <button className="sec mini" onClick={() => agregar('maquinas', { activoId: '', minutos: null })}>+ Máquina</button>
      </div>

      <div className="fila">
        <Selector label="Responsable (mano de obra)" valor={item.personaId ?? personas(config)[0]?.id} onCambio={(v) => set('personaId', Number(v))}
          opciones={personas(config).map((p) => ({ value: p.id, label: p.nombre + (p.tarifaHora ? ` ($${p.tarifaHora}/h)` : ' (tarifa pendiente)') }))} />
        <Campo label="Minutos de diseño (total)" tipo="number" valor={item.minutosDiseno} onCambio={(v) => set('minutosDiseno', v)} />
        <Campo label="Minutos de producción (por unidad)" tipo="number" valor={item.minutosProduccion} onCambio={(v) => set('minutosProduccion', v)} />
        <Campo label="Merma (%)" tipo="number" valor={item.mermaPct} onCambio={(v) => set('mermaPct', v)}
          placeholder={config.mermaPorDefecto != null ? `${config.mermaPorDefecto} (por defecto)` : 'por defecto'} />
      </div>

      <div className="subtabla">
        <h4>Otros costos por unidad</h4>
        {(item.extras || []).map((e, i) => (
          <div className="fila" key={i}>
            <Campo valor={e.concepto} onCambio={(v) => setSub('extras', i, 'concepto', v)} placeholder="Empaque, tercerizado, accesorio…" />
            <Campo className="angosto" tipo="number" valor={e.monto} onCambio={(v) => setSub('extras', i, 'monto', v)} placeholder="$" />
            <div className="campo auto"><button className="peligro mini" onClick={() => quitar('extras', i)}>×</button></div>
          </div>
        ))}
        <button className="sec mini" onClick={() => agregar('extras', { concepto: '', monto: null })}>+ Otro costo</button>
      </div>

      {esCotizacion && (
        <div className="subtabla">
          <h4>Precios por cantidad</h4>
          <p className="ayuda">Define desde cuántas unidades aplicar un descuento adicional. Se usa únicamente el escalón más alto alcanzado; los escalones no se acumulan y no alteran los costos.</p>
          {(item.escalasCantidad || []).map((escala, i) => (
            <div className="fila" key={i}>
              <Campo label="Desde (unidades)" tipo="number" valor={escala.desde}
                onCambio={(v) => setSub('escalasCantidad', i, 'desde', v)} />
              <Campo label="Descuento adicional (%)" tipo="number" valor={escala.descuentoPct}
                onCambio={(v) => setSub('escalasCantidad', i, 'descuentoPct', v)} />
              <div className="campo auto"><button className="peligro mini"
                aria-label={'Quitar escalón ' + (i + 1)}
                onClick={() => quitar('escalasCantidad', i)}>Quitar</button></div>
            </div>
          ))}
          <button className="sec mini" onClick={() => agregar('escalasCantidad', { desde: '', descuentoPct: '' })}>
            + Agregar escalón
          </button>
          {escalasInvalidas(item.escalasCantidad || []) && (
            <p className="pendiente" role="alert">Los escalones deben tener un umbral entero positivo, un descuento entre 0 y 100 % y umbrales diferentes.</p>
          )}
          {!!(item.escalasCantidad || []).length && !escalasInvalidas(item.escalasCantidad) && (
            <p className="ayuda">Para {n(item.cantidad)} unidad(es): descuento por volumen {descuentoPorCantidad(item.cantidad, item.escalasCantidad).descuentoPct} %.</p>
          )}
        </div>
      )}

      {esCotizacion && (
        <div className="fila">
          <Campo label="Margen (%) — vacío usa el de la línea" tipo="number" valor={item.margenPct} onCambio={(v) => set('margenPct', v)}
            placeholder={lineas.find((l) => l.id === Number(item.lineaId))?.margenPct?.toString() ?? ''} />
          <Campo label="Descuento (%)" tipo="number" valor={item.descuentoPct} onCambio={(v) => set('descuentoPct', v)} />
        </div>
      )}
    </>
  )
}

export const itemVacio = () => ({
  descripcion: '', lineaId: '', cantidad: 1, materiales: [], maquinas: [],
  minutosDiseno: null, minutosProduccion: null, mermaPct: null, extras: [], margenPct: null, descuentoPct: null, escalasCantidad: [],
})
