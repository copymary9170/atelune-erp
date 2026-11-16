# Atelune · Administración

Aplicación web para administrar Atelune: papelería creativa, impresión, impresión 3D, impresión comestible, sublimación (incluida neón), grabado láser, vinil, manualidades y diseño.

## Qué incluye

### Etapa 1

- **Cotizador automático**: suma materiales (con merma), uso de máquinas, mano de obra, otros costos y costos fijos prorrateados; aplica el margen por línea de servicio, los descuentos, el envío, la comisión del método de pago y el IVA. Muestra el total en $ y en Bs, y la cotización se puede imprimir o guardar como PDF.
- **Plantillas de trabajo**: la «receta» de cada trabajo que se repite, para cotizarlo en segundos.
- **Inventario (kardex)**: productos de reventa, materias primas, insumos y productos terminados; conversión entre la unidad de compra y la unidad de uso; costo promedio ponderado; alertas de stock bajo.
- **Activos y máquinas**: depreciación en línea recta, valor en libros y costo por hora de cada máquina.
- **Tasa de cambio** diaria (Bs/$).
- **Configuración** y **respaldo** (descargar y restaurar).

### Etapa 2

- **Pedidos y producción**: una cotización se convierte en pedido con un clic. Estados: aprobado → en diseño → en producción → listo → entregado (o cancelado). Fecha de entrega con aviso de atraso y notas de producción.
- **Descuento automático del inventario** al pasar a producción. Si se cancela, los materiales vuelven al inventario. La merma se cobra en el precio, pero el desperdicio real se registra a mano como movimiento de «Merma».
- **Pagos y abonos** por pedido (con método y tasa), saldo pendiente y vista «Por cobrar».
- **Clientes** con su historial de cotizaciones y pedidos y lo que deben; se pueden elegir o crear desde la cotización.
- **Proveedores**: las entradas de inventario se asocian a un proveedor y queda el historial de compras.

### Etapa 3

- **Gastos y pagos**: gastos por categoría, pagos a proveedores, retiros y aportes del dueño; deudas con proveedores.
- **Forma de pago** en compras de inventario y en activos (método de pago, a crédito o aporte propio).
- **Contabilidad automática** (`src/lib/contabilidad.js`): los asientos se generan a partir de los documentos, así que siempre coinciden con lo registrado.
  - Ventas al entregar el pedido, por línea de servicio; envíos/recargos e IVA aparte.
  - Pagos recibidos antes de la entrega = anticipos de clientes; se aplican al entregar.
  - Consumo de materiales → costo de ventas; mermas y ajustes por conteo → costos.
  - Compras → inventario contra el método de pago, cuentas por pagar o capital.
  - Depreciación mensual de cada equipo al cierre de mes.
  - Asientos manuales para saldos iniciales y correcciones.
- **Reportes**: libro diario, libro mayor por cuenta, balance de comprobación, estado de resultados y balance general, con filtros de fecha.

### Etapa 4: datos en la nube

- **Primero local**: la app trabaja con los datos del navegador (funciona sin internet) y guarda una copia completa en Supabase cuando hay conexión. Ver `src/lib/sincronizador.js` y `src/nube.js`.
- Cada guardado aumenta un número de versión. Si dos dispositivos cambian datos a la vez, la app pregunta cuál conservar: nunca pisa nada en silencio.
- Inicio de sesión con correo y contraseña; cada usuaria solo puede ver su propia fila (políticas RLS en `supabase/esquema.sql`).
- Sin las variables de Supabase, la app sigue funcionando solo en el navegador.

#### Configuración

1. Crear la base Supabase desde Vercel (Storage → Supabase). La integración crea `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (también se aceptan `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`). Solo se exponen variables `VITE_*` y `NEXT_PUBLIC_*`; las claves secretas nunca llegan al navegador.
2. Ejecutar `supabase/esquema.sql` en el SQL Editor de Supabase.
3. Crear la usuaria en Supabase → Authentication → Users → Add user (con «Auto Confirm») y desactivar los registros nuevos (Authentication → Sign In / Providers → «Allow new users to sign up»).
4. Volver a desplegar en Vercel.

## Próximas etapas

Reportes de rentabilidad.

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
