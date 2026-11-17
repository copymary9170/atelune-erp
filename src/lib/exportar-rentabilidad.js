// Exportación pura, legible en Excel con separador ; y BOM UTF-8.
// No altera documentos del ERP.
export function generarCsvRentabilidad(reporte) {
  const columnas = ['Pedido', 'Fecha de entrega', 'Cliente', 'Ventas trabajos USD',
    'Costo presupuestado USD', 'Utilidad presupuestada USD', 'Margen %', 'Incompleto']
  const escapar = valor => {
    const texto = valor == null ? '' : String(valor)
    // Excel/LibreOffice pueden ejecutar fórmulas incluso si el campo CSV está
    // entre comillas. Anteponer una comilla simple a valores de texto sospechosos,
    // incluyendo espacios o saltos de línea antes de =, +, - o @.
    const seguro = typeof valor === 'string' && /^[\s\uFEFF\u200B]*[=+\-@]/u.test(texto)
      ? "'" + texto : texto
    return '"' + seguro.replaceAll('"', '""') + '"'
  }
  const filas = [columnas, ...(reporte?.filas || []).map(f => [
    'PED-' + String(f.numero).padStart(4, '0'), f.fecha, f.cliente, f.venta, f.costo,
    f.utilidad, f.margenPct, f.incompleto ? 'Sí' : 'No',
  ])]
  return '\uFEFF' + filas.map(f => f.map(escapar).join(';')).join('\r\n')
}
