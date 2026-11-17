# Mejora: consumo real y merma por trabajo

Se añade a cada pedido el registro opcional `consumosReales`, organizado por índice del trabajo. Cada registro guarda material, unidad, cantidad útil, desperdicio, costo promedio de referencia al registrar, nota y fecha.

Se compara el consumo observado con la cantidad base presupuestada por trabajo (sin merma) y se advierten valores desconocidos. **No genera movimientos de inventario ni modifica costos contables, caja o reparto.** La ficha de rentabilidad presenta este costo observado de forma separada para evitar duplicarlo con los costos presupuestados.

Limitaciones: costos promedio actuales usados como referencia al registrar, no costos de lote históricos; el registro no prueba consumo exhaustivo; vinculación por posición de trabajo (en pedidos los trabajos no se reordenan); sin conciliación de inventario. Para una próxima fase, introducir lotes de consumo y conciliación contra movimientos con pruebas de idempotencia.
