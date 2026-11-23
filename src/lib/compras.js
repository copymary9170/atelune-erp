import { centavosMoneda as centavosFactura, monedaMetodoPago } from './pagos.js'

const monedas = ['USD', 'Bs']
export { centavosFactura }

const enCentavos = (valor, mensaje) => {
  const centavos = centavosFactura(valor)
  if (centavos == null) throw new Error(mensaje)
  return centavos
}

function convertirCentavos(centavos, factor) {
  const convertido = centavos * factor
  const redondeado = Math.round(convertido + Math.min(1e-7, Math.abs(convertido) * Number.EPSILON))
  if (!Number.isSafeInteger(redondeado)) throw new Error('El importe convertido es demasiado grande.')
  return redondeado
}

export function requiereMonedaPago(metodo) {
  return Boolean(metodo && metodo !== 'credito' && metodo !== 'aporte' && !monedaMetodoPago(metodo))
}

function repartirCentavos(importes, delivery, igual) {
  const suma = importes.reduce((total, importe) => total + importe, 0)
  if (!Number.isSafeInteger(suma + delivery)) throw new Error('El total de la factura es demasiado grande.')
  const repartirIgual = igual || suma === 0
  const base = BigInt(repartirIgual ? importes.length : suma)
  const partes = importes.map(importe => Number(BigInt(delivery) * BigInt(repartirIgual ? 1 : importe) / base))
  partes[partes.length - 1] += delivery - partes.reduce((total, parte) => total + parte, 0)
  return partes
}

export function calcularCompra({ importes, delivery, reparto, monedaFactura, pagadoCon, monedaPago, tasa }) {
  if (!monedas.includes(monedaFactura)) throw new Error('Selecciona la moneda de la factura.')
  if (!importes.length) throw new Error('Agrega al menos un material.')
  const monedaFija = monedaMetodoPago(pagadoCon)
  if (monedaFija && monedaPago && monedaFija !== monedaPago)
    throw new Error('La moneda del pago debe coincidir con el método elegido.')
  const pago = monedaFija || (requiereMonedaPago(pagadoCon) ? monedaPago : null)
  if (requiereMonedaPago(pagadoCon) && !monedas.includes(pago))
    throw new Error('Indica si el pago fue en USD o en Bs.')

  const usaTasa = monedaFactura === 'Bs' || pago === 'Bs' || (tasa != null && tasa !== '')
  const tasaValida = Number(tasa)
  if (usaTasa && (!Number.isFinite(tasaValida) || tasaValida <= 0))
    throw new Error('Indica una tasa válida en Bs por USD para convertir esta compra.')

  const costos = importes.map(importe => enCentavos(importe, 'Escribe el importe de cada material con hasta dos decimales.'))
  const envio = enCentavos(delivery === '' ? 0 : delivery ?? 0, 'Escribe el delivery con hasta dos decimales.')
  const partes = repartirCentavos(costos, envio, reparto === 'igual')
  let factura = 0, usdPrevio = 0, bsPrevio = usaTasa ? 0 : null

  // Las diferencias se asignan entre renglones sobre el total acumulado.
  // Así los renglones en cada moneda suman exactamente el total convertido.
  const lineas = costos.map((material, i) => {
    factura += material + partes[i]
    const usdActual = monedaFactura === 'USD' ? factura : convertirCentavos(factura, 1 / tasaValida)
    const bsActual = monedaFactura === 'Bs' ? factura : usaTasa ? convertirCentavos(factura, tasaValida) : null
    const costoTotalUsd = (usdActual - usdPrevio) / 100
    const equivalenteBs = bsActual == null ? null : (bsActual - bsPrevio) / 100
    usdPrevio = usdActual
    bsPrevio = bsActual
    return {
      monedaFactura, importeMaterial: material / 100, delivery: partes[i] / 100,
      totalFactura: (material + partes[i]) / 100, costoTotalUsd, equivalenteBs, monedaPago: pago,
      importePago: pago === 'Bs' ? equivalenteBs : pago === 'USD' ? costoTotalUsd : null,
    }
  })

  return {
    lineas, totalFactura: factura / 100, totalUsd: usdPrevio / 100,
    totalBs: bsPrevio == null ? null : bsPrevio / 100, monedaPago: pago,
  }
}
