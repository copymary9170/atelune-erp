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
- **Descuento automático del inventario** al pasar a producción. Al cancelar un pedido, los materiales utilizados **no** vuelven automáticamente al inventario: se requiere confirmar que fueron recuperados físicamente. La merma real se registra por separado.
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

1. Crear la base Supabase desde Vercel (Storage → Supabase). `vite.config.js` toma solo la URL y la clave pública (`…SUPABASE_URL` y `…SUPABASE_ANON_KEY` o `…SUPABASE_PUBLISHABLE_KEY`, con cualquier prefijo); las claves secretas nunca llegan al navegador.
2. Ejecutar `supabase/esquema.sql` en el SQL Editor de Supabase.
3. Crear la usuaria en Supabase → Authentication → Users → Add user (con «Auto Confirm») y desactivar los registros nuevos (Authentication → Sign In / Providers → «Allow new users to sign up»).
4. Volver a desplegar en Vercel.

### Etapa 5: personas, mano de obra y reparto de utilidades

- **Personas** con su tarifa por hora; cada trabajo tiene una persona responsable y su mano de obra se descuenta como costo antes de la utilidad.
- **Regla general de reparto** (reinversión + % por persona, debe sumar 100 %). Cada pedido congela la regla al crearse y puede tener una regla propia (p. ej. 40/60/0) sin cambiar la general ni otros pedidos.
- **Costo incompleto ≠ costo cero**: la cotización y el pedido muestran qué dato falta; el reparto queda «provisional».
- **Pagos de mano de obra** (gasto) y **reparto de utilidades** (reduce patrimonio) con su asiento; pantalla de reparto por persona y por pedido.
- Probado con el caso Natalia del documento CopyMary: materiales USD 2,92 + mano de obra USD 5 = 7,92; con venta de 15, utilidad 7,08 → reinversión 2,83 y Mary 4,25.

### Etapa 6: compras con delivery

- **Registrar compra** (Inventario): varios materiales en una sola compra; el delivery se reparte entre ellos (según lo pagado o en partes iguales) y queda dentro del costo por unidad.

### Etapa 7: tinta desde archivo e interfaz

- **Calcular tinta desde un archivo** (en cada trabajo de una cotización o plantilla): se sube una imagen o un PDF, la app mide la cobertura de cian, magenta, amarillo y negro (`src/lib/tinta.js`) y la convierte en ml con el rendimiento del fabricante configurado en *Configuración → Impresoras y tinta*. El resultado se agrega como materiales del trabajo. El archivo se analiza en el navegador; no se sube. Es una estimación por cobertura.
- **Interfaz**: iconos en el menú, tarjetas y tablas más limpias, cuadrículas que se adaptan al ancho, mejor vista en celular.

### Etapa 8: diseño

- Sistema visual actual «Taller creativo» en `src/index.css`: fondo claro, violeta de marca y acentos cian, magenta y amarillo; tipografía Bricolage Grotesque / Plus Jakarta Sans.
- Logo redibujado (luna creciente sosteniendo un libro abierto), escudo de marca reutilizable, favicon nuevo.
- Menú con indicador de sección activa; estados en color según su etapa; estados vacíos con el motivo de la marca; avisos con variante suave.
- Pantalla de acceso adaptada al diseño actual; cotización impresa con membrete, lema editable, bloque de cliente y pie de página.

## Próximas etapas

Caja y arqueo · Reportes globales de rentabilidad.

## Dónde se guardan los datos

