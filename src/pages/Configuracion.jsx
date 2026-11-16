import { useEffect, useRef, useState } from 'react'
import { db, exportarRespaldo, importarRespaldo } from '../db.js'
import { Campo, useConfig } from '../components/ui.jsx'
import { totalCostosFijos, fijosPorPedido } from '../lib/calc.js'
import { CATEGORIAS_GASTO } from '../lib/contabilidad.js'
import { nubeConfigurada, supabase, useSesion, useEstadoNube, sincronizarAhora, metaActual } from '../nube.js'
import { usd, fecha } from '../lib/format.js'

export default function Configuracion() {
  const guardada = useConfig()
  const [c, setC] = useState(guardada)
  const [estado, setEstado] = useState('')
  const archivo = useRef()

  useEffect(() => setC(guardada), [guardada])

  const set = (k, v) => setC((x) => ({ ...x, [k]: v }))
  const setLista = (k, i, campo, v) =>
    setC((x) => ({ ...x, [k]: x[k].map((e, j) => (j === i ? { ...e, [campo]: v } : e)) }))
  const quitar = (k, i) => setC((x) => ({ ...x, [k]: x[k].filter((_, j) => j !== i) }))
  const agregar = (k, nuevo) => setC((x) => ({ ...x, [k]: [...(x[k] || []), nuevo] }))

  async function guardar() {
    await db.config.put(c)
    setEstado('Cambios guardados ✓')
    setTimeout(() => setEstado(''), 2500)
  }

  async function descargar() {
    const datos = await exportarRespaldo()
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `atelune-respaldo-${datos.fecha.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function restaurar(e) {
    const f = e.target.files[0]
    if (!f) return
    if (!confirm('Restaurar reemplaza TODOS los datos actuales por los del respaldo. ¿Continuar?')) return
    try {
      await importarRespaldo(JSON.parse(await f.text()))
      setEstado('Respaldo restaurado ✓')
    } catch (err) {
      alert('No se pudo restaurar: ' + err.message)
    }
    e.target.value = ''
  }

  const siguienteIdLinea = Math.max(0, ...(c.lineas || []).map((l) => l.id)) + 1

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Configuración</h1>
          <p>Estos valores alimentan el cotizador. Los campos vacíos se muestran como pendientes.</p>
        </div>
        <div className="acciones">
          {estado && <span className="etiqueta-tipo ok">{estado}</span>}
          <button onClick={guardar}>Guardar cambios</button>
        </div>
      </div>

      <div className="grid g2">
        <div className="tarjeta">
          <h2>Negocio y mano de obra</h2>
          <Campo label="Nombre del negocio" valor={c.nombreNegocio} onCambio={(v) => set('nombreNegocio', v)} />
          <Campo label="Contacto (aparece en la cotización)" valor={c.contacto} onCambio={(v) => set('contacto', v)} placeholder="WhatsApp, Instagram, correo…" />
          <Campo label="Tarifa por hora de trabajo ($)" tipo="number" valor={c.tarifaHora} onCambio={(v) => set('tarifaHora', v)}
            ayuda="Lo que vale una hora de tu tiempo de diseño y producción." />
          <Campo label="Merma por defecto (%)" tipo="number" valor={c.mermaPorDefecto} onCambio={(v) => set('mermaPorDefecto', v)}
            ayuda="Desperdicio de materiales (pruebas, errores, recortes). Se puede cambiar en cada trabajo." />
          <Campo label="Costo de la electricidad ($ por kWh)" tipo="number" valor={c.costoKwh} onCambio={(v) => set('costoKwh', v)} />
        </div>

        <div className="tarjeta">
          <h2>Cotizaciones</h2>
          <Campo label="IVA (%)" tipo="number" valor={c.ivaPct} onCambio={(v) => set('ivaPct', v)}
            ayuda="Solo se aplica si marcas «Aplicar IVA» en la cotización. Confírmalo con tu contador." />
          <Campo label="Vigencia de la cotización (días)" tipo="number" valor={c.vigenciaDias} onCambio={(v) => set('vigenciaDias', v)} />
          <Campo label="Condiciones (aparecen al pie de la cotización)" tipo="textarea" valor={c.condiciones} onCambio={(v) => set('condiciones', v)}
            placeholder="Ej.: abono para iniciar, tiempos de entrega, cambios de diseño…" />
        </div>
      </div>

      <div className="tarjeta">
        <h2>Costos fijos mensuales</h2>
        <p className="muted">Se reparten entre los pedidos del mes y se suman a cada cotización.</p>
        {(c.costosFijos || []).map((f, i) => (
          <div className="fila" key={i}>
            <Campo label={i === 0 ? 'Concepto' : ''} valor={f.nombre} onCambio={(v) => setLista('costosFijos', i, 'nombre', v)} placeholder="Internet, alquiler, software…" />
            <Campo className="angosto" label={i === 0 ? 'Monto ($/mes)' : ''} tipo="number" valor={f.monto} onCambio={(v) => setLista('costosFijos', i, 'monto', v)} />
            <div className="campo auto"><button className="peligro mini" onClick={() => quitar('costosFijos', i)}>Quitar</button></div>
          </div>
        ))}
        <div className="fila">
          <div className="auto"><button className="sec" onClick={() => agregar('costosFijos', { nombre: '', monto: null })}>+ Agregar costo fijo</button></div>
        </div>
        <div className="grid g3" style={{ marginTop: 14 }}>
          <Campo label="Pedidos estimados al mes" tipo="number" valor={c.pedidosEstimadosMes} onCambio={(v) => set('pedidosEstimadosMes', v)} />
          <div className="kpi"><div className="etiqueta">Total fijos al mes</div><div className="valor">{usd(totalCostosFijos(c))}</div></div>
          <div className="kpi"><div className="etiqueta">Se suma a cada pedido</div><div className="valor">{c.pedidosEstimadosMes ? usd(fijosPorPedido(c)) : <span className="pendiente">pendiente</span>}</div></div>
        </div>
      </div>

      <div className="grid g2">
        <div className="tarjeta">
          <h2>Líneas de servicio y margen</h2>
          <p className="muted">El margen es el % del precio de venta que queda como ganancia.</p>
          {(c.lineas || []).map((l, i) => (
            <div className="fila" key={l.id}>
              <Campo valor={l.nombre} onCambio={(v) => setLista('lineas', i, 'nombre', v)} />
              <Campo className="angosto" tipo="number" valor={l.margenPct} onCambio={(v) => setLista('lineas', i, 'margenPct', v)} placeholder="% margen" />
            </div>
          ))}
          <button className="sec" onClick={() => agregar('lineas', { id: siguienteIdLinea, nombre: '', margenPct: null })}>+ Agregar línea</button>
        </div>

        <div className="tarjeta">
          <h2>Métodos de pago</h2>
          <p className="muted">Si un método cobra comisión, se suma al precio para que recibas lo calculado.</p>
          {(c.metodosPago || []).map((m, i) => (
            <div className="fila" key={i}>
              <Campo valor={m.nombre} onCambio={(v) => setLista('metodosPago', i, 'nombre', v)} />
              <Campo className="angosto" tipo="number" valor={m.comisionPct} onCambio={(v) => setLista('metodosPago', i, 'comisionPct', v)} placeholder="% comisión" />
              <div className="campo auto"><button className="peligro mini" onClick={() => quitar('metodosPago', i)}>×</button></div>
            </div>
          ))}
          <button className="sec" onClick={() => agregar('metodosPago', { nombre: '', comisionPct: null })}>+ Agregar método</button>
        </div>
      </div>

      <div className="tarjeta">
        <h2>Categorías de gasto</h2>
        <p className="muted">Cada categoría es una cuenta de gasto en la contabilidad. Si cambias un nombre, los gastos ya registrados conservan el anterior.</p>
        {(c.categoriasGasto ?? CATEGORIAS_GASTO).map((cat, i) => (
          <div className="fila" key={i}>
            <Campo valor={cat} onCambio={(v) => set('categoriasGasto', (c.categoriasGasto ?? CATEGORIAS_GASTO).map((x, j) => (j === i ? v : x)))} />
            <div className="campo auto"><button className="peligro mini" onClick={() => set('categoriasGasto', (c.categoriasGasto ?? CATEGORIAS_GASTO).filter((_, j) => j !== i))}>×</button></div>
          </div>
        ))}
        <button className="sec" onClick={() => set('categoriasGasto', [...(c.categoriasGasto ?? CATEGORIAS_GASTO), ''])}>+ Agregar categoría</button>
      </div>

      <NubeTarjeta />

      <div className="tarjeta">
        <h2>Respaldo de datos</h2>
        <p>
          {nubeConfigurada
            ? 'Además de la nube, conviene descargar un respaldo de vez en cuando (por ejemplo, cada mes) y guardarlo en Google Drive o en tu computadora.'
            : <>Tus datos se guardan en este navegador. <strong>Descarga un respaldo con frecuencia</strong> (por ejemplo, cada semana) y guárdalo en Google Drive o en tu computadora. Si borras los datos del navegador o cambias de equipo, lo recuperas con «Restaurar».</>}
        </p>
        <p className="muted">Último respaldo: {c.ultimoRespaldo ? fecha(c.ultimoRespaldo) : 'nunca'}</p>
        <div className="acciones">
          <button onClick={descargar}>Descargar respaldo</button>
          <button className="sec" onClick={() => archivo.current.click()}>Restaurar desde archivo…</button>
          <input ref={archivo} type="file" accept="application/json" hidden onChange={restaurar} />
        </div>
      </div>
    </>
  )
}

function NubeTarjeta() {
  const sesion = useSesion()
  const { fase } = useEstadoNube()
  if (!nubeConfigurada) return (
    <div className="tarjeta">
      <h2>Nube</h2>
      <p className="muted">La nube no está configurada: los datos viven solo en este navegador.</p>
    </div>
  )
  const m = metaActual()
  return (
    <div className="tarjeta">
      <h2>Nube</h2>
      <p>Sesión iniciada como <strong>{sesion?.user?.email}</strong>. Tus datos se guardan en la nube y se ven igual en todos tus dispositivos.</p>
      <p className="muted">Estado: {fase === 'ok' ? 'sincronizado' : fase.replace('_', ' ')}{m?.ultimaSync && ' · última vez ' + new Date(m.ultimaSync).toLocaleString('es-VE')}{m?.version ? ' · versión ' + m.version : ''}</p>
      <div className="acciones">
        <button className="sec" onClick={() => sincronizarAhora()}>Sincronizar ahora</button>
        <button className="peligro" onClick={async () => {
          if (!confirm('¿Cerrar sesión en este dispositivo? Los datos quedan guardados en la nube.')) return
          await supabase.auth.signOut()
        }}>Cerrar sesión</button>
      </div>
    </div>
  )
}
