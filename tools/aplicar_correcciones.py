from pathlib import Path
def edit(name, old, new):
 p=Path(name); s=p.read_text(encoding="utf8")
 if old not in s: raise SystemExit(f"Falta patrón en {name}: {old[:65]}")
 p.write_text(s.replace(old,new),encoding="utf8")
edit("src/lib/calc.js","  if (cant <= 0 && tipo !== 'ajuste') throw new Error('La cantidad debe ser mayor que cero.')","  if (!Number.isFinite(Number(cantidad)) || cant < 0 || (cant === 0 && tipo !== 'ajuste')) throw new Error('Cantidad inválida.')")
edit("src/lib/calc.js","    const cu = n(costoUnitario)\n    const nuevoStock","    if (costoUnitario == null || !Number.isFinite(Number(costoUnitario)) || Number(costoUnitario) < 0) throw new Error('Costo unitario inválido.')\n    const cu = n(costoUnitario)\n    const nuevoStock")
edit("src/lib/calc.js","  if (tipo === 'salida' || tipo === 'merma') {\n    return","  if (tipo === 'salida' || tipo === 'merma') {\n    if (cant > stock + 0.0000001) throw new Error('Stock insuficiente.')\n    return")
edit("src/lib/calc.js","export const totalAbonos = (pedido) => (pedido.abonos || []).reduce((s, a) => s + n(a.monto), 0)","export const totalAbonos = (pedido) => (pedido.abonos || []).filter(a => !a.anulado).reduce((s, a) => s + n(a.monto), 0)")
edit("src/lib/contabilidad.js","(p.abonos || []).filter((a) => !(fEntrega && a.fecha >= fEntrega))","(p.abonos || []).filter((a) => !a.anulado && !(fEntrega && a.fecha >= fEntrega))")
edit("src/lib/contabilidad.js","for (const a of p.abonos || []) {","for (const a of (p.abonos || []).filter(a => !a.anulado)) {")
edit("src/db.js","export async function registrarMovimiento({ productoId, tipo, cantidad, costoUnitario, fecha, referencia, nota, pedidoId, proveedorId, pagadoCon })","export async function registrarMovimiento({ productoId, tipo, cantidad, costoUnitario, fecha, referencia, nota, pedidoId, proveedorId, pagadoCon, origen })")
edit("src/db.js","      pagadoCon: pagadoCon ?? null,","      pagadoCon: pagadoCon ?? null,\n      origen: origen ?? null,")
edit("src/db.js","  if (datos?.app !== 'atelune-erp') throw new Error('El archivo no es un respaldo de Atelune.')\n  await db.transaction","  validarRespaldo(datos)\n  await db.transaction")
edit("src/db.js","export async function importarRespaldo(datos) {","""// Validación previa a la restauración; compatible con tablas ausentes en respaldos antiguos.
export function validarRespaldo(datos) {
  if (!datos || datos.app !== 'atelune-erp' || datos.version !== 1) throw new Error('Respaldo incompatible.')
  if (!Array.isArray(datos.config) || !datos.config.some(c => c?.id === 'general')) throw new Error('Falta configuración general.')
  for (const t of TABLAS) if (Object.hasOwn(datos,t) &&
    (!Array.isArray(datos[t]) || datos[t].length > 100000 || datos[t].some(x => !x || typeof x !== 'object' || Array.isArray(x))))
    throw new Error('Tabla inválida: ' + t)
  return true
}
export async function importarRespaldo(datos) {""")
edit("src/db.js","tipo: 'salida', cantidad: c.cantidad, referencia: ref, nota: 'Consumo de producción', pedidoId: id","tipo: 'salida', cantidad: c.cantidad, referencia: ref, nota: 'Consumo de producción', pedidoId: id, origen: 'consumo_produccion'")
edit("src/db.js","filter((m) => m.tipo === 'salida' && !m.devuelto)","filter((m) => m.tipo === 'salida' && !m.devuelto && (m.origen === 'consumo_produccion' || (!m.origen && m.nota === 'Consumo de producción' && m.referencia === ref)))")
edit("src/db.js","nota: 'Devolución por cancelación', pedidoId: id","nota: 'Devolución por cancelación', pedidoId: id, origen: 'reversion_consumo'")
edit("src/pages/Pedidos.jsx",'''<td>{fecha(a.fecha)}<div className="desglose">{a.metodo}{a.nota && ' · ' + a.nota}</div></td>''','''<td>{fecha(a.fecha)}{a.anulado && <span className="etiqueta-tipo bajo">Anulado</span>}<div className="desglose">{a.metodo}{a.nota && ' · ' + a.nota}{a.anulado && a.motivoAnulacion && ' · Motivo: ' + a.motivoAnulacion}</div></td>''')
edit("src/pages/Pedidos.jsx",'''<td className="num"><button className="peligro mini" onClick={() => confirm('¿Eliminar este pago?') && actualizar({ abonos: p.abonos.filter((_, j) => j !== i) })}>×</button></td>''','''<td className="num">{!a.anulado && <button className="peligro mini" onClick={async () => { const motivo = prompt('Motivo de anulación del pago:'); if (!motivo?.trim()) return; await db.transaction('rw',db.pedidos,async () => { const actual = await db.pedidos.get(p.id); const abonos = [...(actual.abonos || [])]; if (abonos[i]?.anulado) return; abonos[i] = {...abonos[i], anulado:true, motivoAnulacion:motivo.trim().slice(0,300), fechaAnulacion:new Date().toISOString()}; await db.pedidos.update(p.id,{abonos}) }) }}>Anular</button>}</td>''')
edit("src/pages/Pedidos.jsx","if (!(n(a.monto) > 0)) return alert('Escribe el monto en $.')\n    await db.pedidos.update(pedido.id, { abonos: [...(pedido.abonos || []), a] })","if (!(n(a.monto) > 0) || !Number.isFinite(Number(a.monto))) return alert('Monto inválido.')\n    if (!a.metodo) return alert('Selecciona método de pago.')\n    await db.transaction('rw', db.pedidos, async () => { const actual = await db.pedidos.get(pedido.id); if (!actual || actual.estado === 'cancelado') throw new Error('Pedido cancelado'); await db.pedidos.update(pedido.id, { abonos: [...(actual.abonos || []), {...a, registradoEn:new Date().toISOString()}] }) })")
edit("src/pages/Pedidos.jsx","{usd(a.monto)}{a.tasa ?","{a.anulado ? <s>{usd(a.monto)}</s> : usd(a.monto)}{a.tasa ?")
Path("REVISION_SEGURIDAD.md").write_text("""# Auditoría y precauciones
- Solo se revierten salidas automáticas de producción. Las mermas manuales no se restituyen. La cancelación implica que el material reingresó físicamente.
- No se permite salida de inventario por encima de las existencias registradas.
- Los pagos anulados permanecen visibles, pero se excluyen de los saldos y de los asientos reconstruidos. No constituye un registro inmutable de auditoría.
- Los respaldos se validan antes de reemplazar las tablas; **descargar un respaldo verificado** antes de restaurar.
- La sincronización real con Supabase y los cambios entre distintas cuentas requieren pruebas específicas antes de habilitar uso multiusuario.
""",encoding="utf8")
