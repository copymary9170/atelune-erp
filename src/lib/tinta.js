// Estimación de tinta a partir de un archivo (imagen o PDF).
//
// 1) Se mide la COBERTURA: qué fracción de la hoja lleva cada tinta (cian, magenta,
//    amarillo, negro), convirtiendo cada píxel de RGB a CMYK.
// 2) Se convierte a mililitros con el rendimiento de la impresora: los fabricantes
//    publican cuántas páginas rinde una botella con 5 % de cobertura (norma ISO).
//
// Es una ESTIMACIÓN: el consumo real cambia con el modo de calidad, el papel, el
// controlador de la impresora y las limpiezas de cabezal.

export const CANALES = [
  ['c', 'Cian'], ['m', 'Magenta'], ['y', 'Amarillo'], ['k', 'Negro'],
]
export const COBERTURA_ISO = 0.05
export const AREA_CARTA = 612 * 792 // puntos PDF (8,5 × 11 pulgadas)

/** datos: RGBA (Uint8ClampedArray de un canvas). Devuelve la cobertura media de cada canal, de 0 a 1. */
export function coberturaCMYK(datos) {
  let c = 0, m = 0, y = 0, k = 0
  const px = datos.length / 4
  for (let i = 0; i < datos.length; i += 4) {
    const a = datos[i + 3] / 255
    // Lo transparente se imprime como papel blanco.
    const r = (datos[i] * a + 255 * (1 - a)) / 255
    const g = (datos[i + 1] * a + 255 * (1 - a)) / 255
    const b = (datos[i + 2] * a + 255 * (1 - a)) / 255
    const kk = 1 - Math.max(r, g, b)
    k += kk
    if (kk < 1) {
      c += 1 - r - kk
      m += 1 - g - kk
      y += 1 - b - kk
    }
  }
  return px ? { c: c / px, m: m / px, y: y / px, k: k / px } : { c: 0, m: 0, y: 0, k: 0 }
}

/** ml necesarios para cubrir una hoja carta al 100 % con un canal, según el rendimiento del fabricante. */
export function mlPorCartaLlena(canal) {
  const ml = Number(canal?.mlBotella), pag = Number(canal?.paginas)
  if (!(ml > 0) || !(pag > 0)) return null
  return ml / (pag * COBERTURA_ISO)
}

/**
 * paginas: [{ cobertura: {c,m,y,k}, areaCartas }] (areaCartas = tamaño impreso respecto a una carta).
 * Devuelve por canal: { cobertura (media ponderada), ml (o null si falta el rendimiento), productoId }.
 */
export function estimarTinta(paginas, perfil) {
  const area = paginas.reduce((s, p) => s + p.areaCartas, 0)
  const r = {}
  for (const [canal] of CANALES) {
    const cartasLlenas = paginas.reduce((s, p) => s + p.cobertura[canal] * p.areaCartas, 0)
    const ml100 = mlPorCartaLlena(perfil?.canales?.[canal])
    r[canal] = {
      cobertura: area ? cartasLlenas / area : 0,
      ml: ml100 == null ? null : cartasLlenas * ml100,
      productoId: perfil?.canales?.[canal]?.productoId || null,
    }
  }
  return r
}
