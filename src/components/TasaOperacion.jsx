import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { Campo, Selector } from './ui.jsx'
import { TIPOS_TASA, crearDetalleTasa, seleccionarTasa } from '../lib/tasas-multiples.js'
import { bs } from '../lib/format.js'

// Componente controlado: solo usa la tasa guardada al pulsar explícitamente "Usar".
// Las operaciones históricas conservan su tasa efectiva y el detalle congelado.
export default function TasaOperacion({ valor, onCambio, fecha, montoUsd, opcional = true }) {
  const registros = useLiveQuery(() => db.tasas.toArray(), [], [])
  const tipo = valor.tipoTasa || valor.tasaDetalle?.tipo ||
    (valor.tasa != null ? 'legado' : 'bcv_usd')
  const d = valor.tasaDetalle
  const borrador = valor.tasaBorrador || {}
  const tasaCapturada = borrador.tasa ?? (d?.tipo === tipo ? d.bsPorUnidad : (tipo === 'legado' ? valor.tasa : ''))
  const unidad = TIPOS_TASA[tipo]?.unidad || 'USD'
  const usdPorUnidad = borrador.usdPorUnidad ?? (d?.tipo === tipo ? d.usdPorUnidad : '')
  const entidad = borrador.entidad ?? (d?.tipo === tipo ? d.entidad : '')
  const sentido = borrador.sentido ?? (d?.tipo === tipo ? d.sentido : 'compra')
  const comisionPct = borrador.comisionPct ?? (d?.tipo === tipo ? d.comisionPct : 0)
  const tasaRegistrada = seleccionarTasa(registros || [], tipo, fecha || '9999-12-31')
  const campos = {
    tasa: tasaCapturada, usdPorUnidad, entidad, sentido, comisionPct,
    referenciaId: borrador.referenciaId ?? null,
    fechaReferencia: borrador.fechaReferencia ?? null,
    horaReferencia: borrador.horaReferencia ?? null,
  }

  function actualizarTipo(nuevo) {
    onCambio({ tipoTasa: nuevo, tasa: null, tasaDetalle: null, tasaBorrador: {} })
  }
  function actualizarCampo(campo, v) {
    const siguiente = { ...campos, [campo]: v }
    // Si se cambia la tasa Bs original ya no se debe atribuir a la referencia.
    if (campo === 'tasa') {
      siguiente.referenciaId = null
      siguiente.fechaReferencia = null
      siguiente.horaReferencia = null
    }
    // La tasa efectiva solo existe cuando la conversión es completa.
    let detalle = null
    try {
      detalle = crearDetalleTasa({
        tipo, ...siguiente,
        fecha: siguiente.fechaReferencia || fecha,
        hora: siguiente.horaReferencia,
        referenciaId: siguiente.referenciaId,
      })
    } catch {}
    onCambio({ tipoTasa: tipo, tasa: detalle?.efectivaBsPorUsd ?? null,
      tasaDetalle: detalle, tasaBorrador: siguiente })
  }
  function usarRegistrada() {
    if (!tasaRegistrada) return
    const elegidos = {
      tasa: tasaRegistrada.tasa,
      usdPorUnidad: tasaRegistrada.usdPorUnidad ?? '',
      entidad: tasaRegistrada.entidad || '',
      sentido: tasaRegistrada.sentido || 'compra',
      comisionPct: tasaRegistrada.comisionPct ?? 0,
      referenciaId: tasaRegistrada.id,
      fechaReferencia: tasaRegistrada.fecha,
      horaReferencia: tasaRegistrada.hora || null,
    }
    try {
      const detalle = crearDetalleTasa({
        tipo, ...elegidos,
        fecha: tasaRegistrada.fecha,
        hora: tasaRegistrada.hora,
        referenciaId: tasaRegistrada.id,
      })
      onCambio({ tipoTasa: tipo, tasa: detalle.efectivaBsPorUsd,
        tasaDetalle: detalle, tasaBorrador: {} })
    } catch {
      // Si la referencia EUR/USDT aún no tiene equivalencia USD, copiar
      // la tasa observada y pedir que se complete SIN inventar una paridad.
      onCambio({ tipoTasa: tipo, tasa: null, tasaDetalle: null,
        tasaBorrador: elegidos })
    }
  }

  return <div className="subtabla">
    <div className="fila">
      <Selector label="Tipo de tasa utilizada" valor={tipo} onCambio={actualizarTipo}
        opciones={[
          ...(tipo === 'legado' ? [{ value: 'legado', label: 'Histórica sin fuente (conservada)' }] : []),
          ...Object.entries(TIPOS_TASA).map(([value, v]) => ({ value, label: v.nombre })),
        ]} />
      <Campo label={'Tasa aplicada (Bs/' + unidad + ')'} tipo="number" valor={tasaCapturada}
        disabled={tipo === 'legado'} onCambio={v => actualizarCampo('tasa', v)} />
      {tipo !== 'legado' && tipo !== 'personalizada' && <div className="campo auto">
        <label>Última tasa registrada</label>
        <button className="sec mini" type="button" disabled={!tasaRegistrada} onClick={usarRegistrada}>
          {tasaRegistrada ? 'Usar ' + tasaRegistrada.fecha : 'No hay tasa de este tipo'}
        </button>
      </div>}
    </div>
    {(tipo === 'bcv_eur' || tipo === 'usdt') && <div className="fila">
      <Campo label={'Equivalencia: USD por 1 ' + unidad} tipo="number" valor={usdPorUnidad}
        onCambio={v => actualizarCampo('usdPorUnidad', v)} />
      <p className="ayuda">Necesaria para convertir montos base USD a Bs. No se supone que 1 {unidad} equivale a 1 USD.</p>
    </div>}
    {tipo === 'menudeo' && <div className="fila">
      <Campo label="Banco o entidad" valor={entidad} onCambio={v => actualizarCampo('entidad', v)} />
      <Selector label="Operación bancaria" valor={sentido} onCambio={v => actualizarCampo('sentido', v)}
        opciones={[{ value: 'compra', label: 'Compras divisas' }, { value: 'venta', label: 'Vendes divisas' }]} />
      <Campo label="Comisión informativa (%)" tipo="number" valor={comisionPct} onCambio={v => actualizarCampo('comisionPct', v)} />
    </div>}
    {valor.tasa != null && Number(valor.tasa) > 0
      ? <p className="ayuda">Tasa efectiva congelada: <strong>{Number(valor.tasa).toFixed(4)} Bs/USD</strong>.
        {montoUsd != null && Number.isFinite(Number(montoUsd)) ? ' Equivalente: ' + bs(Number(valor.tasa) * Number(montoUsd)) : ''}
        {tipo === 'legado' ? ' Registro antiguo: la fuente no está identificada. Selecciona un tipo para registrar otra tasa; el valor histórico se conserva mientras tanto.' : ''}
      </p>
      : <p className={opcional ? 'ayuda' : 'pendiente'}>{opcional
        ? 'Sin tasa Bs aplicada. Puedes dejarla vacía si esta operación es exclusivamente en USD.'
        : 'Falta una tasa válida para registrar esta operación en Bs.'}</p>}
    {!opcional && !(Number(valor.tasa) > 0) && <p className="pendiente">Necesitas registrar una tasa válida para esta operación en Bs.</p>}
  </div>
}
