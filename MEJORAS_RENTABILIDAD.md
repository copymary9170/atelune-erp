# Atelune ERP — ficha de rentabilidad por pedido

## Qué se añadió
- Panel informativo en el detalle de cada pedido, debajo de los tiempos reales.
- Presupuesto del pedido conservado: precio de trabajos, costo y utilidad de la cotización.
- Comparación de mano de obra presupuestada con sesiones reales registradas por trabajo.
- Proyección ajustada solo cuando hay sesiones con tarifa para todos los trabajos y el costo presupuestado está completo.
- Mensajes explícitos para sesiones sin tarifa, pedidos antiguos, costos incompletos y pedidos sin entrega.

## Límite importante
La proyección sustituye el costo presupuestado de mano de obra por el costo de las sesiones registradas. **No representa una utilidad real auditada**: materiales, desgaste, electricidad, merma, costos fijos y otros insumos conservan las estimaciones originales. Además, una sesión no anotada no se puede detectar automáticamente.

## Datos
No se cambió el esquema de Dexie, no se hicieron migraciones y el panel no escribe en la base de datos. No afecta los abonos, el reparto, los movimientos de inventario ni los asientos contables.

## Pruebas
`npm test` (47 pruebas satisfactorias en este entorno).
`npm run build` pendiente: falta el paquete Vite en el entorno y la instalación offline no tiene ese paquete en caché.
