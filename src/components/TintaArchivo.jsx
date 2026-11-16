import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal, Selector, Campo } from './ui.jsx'
import { CANALES, AREA_CARTA, coberturaCMYK, estimarTinta } from '../lib/tinta.js'
import { n } from '../lib/calc.js'
import { usd, num } from '../lib/format.js'

const ANCHO_ANALISIS = 500 // píxeles: suficiente para medir cobertura y rápido en el celular
const MAX_PAGINAS = 40
const TAMANOS = [
  { value: '1', label: 'Carta completa' },
  { value: '0.5', label: 'Media carta' },
  { value: '0.25', label: 'Un cuarto de carta' },
  { value: '2', label: 'Doble carta / tabloide' },
  { value: 'otro', label: 'Otro tamaño (cm)…' },
]
const COLOR = { c: '#19a7ce', m: '#d6338a', y: '#e3b300', k: '#2a2a2e' }

function medirCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  return coberturaCMYK(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
}

async function analizarImagen(archivo) {
  const bmp = await createImageBitmap(archivo)
  const escala = Math.min(1, ANCHO_ANALISIS / bmp.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bmp.width * escala))
  canvas.height = Math.max(1, Math.round(bmp.height * escala))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return { paginas: [{ cobertura: medirCanvas(canvas), areaCartas: null }], vista: canvas.toDataURL('image/jpeg', 0.7), esPdf: false }
}

