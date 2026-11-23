const camposAbono = ['fecha', 'monto', 'montoBs', 'monedaPago', 'importePago', 'metodo', 'banco', 'tasa',
  'tipoTasa', 'nota', 'idOperacion', 'saldoAntes', 'saldoDespues', 'registradoEn', 'anulado',
  'motivoAnulacion', 'fechaAnulacion']
const camposTasa = ['tipo', 'unidad', 'bsPorUnidad', 'usdPorUnidad', 'efectivaBsPorUsd', 'fecha', 'hora',
  'entidad', 'sentido', 'comisionPct', 'referenciaId', 'origen', 'fuente', 'fuenteExterna',
  'urlFuente', 'referenciaAutomaticaId']
const credencial = /\b(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_[a-z]+_[A-Za-z0-9_-]+|bearer\s+\S+|(?:password|contraseña|api[_ -]?key|service[_ -]?role|access[_ -]?token|refresh[_ -]?token)\s*[:=]=?\s*\S+)|\/\/[^/\s]+:[^/\s]+@/i

function textoSeguro(campo, valor) {
  if (credencial.test(valor)) return false
  if (campo !== 'urlFuente' || valor === '') return true
  try {
    const url = new URL(valor)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.hash &&
      [...url.searchParams.keys()].every(k => !/(?:(?:^|_)key$|token|secret|password|auth|credential|firma|signature)/i.test(k))
  } catch { return false }
}

function conservar(origen, campos, omisiones) {
  if (!origen || typeof origen !== 'object' || Array.isArray(origen)) {
    omisiones.incompleto = true
    return {}
  }
  const resultado = {}
  for (const [campo, valor] of Object.entries(origen)) {
    if (valor === undefined) continue
    if (campos[campo] && Object.hasOwn(campos, campo) && Array.isArray(campos[campo])) {
      resultado[campo] = valor === null ? null : conservar(valor, Object.fromEntries(campos[campo].map(k => [k, true])), omisiones)
    } else if (Object.hasOwn(campos, campo) && (valor === null || typeof valor === 'boolean' ||
        Number.isFinite(valor) || (typeof valor === 'string' && textoSeguro(campo, valor)))) {
      resultado[campo] = valor
    } else {
      omisiones.incompleto = true
    }
  }
  return resultado
}

function solicitudExportable(tipo, solicitud, omisiones) {
  const campoAbono = tipo === 'anulacion' ? 'anterior' : 'abono'
  const campos = tipo === 'anulacion' ? { indice: true, motivo: true } : { modo: true, saldoEsperado: true }
  const { [campoAbono]: abono, ...datos } = solicitud || {}
  const resto = conservar(datos, campos, omisiones)
  resto[campoAbono] = conservar(abono, {
    ...Object.fromEntries(camposAbono.map(k => [k, true])), tasaDetalle: camposTasa,
  }, omisiones)
  return resto
}

export function generarRespaldoCobros(propietario, operaciones) {
  return {
    formato: 'atelune-respaldo-cobros',
    versionFormato: 1,
    propietario,
    exportadoEn: new Date().toISOString(),
    operaciones: operaciones.map(({ solicitud, ...operacion }) => {
      const omisiones = { incompleto: false }
      const fila = conservar(operacion, {
        pedidoId: true, operacion: true, tipo: true, version: true, estado: true,
        codigoError: true, revisadoEn: true, cambioEstadoEn: true,
      }, omisiones)
      const recuperable = solicitudExportable(fila.tipo, solicitud, omisiones)
      return { ...fila, estado: fila.estado || 'pendiente', solicitud: recuperable,
        solicitudCompleta: !omisiones.incompleto }
    }),
  }
}

export function estadoErrorCobro(codigo) {
  if (codigo === 'PT409') return 'conflicto'
  if (['22023','22007','22008','22P02','P0002'].includes(codigo)) return 'conciliacion'
  return 'pendiente'
}
