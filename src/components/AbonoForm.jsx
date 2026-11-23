import { useId, useRef, useState } from 'react'
import { codigoPedido } from '../db.js'
import { guardarCobro } from '../nube.js'
import { calcularCobro } from '../lib/cobros.js'
import { resumenSaldoPedido } from '../lib/cuentas-cobrar.js'
import { bs, fecha, hoy, usd } from '../lib/format.js'
import { monedaMetodoPago } from '../lib/pagos.js'
import { BANCOS_VENEZUELA } from '../lib/tasas-lote.js'
import TasaOperacion from './TasaOperacion.jsx'
import { Campo, Modal, Selector } from './ui.jsx'

export default function AbonoForm({ pedido, metodos, rapido = false, onCerrar, onGuardado }) {
  const resumen = resumenSaldoPedido(pedido)
  const saldo = resumen?.pendiente
  const metodoInicial = rapido ? '' : metodos[0]?.nombre || ''
  const [saldoVisto, setSaldoVisto] = useState(saldo)
  const [modo, setModo] = useState(rapido ? 'completo' : 'libre')
  const [a, setA] = useState(() => ({
    fecha: hoy(), metodo: metodoInicial, moneda: '',
    importePago: !rapido && monedaMetodoPago(metodoInicial) === 'USD' && saldo > 0 ? String(saldo) : '',
    banco: '', nota: '', tasa: null, tipoTasa: 'bcv_usd', tasaDetalle: null,
  }))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const enviando = useRef(false)
  const operacion = useRef(null)
  const bancosId = useId()
  const monedaFija = monedaMetodoPago(a.metodo)
  const monedaPago = monedaFija || a.moneda
  const bancoAplicable = /transferencia|pago\s*m[oó]vil|banc|dep[oó]sito|zelle/i.test(a.metodo)
  const saldoCambio = saldo !== saldoVisto
  const disponible = resumen && pedido.estado !== 'cancelado' && (!rapido || saldo > 0)
  const datos = { ...a, modo, monedaPago, banco: bancoAplicable ? a.banco : '', saldoEsperado: saldoVisto }
  let conversion
  let errorConversion
  if (disponible && !saldoCambio) {
    try {
      conversion = calcularCobro(datos, saldo)
    } catch (e) {
      errorConversion = e.message
    }
  }

  function set(campo, valor) {
    setError('')
    setA(actual => {
      const siguiente = { ...actual, [campo]: valor }
      if (campo === 'metodo') {
        siguiente.moneda = ''
        siguiente.banco = ''
      }
      if ((monedaMetodoPago(siguiente.metodo) || siguiente.moneda) !== (monedaMetodoPago(actual.metodo) || actual.moneda))
        siguiente.importePago = ''
      return siguiente
    })
  }

  async function guardar() {
    if (enviando.current || !disponible || saldoCambio) return
    if (!conversion) return setError(errorConversion)
    enviando.current = true
    setGuardando(true)
    setError('')
    try {
      operacion.current ||= crypto.randomUUID()
      const estado = await guardarCobro(pedido.id, { ...datos, idOperacion: operacion.current })
      onGuardado?.(estado)
      onCerrar()
    } catch (e) {
      setError(e.message)
      enviando.current = false
      setGuardando(false)
    }
  }

  return (
    <Modal titulo={rapido ? 'Cobrar pedido' : 'Registrar pago'} onCerrar={() => { if (!enviando.current) onCerrar() }}>
      <p><strong>{codigoPedido(pedido.numero)}</strong> · {pedido.cliente || 'Sin cliente'}</p>
      {resumen && <p>Total: <strong>{usd(resumen.total)}</strong> · Abonos: {usd(resumen.cobrado)} · Saldo pendiente: <strong>{usd(saldo)}</strong></p>}
      {rapido && Boolean(pedido.abonos?.length) && <details>
        <summary>Ver abonos anteriores</summary>
        <ul>{pedido.abonos.map((abono, i) => <li key={abono.idOperacion || i}>
          {fecha(abono.fecha)} · {abono.metodo || 'Sin método'} · {usd(abono.monto)}
          {abono.anulado && ' · Anulado'}
        </li>)}</ul>
      </details>}
      {!disponible ? <p role="alert" className="pendiente">
        {resumen ? 'Este pedido ya no admite este cobro.' : 'Revisa los importes del pedido en su detalle antes de cobrar.'}
      </p> : <>
        {saldoCambio && <div role="alert" className="avisos">
          <p>El saldo cambió. Revisa el nuevo importe antes de confirmar.</p>
          <button type="button" className="sec mini" onClick={() => { setSaldoVisto(saldo); setError('') }}>Usar saldo actualizado</button>
        </div>}
        <div className="fila">
          {rapido && <Selector label="Tipo de cobro" valor={modo} onCambio={v => { setModo(v); setError('') }} opciones={[
            { value: 'completo', label: 'Cobrar saldo completo' }, { value: 'parcial', label: 'Registrar abono parcial' },
          ]} />}
          <Campo label="Fecha del cobro" tipo="date" valor={a.fecha} onCambio={v => set('fecha', v)} />
          <Selector label="Método de pago" valor={a.metodo} vacio="Elige un método"
            onCambio={v => set('metodo', v)} opciones={metodos.map(m => ({ value: m.nombre, label: m.nombre }))} />
          {a.metodo && !monedaFija && <Selector label="Moneda del pago" valor={a.moneda} vacio="Elige USD o Bs"
            onCambio={v => set('moneda', v)} opciones={[{ value: 'USD', label: 'USD' }, { value: 'Bs', label: 'Bs' }]} />}
          {monedaFija && <p className="ayuda">Moneda del pago: <strong>{monedaFija}</strong></p>}
          {modo !== 'completo' && monedaPago && <Campo label={`Importe (${monedaPago})`} inputMode="decimal"
            valor={a.importePago} onCambio={v => set('importePago', v)} />}
          {bancoAplicable && <Campo label="Banco (opcional)" valor={a.banco} onCambio={v => set('banco', v)} list={bancosId} />}
          {bancoAplicable && <datalist id={bancosId}>{BANCOS_VENEZUELA.map(b => <option key={b.nombre} value={b.nombre} />)}</datalist>}
        </div>
        {monedaPago && <TasaOperacion valor={a} fecha={a.fecha} opcional={monedaPago !== 'Bs'}
          onCambio={cambios => { setError(''); setA(actual => ({ ...actual, ...cambios })) }} />}
        {conversion && <p aria-live="polite">Importe del cobro: <strong>{monedaPago === 'Bs' ? bs(conversion.importePago) : usd(conversion.importePago)}</strong>
          {monedaPago === 'Bs' && <> · Equivalente: <strong>{usd(conversion.monto)}</strong></>}
          {monedaPago === 'USD' && conversion.montoBs != null && <> · Equivalente: <strong>{bs(conversion.montoBs)}</strong></>}
        </p>}
        <Campo label="Nota (opcional)" valor={a.nota} onCambio={v => set('nota', v)} placeholder="N.º de referencia" />
      </>}
      {error && <p className="pendiente" role="alert">{error}</p>}
      <div className="modal-pie">
        <button className="sec" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button onClick={guardar} disabled={guardando || !disponible || saldoCambio}>
          {guardando ? 'Guardando…' : rapido ? 'Confirmar cobro' : 'Guardar pago'}
        </button>
      </div>
    </Modal>
  )
}
