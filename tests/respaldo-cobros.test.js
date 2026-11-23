import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoErrorCobro, generarRespaldoCobros } from '../src/lib/respaldo-cobros.js'

const uid = '00000000-0000-0000-0000-000000000001'
const operacion = '00000000-0000-0000-0000-000000000002'
const abono = { fecha: '2026-11-23', monto: 10.03, montoBs: 401.01, monedaPago: 'Bs', importePago: 401.01,
  metodo: 'Transferencia', banco: 'Banco ficticio', tasa: 40, saldoAntes: 50, saldoDespues: 39.97,
  registradoEn: '2026-11-23T16:00:00.000Z', idOperacion: operacion,
  tasaDetalle: { fuente: 'Ensayo', fecha: '2026-11-23', usdPorUnidad: 1, efectivaBsPorUsd: 40,
    urlFuente: 'https://ejemplo.invalid/tasa?moneda=USD' } }

test('exporta el cobro y la anulación antigua sin alterar las solicitudes válidas', () => {
  const cobro = { operacion, pedidoId: 1, tipo: 'cobro', version: 7, solicitud: { modo: 'parcial', saldoEsperado: 50, abono } }
  const anulacion = { operacion: '00000000-0000-0000-0000-000000000003', pedidoId: 2, tipo: 'anulacion', version: null,
    estado: 'conflicto', codigoError: 'PT409', solicitud: { indice: 0, anterior: { ...abono, idOperacion: undefined }, motivo: 'Ensayo' } }
  const archivo = generarRespaldoCobros(uid, [cobro, anulacion])
  assert.equal(archivo.formato, 'atelune-respaldo-cobros')
  assert.equal(archivo.propietario, uid)
  assert.deepEqual(archivo.operaciones[0], { ...cobro, estado: 'pendiente', solicitudCompleta: true })
  assert.deepEqual(archivo.operaciones[1], { ...JSON.parse(JSON.stringify(anulacion)), solicitudCompleta: true })
})

test('omite credenciales en campos desconocidos, textos y enlaces y advierte una solicitud incompleta', () => {
  const sospechoso = { ...abono, nota: 'password: valor-ficticio', access_token: 'token-omitido',
    tasaDetalle: { ...abono.tasaDetalle, urlFuente: 'https://ejemplo.invalid/tasa?key=clave-omitida' } }
  const copia = generarRespaldoCobros(uid, [{ operacion, pedidoId: 2, tipo: 'anulacion', version: null,
    solicitud: { indice: 0, anterior: sospechoso, motivo: 'Ensayo sb_secret_Omitido', session: { clave: 'omitida' } } }])
  const [fila] = copia.operaciones
  assert.equal(fila.solicitudCompleta, false)
  assert.equal(fila.solicitud.anterior.montoBs, 401.01)
  assert.doesNotMatch(JSON.stringify(copia), /omitid[oa]|valor-ficticio|access_token|session/i)
})

test('clasifica los rechazos definitivos y conserva pendiente una respuesta incierta', () => {
  assert.equal(estadoErrorCobro('PT409'), 'conflicto')
  for (const codigo of ['P0002','22023','22008','22P02']) assert.equal(estadoErrorCobro(codigo), 'conciliacion')
  for (const codigo of ['PGRST202','40001','',undefined]) assert.equal(estadoErrorCobro(codigo), 'pendiente')
})
