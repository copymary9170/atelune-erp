import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { codigoPedido, db } from '../db.js'
import { mensajeOperacion, reenviarCobroPendiente } from '../nube.js'

export default function CobrosPendientes({ pedido, pedidos = [] }) {
  const pedidoId = pedido?.id
  const filas = useLiveQuery(() => pedidoId == null ? db.cobrosPendientes.toArray() :
    db.cobrosPendientes.where('pedidoId').equals(pedidoId).toArray(), [pedidoId], [])
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  async function reenviar(id) {
    if (ocupado) return
    setOcupado(true)
    try {
      setMensaje(mensajeOperacion[await reenviarCobroPendiente(id)])
    } catch (error) {
      setMensaje(error.message)
    } finally {
      setOcupado(false)
    }
  }
  return <>
    {filas.map(p => <div className="tarjeta" key={p.pedidoId}>
      <strong>{p.tipo === 'cobro' ? 'Cobro' : 'Anulación'} pendiente · {codigoPedido(pedido?.numero ?? pedidos.find(x => x.id === p.pedidoId)?.numero ?? p.pedidoId)}</strong>
      <p>{mensajeOperacion.pendiente}</p>
      <button type="button" className="sec mini" disabled={ocupado} onClick={() => reenviar(p.pedidoId)}>Reintentar confirmación</button>
    </div>)}
    {mensaje && <p role="status">{mensaje}</p>}
  </>
}
