import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, guardarArqueoCaja } from '../db.js'
import { useConfig, Campo, Selector } from '../components/ui.jsx'
import { metodosEfectivo, resumenMovimientosCaja, calcularArqueo } from '../lib/caja.js'
import { hoy, usd, bs, fecha as formatoFecha } from '../lib/format.js'

const dinero = (monto, moneda) => moneda === 'Bs' ? bs(monto) : usd(monto)

export default function Caja() {
  const config = useConfig()
  const metodos = metodosEfectivo(config)
  const [dia, setDia] = useState(hoy())
  const [elegido, setElegido] = useState('')
  const [inicial, setInicial] = useState(null)
  const [contado, setContado] = useState(null)
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const pedidos = useLiveQuery(() => db.pedidos.toArray(), [], [])
  const gastos = useLiveQuery(() => db.gastos.toArray(), [], [])
  const movimientos = useLiveQuery(() => db.movimientos.toArray(), [], [])
  const cierres = useLiveQuery(() => db.cajaArqueos.orderBy('fecha').reverse().toArray(), [], [])
  const metodo = metodos.includes(elegido) ? elegido : metodos[0]
  const cargando = !pedidos || !gastos || !movimientos || !cierres
  let resumen = null
  let resultado = null
  let fallo = ''
  if (!cargando && metodo) {
    try {
      resumen = resumenMovimientosCaja({ pedidos, gastos, movimientos }, { fecha: dia, metodo })
      if (inicial != null && contado != null) resultado = calcularArqueo({ inicial, contado, resumen })
    } catch (e) {
      fallo = e.message
    }
  }
  const cierreAnterior = cierres?.find(c => c.fecha === dia && c.metodo === metodo)
  const faltantes = resumen?.pendientes || []

  async function cerrar() {
    if (!resumen || !resultado || cierreAnterior || ocupado) return
    if (!confirm('¿Registrar este cierre de caja? Se guardará una fotografía de los movimientos actuales; NO se cambiarán los pedidos ni los gastos.')) return
    setOcupado(true)
    setError('')
    try {
      await guardarArqueoCaja({ fecha: dia, metodo, inicial, contado, nota })
      setContado(null)
      setNota('')
    } catch (e) {
      setError(e?.message || 'No fue posible registrar el arqueo.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Caja y arqueo</h1>
          <p>Control del efectivo físico por día y moneda. El arqueo es informativo: no crea pagos ni modifica la contabilidad.</p>
        </div>
      </div>
      {!metodos.length && <div className="tarjeta"><p className="pendiente">No hay métodos de efectivo identificables. Configura «Efectivo $» o «Efectivo Bs» en Configuración → Métodos de pago.</p></div>}
      <div className="tarjeta">
        <h2>Preparar cierre de efectivo</h2>
        <div className="fila">
          <Campo label="Fecha" tipo="date" valor={dia} onCambio={v => { setDia(v); setError('') }} />
          <Selector label="Caja / método" valor={metodo || ''} onCambio={v => { setElegido(v); setError('') }}
            opciones={metodos.map(x => ({ value: x, label: x }))} />
          <Campo label={'Saldo inicial (' + (resumen?.moneda || '$ / Bs') + ')'} tipo="number" valor={inicial}
            onCambio={setInicial} ayuda="Anota el efectivo físico disponible al empezar el día. No se calcula automáticamente." />
          <Campo label={'Efectivo contado (' + (resumen?.moneda || '$ / Bs') + ')'} tipo="number" valor={contado}
            onCambio={setContado} ayuda="Escribe la suma física de billetes y monedas." />
        </div>
        <p className="ayuda">No se mezclan dólares y bolívares. Los registros guardados originalmente en USD y pagados en efectivo Bs requieren la tasa indicada en cada operación.</p>
        {cargando && <p className="muted">Cargando los documentos...</p>}
        {resumen && <>
          <div className="grid g3">
            <div className="tarjeta kpi"><div className="etiqueta">Entradas registradas</div><div className="valor">{dinero(resumen.entradas, resumen.moneda)}</div></div>
            <div className="tarjeta kpi"><div className="etiqueta">Salidas registradas</div><div className="valor">{dinero(resumen.salidas, resumen.moneda)}</div></div>
            <div className="tarjeta kpi"><div className="etiqueta">Saldo esperado</div><div className="valor">{resultado ? dinero(resultado.esperado, resumen.moneda) : 'Pendiente'}</div></div>
          </div>
          {!!faltantes.length && <p role="alert" className="pendiente">{faltantes.length} movimiento(s) sin tasa de cambio o con importe inválido. El total es parcial. Corrige los registros de origen antes de cerrar; no se asigna ninguna tasa automáticamente.</p>}
          {resultado && <p className={resultado.diferencia === 0 ? 'etiqueta-tipo ok' : 'pendiente'}>
            Diferencia de arqueo: <strong>{dinero(resultado.diferencia, resumen.moneda)}</strong> {resultado.diferencia === 0 ? '(cuadra)' : '(revisar faltante o sobrante)'}
          </p>}
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Origen</th><th>Detalle</th><th className="num">Entrada</th><th className="num">Salida</th><th>Estado</th></tr></thead>
              <tbody>
                {resumen.registros.map((r,i) => <tr key={r.origen + ':' + r.id + ':' + i}>
                  <td>{r.origen}</td><td>{r.detalle}</td>
                  <td className="num">{r.estado === 'ok' && r.signo === 1 ? dinero(r.importe, resumen.moneda) : '—'}</td>
                  <td className="num">{r.estado === 'ok' && r.signo === -1 ? dinero(r.importe, resumen.moneda) : '—'}</td>
                  <td>{r.estado === 'ok' ? 'Registrado' : r.estado === 'sin_tasa' ? 'Falta tasa' : 'Importe inválido'}</td>
                </tr>)}
                {!resumen.registros.length && <tr><td colSpan={5} className="vacio">No hay movimientos de efectivo para este día y método.</td></tr>}
              </tbody>
            </table>
          </div>
          <Campo label="Nota del arqueo (opcional)" valor={nota} onCambio={setNota} placeholder="Observaciones o diferencias de caja" />
          {cierreAnterior && <p className="pendiente">Ya existe un cierre de este día y método. Este cálculo muestra los registros actuales; el cierre histórico se conserva sin sobrescribirlo.</p>}
          {(error || fallo) && <p className="pendiente" role="alert">{error || fallo}</p>}
          <button disabled={ocupado || !!cierreAnterior || !resultado || !!faltantes.length} onClick={cerrar}>
            {ocupado ? 'Guardando…' : 'Registrar cierre de caja'}
          </button>
        </>}
      </div>
      <div className="tarjeta tabla-scroll">
        <h2>Historial de arqueos</h2>
        <table>
          <thead><tr><th>Fecha</th><th>Cuenta</th><th className="num">Inicial</th><th className="num">Esperado</th><th className="num">Contado</th><th className="num">Diferencia</th><th>Nota</th></tr></thead>
          <tbody>
            {(cierres || []).map(c => <tr key={c.id}>
              <td>{formatoFecha(c.fecha)}</td><td>{c.metodo}</td>
              <td className="num">{dinero(c.inicial,c.moneda)}</td>
              <td className="num">{dinero(c.esperado,c.moneda)}</td>
              <td className="num">{dinero(c.contado,c.moneda)}</td>
              <td className="num">{dinero(c.diferencia,c.moneda)}</td><td>{c.nota || '—'}</td>
            </tr>)}
            {!cierres?.length && <tr><td colSpan={7} className="vacio">Todavía no hay cierres registrados.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
