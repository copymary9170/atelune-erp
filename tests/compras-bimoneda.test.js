import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularCompra, centavosFactura } from '../src/lib/compras.js'

test('lee montos en formato venezolano o con punto decimal y rechaza importes ambiguos', () => {
  for (const importe of ['1.234,50', '1,234.50', '1234,5', 1234.5])
    assert.equal(centavosFactura(importe), 123450)
  for (const importe of ['', '1.234', '1,234', '12,3456', '-2', true, Infinity])
    assert.equal(centavosFactura(importe), null)
  assert.equal(centavosFactura('0,00'), 0)
})

test('factura y pago se convierten independientemente en las cuatro combinaciones', () => {
  const casos = [
    ['Bs', 'Efectivo Bs', 400, 40, 'Bs', 10, 400],
    ['USD', 'Efectivo $', 10, null, 'USD', 10, 10],
    ['Bs', 'Efectivo $', 400, 40, 'USD', 10, 10],
    ['USD', 'Efectivo Bs', 10, 40, 'Bs', 10, 400],
  ]
  for (const [monedaFactura, pagadoCon, importe, tasa, monedaPago, usd, pago] of casos) {
    const compra = calcularCompra({ monedaFactura, pagadoCon, importes: [importe], tasa })
    assert.equal(compra.totalFactura, importe)
    assert.equal(compra.totalUsd, usd)
    assert.equal(compra.monedaPago, monedaPago)
    assert.equal(compra.lineas[0].importePago, pago)
  }
})

test('un pago genérico necesita moneda y las operaciones en Bs necesitan una conversión explícita', () => {
  const base = { monedaFactura: 'USD', pagadoCon: 'Transferencia', importes: [10] }
  assert.throws(() => calcularCompra(base), /moneda|pago/)
  assert.throws(() => calcularCompra({ ...base, monedaPago: 'Bs' }), /tasa válida/)
  assert.equal(calcularCompra({ ...base, monedaPago: 'Bs', tasa: 40 }).totalBs, 400)
  assert.throws(() => calcularCompra({ ...base, pagadoCon: 'Efectivo Bs', monedaPago: 'USD', tasa: 40 }), /coincidir/)
  assert.throws(() => calcularCompra({ ...base, monedaFactura: 'Bs', pagadoCon: 'credito' }), /tasa válida/)
  const credito = calcularCompra({ ...base, monedaFactura: 'Bs', pagadoCon: 'credito', tasa: 40 })
  assert.equal(credito.monedaPago, null)
  assert.equal(credito.lineas[0].importePago, null)
})

test('tres materiales y delivery conservan factura, pago y costo USD hasta el centavo', () => {
  const compra = calcularCompra({
    monedaFactura: 'Bs', pagadoCon: 'Efectivo $', tasa: 37.33,
    importes: ['100,03', '50,02', '50,01'], delivery: '10,01',
  })
  assert.deepEqual(compra.lineas.map(l => l.delivery), [5, 2.5, 2.51])
  assert.equal(compra.totalFactura, 210.07)
  assert.equal(compra.totalUsd, 5.63)
  const sumaCentavos = campo => compra.lineas.reduce((total, l) => total + Math.round(l[campo] * 100), 0)
  assert.equal(sumaCentavos('costoTotalUsd'), 563)
  assert.equal(sumaCentavos('equivalenteBs'), 21007)
  assert.equal(sumaCentavos('importePago'), 563)

  const inversa = calcularCompra({ monedaFactura: 'USD', pagadoCon: 'Efectivo Bs',
    importes: [0.01, 0.01, 0.01], tasa: 32.6, delivery: 0.01, reparto: 'igual' })
  assert.deepEqual(inversa.lineas.map(l => l.importePago), [0.33, 0.32, 0.65])
  assert.equal(inversa.totalBs, 1.3)
})
