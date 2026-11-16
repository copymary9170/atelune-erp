import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { Campo, Modal, Avisos, SelectorPago, useConfig } from '../components/ui.jsx'
import { costoHoraActivo, depreciacionMensual, depreciacionAcumulada, n } from '../lib/calc.js'
import { usd, fecha } from '../lib/format.js'

export default function Activos() {
  const activos = useLiveQuery(() => db.activos.orderBy('nombre').toArray(), [], [])
  const config = useConfig()
  const [editando, setEditando] = useState(null)

  const totales = activos.reduce(
    (t, a) => ({
      costo: t.costo + n(a.costo),
      dep: t.dep + depreciacionAcumulada(a),
      mes: t.mes + (depreciacionAcumulada(a) < n(a.costo) - n(a.valorResidual) ? depreciacionMensual(a) : 0),
    }),
    { costo: 0, dep: 0, mes: 0 },
  )
  const avisos = []
  if (activos.some((a) => n(a.potenciaW)) && !n(config.costoKwh)) avisos.push('Falta el costo del kWh en Configuración: la electricidad no se está sumando.')
  for (const a of activos) if (!n(a.horasUsoMes)) avisos.push(`«${a.nombre}»: faltan las horas de uso al mes para calcular su costo por hora.`)

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Activos y máquinas</h1>
          <p>Depreciación en línea recta. El costo por hora de cada máquina se usa en el cotizador.</p>
        </div>
        <button onClick={() => setEditando({ fechaCompra: '', valorResidual: 0 })}>+ Nuevo activo</button>
      </div>

      <div className="grid g3">
        <div className="tarjeta kpi"><div className="etiqueta">Costo de compra total</div><div className="valor">{usd(totales.costo)}</div></div>
        <div className="tarjeta kpi"><div className="etiqueta">Depreciación acumulada</div><div className="valor">{usd(totales.dep)}</div></div>
        <div className="tarjeta kpi"><div className="etiqueta">Depreciación de este mes</div><div className="valor">{usd(totales.mes)}</div></div>
      </div>

      <Avisos lista={avisos} />

      <div className="tarjeta tabla-scroll">
        <table>
          <thead>
            <tr><th>Activo</th><th>Compra</th><th className="num">Costo</th><th className="num">Dep. mensual</th><th className="num">Valor en libros</th><th className="num">Costo por hora</th></tr>
          </thead>
          <tbody>
            {activos.map((a) => (
              <tr key={a.id} className="clic" onClick={() => setEditando(a)}>
                <td><strong>{a.nombre}</strong>{a.notas && <div className="desglose">{a.notas}</div>}</td>
                <td>{fecha(a.fechaCompra)}</td>
                <td className="num">{usd(a.costo)}</td>
                <td className="num">{usd(depreciacionMensual(a))}</td>
                <td className="num">{usd(n(a.costo) - depreciacionAcumulada(a))}</td>
                <td className="num">{n(a.horasUsoMes) ? usd(costoHoraActivo(a, config.costoKwh)) : <span className="pendiente">pendiente</span>}</td>
              </tr>
            ))}
            {!activos.length && <tr><td colSpan={6} className="vacio">Registra tus equipos: impresoras, impresora 3D, láser, planchas, plotter, computadora…</td></tr>}
          </tbody>
        </table>
      </div>

      {editando && <ActivoForm inicial={editando} config={config} onCerrar={() => setEditando(null)} />}
    </>
  )
}

function ActivoForm({ inicial, config, onCerrar }) {
  const [a, setA] = useState(inicial)
  const set = (k, v) => setA((x) => ({ ...x, [k]: v }))
  const nuevo = !inicial.id

  async function guardar() {
    if (!a.nombre?.trim()) return alert('Escribe el nombre del activo.')
    if (!(n(a.costo) > 0)) return alert('Escribe el costo de compra.')
    if (!(n(a.vidaUtilMeses) > 0)) return alert('Escribe la vida útil en meses.')
    if (nuevo) await db.activos.add(a)
    else await db.activos.put(a)
    onCerrar()
  }

  return (
    <Modal titulo={nuevo ? 'Nuevo activo' : 'Editar activo'} onCerrar={onCerrar}>
      <Campo label="Nombre" valor={a.nombre} onCambio={(v) => set('nombre', v)} autoFocus placeholder="Ej.: Grabadora láser, Plancha de tazas…" />
      <div className="fila">
        <Campo label="Fecha de compra" tipo="date" valor={a.fechaCompra} onCambio={(v) => set('fechaCompra', v)} />
        <Campo label="Costo de compra ($)" tipo="number" valor={a.costo} onCambio={(v) => set('costo', v)} />
      </div>
      <div className="fila">
        <Campo label="Vida útil (meses)" tipo="number" valor={a.vidaUtilMeses} onCambio={(v) => set('vidaUtilMeses', v)} ayuda="Cuánto tiempo esperas usarla." />
        <Campo label="Valor residual ($)" tipo="number" valor={a.valorResidual} onCambio={(v) => set('valorResidual', v)} ayuda="Lo que valdría al final (puede ser 0)." />
      </div>
      <SelectorPago valor={a.pagadoCon ?? ''} onCambio={(v) => set('pagadoCon', v || null)} metodos={config.metodosPago || []} />
      <div className="subtabla">
        <h4>Para calcular el costo por hora</h4>
        <div className="fila">
          <Campo label="Horas de uso al mes" tipo="number" valor={a.horasUsoMes} onCambio={(v) => set('horasUsoMes', v)} />
          <Campo label="Potencia (vatios)" tipo="number" valor={a.potenciaW} onCambio={(v) => set('potenciaW', v)} ayuda="Aparece en la etiqueta o el manual." />
          <Campo label="Mantenimiento ($/mes)" tipo="number" valor={a.mantenimientoMensual} onCambio={(v) => set('mantenimientoMensual', v)} />
        </div>
        <p className="ayuda">
          Depreciación: {usd(depreciacionMensual(a))}/mes · Costo por hora:{' '}
          <strong>{n(a.horasUsoMes) ? usd(costoHoraActivo(a, config.costoKwh)) : 'pendiente'}</strong>
          {n(a.potenciaW) > 0 && !n(config.costoKwh) && ' (sin electricidad: falta el costo del kWh)'}
        </p>
      </div>
      <Campo label="Notas" tipo="textarea" valor={a.notas} onCambio={(v) => set('notas', v)} placeholder="Modelo, serial, mantenimientos realizados…" />
      <div className="modal-pie">
        {!nuevo && (
          <button className="peligro" style={{ marginRight: 'auto' }}
            onClick={async () => { if (confirm(`¿Eliminar «${a.nombre}»?`)) { await db.activos.delete(a.id); onCerrar() } }}>
            Eliminar
          </button>
        )}
        <button className="sec" onClick={onCerrar}>Cancelar</button>
        <button onClick={guardar}>Guardar</button>
      </div>
    </Modal>
  )
}
