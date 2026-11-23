import { redondear } from './calc.js'
import { centavosMoneda, congelarConversion, monedaMetodoPago } from './pagos.js'

export function calcularCobro({ modo, metodo, monedaPago, importePago, tasa }, saldo) {
  if (!['completo', 'parcial', 'libre'].includes(modo))
    throw new Error('Selecciona el tipo de cobro.')
  if (!metodo?.trim()) throw new Error('Selecciona el método de pago.')
  const monedaFija = monedaMetodoPago(metodo)
  if (!['USD', 'Bs'].includes(monedaPago) || (monedaFija && monedaFija !== monedaPago))
    throw new Error('Indica una moneda compatible con el método de pago.')
  if (modo !== 'libre' && !(saldo > 0)) throw new Error('Este pedido ya no tiene saldo pendiente.')
  if (monedaPago === 'Bs' && (!Number.isFinite(Number(tasa)) || !(tasa > 0)))
    throw new Error('Indica una tasa válida para el cobro en bolívares.')

  const completo = modo === 'completo'
  const centavos = completo ? null : centavosMoneda(importePago)
  if (!completo && !(centavos > 0)) throw new Error('Ingresa un importe mayor que cero con hasta dos decimales.')

  const pago = completo ? saldo : centavos / 100
  const monto = !completo && monedaPago === 'Bs' ? redondear(pago / Number(tasa)) : pago
  if (!(monto > 0) || !Number.isSafeInteger(Math.round(monto * 100)))
    throw new Error('El equivalente en USD debe ser válido y mayor que cero.')
  const montoBs = !completo && monedaPago === 'Bs' ? pago : congelarConversion(monto, tasa, metodo)
  if (monedaPago === 'Bs' && !(montoBs > 0)) throw new Error('El equivalente en Bs debe ser mayor que cero.')
  if (modo === 'parcial' && monto >= saldo)
    throw new Error('El abono parcial debe ser menor al saldo. Para liquidarlo, elige «Cobrar saldo completo».')

  return { monto, montoBs, monedaPago, importePago: monedaPago === 'Bs' ? montoBs : monto }
}