async function analizarPdf(archivo) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  const doc = await pdfjs.getDocument({ data: await archivo.arrayBuffer() }).promise
  const total = Math.min(doc.numPages, MAX_PAGINAS)
  const paginas = []
  let vista = null
  for (let i = 1; i <= total; i++) {
    const pag = await doc.getPage(i)
    const base = pag.getViewport({ scale: 1 })
    const vp = pag.getViewport({ scale: ANCHO_ANALISIS / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    await pag.render({ canvasContext: ctx, canvas, viewport: vp }).promise
    // El tamaño real de la página del PDF, comparado con una carta.
    paginas.push({ cobertura: medirCanvas(canvas), areaCartas: (base.width * base.height) / AREA_CARTA })
    if (i === 1) vista = canvas.toDataURL('image/jpeg', 0.7)
  }
  return { paginas, vista, esPdf: true, totalPaginas: doc.numPages }
}

export default function TintaArchivo({ productos, config, onAgregar, onCerrar }) {
  const perfiles = config.perfilesTinta || []
  const entrada = useRef()
  const [perfilId, setPerfilId] = useState(perfiles[0]?.id ?? '')
  const [analisis, setAnalisis] = useState(null)
  const [nombre, setNombre] = useState('')
  const [estado, setEstado] = useState('')
  const [tamano, setTamano] = useState('1')
  const [cm, setCm] = useState({ ancho: null, alto: null })

  async function elegir(e) {
    const f = e.target.files[0]
    if (!f) return
    setEstado('Analizando…'); setAnalisis(null); setNombre(f.name)
    try {
      const esPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
      setAnalisis(esPdf ? await analizarPdf(f) : await analizarImagen(f))
      setEstado('')
    } catch (err) {
      setEstado('No se pudo leer el archivo. Usa una imagen (PNG, JPG) o un PDF. ' + (err?.message || ''))
    }
    e.target.value = ''
  }

  const perfil = perfiles.find((p) => p.id === Number(perfilId))
  const areaImagen = tamano === 'otro' ? (n(cm.ancho) * n(cm.alto)) / (21.59 * 27.94) : Number(tamano)
  const paginas = analisis ? analisis.paginas.map((p) => ({ ...p, areaCartas: p.areaCartas ?? areaImagen })) : []
  const est = analisis ? estimarTinta(paginas, perfil) : null
  const prod = (id) => productos.find((p) => p.id === Number(id))
  const filas = est ? CANALES.map(([k, etiqueta]) => {
    const p = prod(est[k].productoId)
    return { k, etiqueta, ...est[k], producto: p, costo: est[k].ml != null && p && n(p.costoPromedio) ? est[k].ml * n(p.costoPromedio) : null }
  }) : []
  const agregables = filas.filter((f) => f.ml != null && f.ml > 0 && f.producto)
  const costoTotal = filas.reduce((s, f) => s + n(f.costo), 0)
  const faltan = filas.filter((f) => f.cobertura > 0.0005 && (f.ml == null || !f.producto))

  return (
    <Modal titulo="Calcular tinta desde un archivo" onCerrar={onCerrar} ancho>
      <p className="muted">Sube el diseño que vas a imprimir (imagen o PDF). La app mide cuánta superficie cubre cada color y estima los mililitros de tinta <strong>por unidad</strong>. El archivo se analiza en tu dispositivo: no se sube a ningún lado.</p>
      <div className="fila">
        <div className="campo auto">
          <button onClick={() => entrada.current.click()}>{analisis ? 'Cambiar archivo' : 'Elegir archivo…'}</button>
          <input ref={entrada} type="file" accept="image/*,application/pdf,.pdf" hidden onChange={elegir} />
        </div>
        <Selector label="Impresora" valor={perfilId} onCambio={setPerfilId} vacio={perfiles.length ? undefined : 'Sin impresoras configuradas'}
          opciones={perfiles.map((p) => ({ value: p.id, label: p.nombre || 'Impresora sin nombre' }))} />
        {analisis && !analisis.esPdf && <Selector label="Tamaño impreso" valor={tamano} onCambio={setTamano} opciones={TAMANOS} />}
      </div>
      {analisis && !analisis.esPdf && tamano === 'otro' && (
        <div className="fila">
          <Campo label="Ancho impreso (cm)" tipo="number" valor={cm.ancho} onCambio={(v) => setCm({ ...cm, ancho: v })} />
          <Campo label="Alto impreso (cm)" tipo="number" valor={cm.alto} onCambio={(v) => setCm({ ...cm, alto: v })} />
        </div>
      )}
      {!perfiles.length && <p className="pendiente">Para convertir la cobertura en mililitros, configura tu impresora en <Link to="/configuracion" onClick={onCerrar}>Configuración → Impresoras y tinta</Link>. Igual puedes ver la cobertura.</p>}
      {estado && <p className={estado === 'Analizando…' ? 'muted' : 'pendiente'}>{estado}</p>}

      {analisis && (
        <div className="tinta-resultado">
          <div>
            {analisis.vista && <img src={analisis.vista} alt="Vista previa del archivo" />}
            <div className="desglose">{nombre}{analisis.esPdf && ` · ${analisis.paginas.length} página(s)`}
              {analisis.totalPaginas > MAX_PAGINAS && ` (se analizaron las primeras ${MAX_PAGINAS} de ${analisis.totalPaginas})`}</div>
          </div>
          <div>
            <table>
              <thead><tr><th>Tinta</th><th>Cobertura</th><th className="num">ml por unidad</th><th className="num">Costo</th></tr></thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.k}>
                    <td><span className="punto" style={{ background: COLOR[f.k] }} /> {f.etiqueta}<div className="desglose">{f.producto?.nombre ?? 'sin tinta asignada'}</div></td>
                    <td style={{ minWidth: 120 }}>
                      <div className="barra"><div style={{ width: Math.min(100, f.cobertura * 100) + '%', background: COLOR[f.k] }} /></div>
                      <span className="desglose">{num(f.cobertura * 100, 1)} %</span>
                    </td>
                    <td className="num">{f.ml != null ? num(f.ml, 3) : f.cobertura > 0.0005 ? <span className="pendiente">pendiente</span> : '0'}</td>
                    <td className="num">{f.costo != null ? usd(f.costo) : f.cobertura > 0.0005 ? <span className="pendiente">pendiente</span> : '—'}</td>
                  </tr>
                ))}
                <tr className="resumen total"><td colSpan={3}>Costo de tinta por unidad</td><td className="num">{usd(costoTotal)}</td></tr>
              </tbody>
            </table>
            {faltan.length > 0 && perfiles.length > 0 && (
              <p className="pendiente">Faltan datos de {faltan.map((f) => f.etiqueta.toLowerCase()).join(', ')}: el rendimiento de la botella o la tinta del inventario (Configuración → Impresoras y tinta). No se sumará como costo cero: queda pendiente.</p>
            )}
            {filas.some((f) => f.producto && !n(f.producto.costoPromedio) && f.ml > 0) && (
              <p className="pendiente">Alguna tinta no tiene costo: registra su compra en Inventario.</p>
            )}
          </div>
        </div>
      )}
      <p className="ayuda">Es una estimación por cobertura. El gasto real cambia con la calidad de impresión, el papel y las limpiezas de cabezal; conviene compararla de vez en cuando con lo que baja la botella.</p>
      <div className="modal-pie">
        <button className="sec" onClick={onCerrar}>Cancelar</button>
        <button disabled={!agregables.length} onClick={() => { onAgregar(agregables.map((f) => ({ productoId: f.producto.id, cantidad: Math.round(f.ml * 1000) / 1000 })), nombre); onCerrar() }}>
          Agregar la tinta a los materiales
        </button>
      </div>
    </Modal>
  )
}