Los datos de trabajo se guardan localmente en IndexedDB (una base por cuenta autenticada cuando Supabase está configurado) y se sincronizan con Supabase cuando hay conexión, sujeto a los controles de conflicto. Sin Supabase la app permanece local. **Descarga respaldos frecuentes** desde *Configuración y respaldo* antes de migraciones o restauraciones.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm test         # pruebas de los cálculos
npm run build    # versión para publicar (carpeta dist/)
```

Los cálculos están en `src/lib/calc.js` y se prueban en `tests/calc.test.js`.

> Los reportes son de gestión interna; los temas fiscales deben validarse con un contador.

## Seguimiento de producción por trabajo (mejora nueva)

En **Pedidos y producción → abrir pedido → Etapas por trabajo** puedes escoger la ruta de cada renglón: impresión, topper/papelería creativa, sublimación, personalizado/vinil o reventa. Marca tareas en orden y consulta el progreso por trabajo. La **Agenda del taller** muestra el número de trabajos sin ruta, en curso y terminados.

- La ruta se almacena dentro de `pedido.produccionEtapas` y se incluye en la exportación y sincronización del pedido; no necesita migración de IndexedDB.
- Las etapas son seguimiento operativo y **no generan** gastos, consumos, costos, pagos ni cambios automáticos de estado. Para descontar materiales debes pasar el pedido a su estado general de producción conforme a las reglas existentes.
- Al cambiar una ruta con tareas completadas se solicita confirmación; volver a abrir una tarea también reabre las posteriores.
- Pedidos entregados y cancelados solo permiten consultar la ruta guardada.
- Para ejecutar las pruebas: `npm test`. Para compilar, instalar dependencias con `npm ci` y luego `npm run build`.

## Registro de tiempos reales (mejora incremental)

En el detalle de pedido, tras «Etapas por trabajo», aparece «Tiempo real de mano de obra».
Se registra por renglón/etapa la persona responsable, minutos, una tarifa horaria opcional en USD y una nota.
Los datos se almacenan en `pedido.tiemposProduccion`, separado de `pedido.produccionEtapas`.
El costo mostrado es únicamente la suma de sesiones **con tarifa registrada**; si hay sesiones sin tarifa se marca «costo incompleto».
No se transfieren automáticamente importes a los precios de venta, reparto, nómina, caja ni contabilidad, ni se modifican inventarios.
Los pedidos cerrados no admiten cambios en tiempos. Antes de publicar: realizar copia de seguridad y comprobar compilación (`npm ci && npm run build`), que no se pudo completar en el entorno offline.

## Etapa 9: rediseño «Taller creativo» y seguimiento operativo

- Diseño responsivo claro, con violeta y acentos CMY, navegación inferior en teléfonos y tarjetas de inicio.
- Agenda del taller, rutas de producción por trabajo, tiempos reales y fichas de rentabilidad por pedido.
- Registro de consumo real de materiales y merma, independiente del cálculo previsto.
- Nube: bases locales separadas por cuenta, comprobación de respaldos, control de conflictos y pruebas de concurrencia. La aplicación del esquema RLS debe verificarse directamente en Supabase.

## Etapa 10: duplicar cotizaciones y descuentos por cantidad

- En **Cotizaciones** puedes pulsar **Duplicar**. Se crea una nueva cotización en estado **Borrador**, con número y fecha nuevos, manteniendo cliente, trabajos y materiales. No se duplica ni modifica el pedido original ni se hereda un cálculo guardado.
- También hay un botón **Duplicar** dentro de la cotización. Copia su última **versión guardada**: guarda primero cualquier cambio que desees conservar.
- En cada trabajo, **Precios por cantidad**, agrega escalones con *Desde (unidades)* y *Descuento adicional (%)*. Se aplica **solo el umbral más alto alcanzado**, nunca se suman varios escalones.
- El descuento por cantidad se combina con el descuento manual de forma multiplicativa. Por ejemplo, un 10 % manual y un 5 % por volumen dan un 14,5 % efectivo, no un 15 %.
- Los descuentos solo modifican el **precio de venta**, no los costos calculados de materiales, máquinas, mano de obra ni costos fijos. Revisa la ganancia y el margen real antes de aceptar un trabajo.
- Los escalones inválidos o repetidos bloquean guardar y crear pedido. El PDF muestra el descuento por cantidad y el descuento total.
- Las cotizaciones antiguas, sin escalones configurados, mantienen el cálculo anterior. Esta ampliación no cambia el esquema de IndexedDB.

### Seguridad de datos y migración

Antes de trabajar con una nueva versión, exporta un respaldo desde Configuración. No subas ZIP de etapas antiguas sobre el código actual; trabaja desde `main` y usa ramas de prueba. La sincronización en vivo entre dos cuentas y las políticas RLS de Supabase requieren una verificación independiente de las pruebas automatizadas.
