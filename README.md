# Atelune · Administración

Aplicación web para administrar Atelune: papelería creativa, impresión, impresión 3D, impresión comestible, sublimación (incluida neón), grabado láser, vinil, manualidades y diseño.

## Qué incluye (etapa 1)

- **Cotizador automático**: suma materiales (con merma), uso de máquinas, mano de obra, otros costos y costos fijos prorrateados; aplica el margen por línea de servicio, los descuentos, el envío, la comisión del método de pago y el IVA. Muestra el total en $ y en Bs, y la cotización se puede imprimir o guardar como PDF.
- **Plantillas de trabajo**: la «receta» de cada trabajo que se repite, para cotizarlo en segundos.
- **Inventario (kardex)**: productos de reventa, materias primas, insumos y productos terminados; conversión entre la unidad de compra y la unidad de uso; costo promedio ponderado; alertas de stock bajo.
- **Activos y máquinas**: depreciación en línea recta, valor en libros y costo por hora de cada máquina.
- **Tasa de cambio** diaria (Bs/$).
- **Configuración** y **respaldo** (descargar y restaurar).

## Próximas etapas

Pedidos y producción · Clientes y proveedores · Libro diario y libro mayor · Estados financieros · Reportes · Base de datos en la nube con inicio de sesión.

## Dónde se guardan los datos

Por ahora se guardan en el navegador (IndexedDB) del equipo donde se use la app. Por eso hay que **descargar un respaldo con frecuencia** desde *Configuración y respaldo*. Toda la lógica de datos está en `src/db.js` para poder migrar a una base en la nube (Supabase) sin rehacer las pantallas.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm test         # pruebas de los cálculos
npm run build    # versión para publicar (carpeta dist/)
```

Los cálculos están en `src/lib/calc.js` y se prueban en `tests/calc.test.js`.

> Los reportes son de gestión interna; los temas fiscales deben validarse con un contador.
