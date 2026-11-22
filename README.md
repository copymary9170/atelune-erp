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
- Inicio de sesión con correo y contraseña; `supabase/esquema.sql` define políticas RLS para que cada cuenta acceda solo a su fila. **Falta confirmar que estas políticas estén aplicadas y funcionen en el Supabase real**.
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

## Estado de validación y próximas comprobaciones

Las Etapas 1 a 14 tienen implementaciones en el repositorio. Las pruebas automatizadas y la compilación no equivalen a una auditoría de la base Supabase real ni a pruebas visuales de todas las pantallas. Antes de depender de la nube con varias cuentas, ejecutar `supabase/verificar_rls.sql` en el proyecto correcto y completar las comprobaciones de dos usuarios descritas en `AUDITORIA_INTEGRAL_2026-11-17.md`.

El comparador de cantidades (10, 50, 100 y cantidad actual) está disponible en una rama de prueba y conserva los descuentos por escalones de la Etapa 10. No genera precios mínimos garantizados ni altera cotizaciones hasta que se cambie y guarde una cantidad manualmente.

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
Los pedidos cerrados no admiten cambios en tiempos. Antes de cambios de versión o restauraciones, realizar una copia de seguridad; las pruebas de compilación del repositorio se verifican por separado de la seguridad real de Supabase.

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

## Etapa 11 (integrada en código; pruebas visuales pendientes): caja y arqueo de efectivo

- Nueva pantalla **Finanzas → Caja y arqueo** para registrar cierres por día y método de efectivo: separa **Efectivo $** de **Efectivo Bs**.
- Detecta entradas desde abonos de pedidos no anulados y aportes de capital; descuenta gastos, pagos a proveedores, retiros, reparto y compras de inventario pagadas con ese método.
- Los montos originales se almacenan en USD. Si el cobro/pago es en **Efectivo Bs**, el valor para arqueo se obtiene de la **tasa Bs/$ registrada en cada movimiento**. No se aplica automáticamente la tasa de hoy a movimientos pasados.
- Si faltan tasas o hay montos inválidos, el arqueo queda **incompleto** y no permite registrar el cierre. En compras futuras pagadas en efectivo Bs se solicita la tasa de la operación.
- El usuario debe introducir explícitamente el **saldo físico inicial** y el **efectivo contado**. El sistema calcula entradas, salidas, saldo esperado y diferencia; deja un historial con los movimientos tal como estaban al cerrar.
- Hay un único cierre por fecha y método. Un cierre guardado no se cambia automáticamente si después se modifican pagos o gastos. El historial muestra el cierre capturado.
- El arqueo es un **control auxiliar**, no genera asientos contables, pagos, movimientos de efectivo ni ajustes automáticos. No mezcla bancos, pagos móviles o monedas.
- Los arqueos se guardan en la tabla IndexedDB `cajaArqueos` (esquema v4) y están incluidos en los respaldos y la sincronización existente. Un respaldo antiguo sin arqueos no puede borrar los cierres que ya estén almacenados.
- Antes de promover esta etapa a producción, comprobar el funcionamiento en la vista previa con operaciones ficticias, respaldo descargado y sincronización validada. Los movimientos antiguos de compras pagadas en Bs sin tasa se mantienen pendientes, sin inventar importes.

## Etapa 12 (integrada en código; pruebas visuales pendientes): reportes globales de rentabilidad

- En **Finanzas → Reportes de rentabilidad** se filtran los pedidos **entregados** por su fecha real de entrega, con vistas por pedido, mes, línea de servicio y descripción del trabajo.
- Las ventas de trabajos se basan en el subtotal de cada pedido, **sin IVA, delivery ni recargos**. Los costos son los **presupuestados y congelados** al crear el pedido; la utilidad es presupuestada, no el beneficio neto real o contable.
- Si faltan costos, los pedidos se enumeran como incompletos: sus ventas conocidas se muestran aparte, pero no se les asigna utilidad ficticia.
- Un pedido entregado sin fecha verificable no se atribuye arbitrariamente al mes de creación.
- Las líneas y trabajos solamente se desglosan si sus precios y costos concilian con los totales del pedido. Las diferencias no se distribuyen inventando importes.
- Los pedidos abiertos aparecen únicamente como **presupuestos no realizados**, separados de ventas entregadas y de los cobros.
- Se pueden exportar los pedidos filtrados a **CSV compatible con Excel**, sin modificar ningún registro.
- Para utilidad contable del negocio, utilizar **Contabilidad → Estado de resultados**. Esta pantalla es auxiliar de análisis comercial y no modifica inventario, caja, reparto ni asientos.

## Etapa 13 (integrada en código; pruebas visuales pendientes): cuentas por cobrar

- Pantalla **Finanzas → Cuentas por cobrar**, con saldos actuales de pedidos, abonos vigentes, clasificación por fecha prevista de entrega y enlaces al detalle de cada pedido.
- Clasifica importes en **vencidos**, **por vencer** y **sin fecha**, con seguimiento separado de los pedidos ya entregados que todavía tienen saldo.
- Excluye pedidos cancelados y abonos anulados; marca los pedidos con total o abonos inválidos y no les atribuye deudas ficticias.
- Los sobrepagos se muestran como advertencia y no compensan las deudas de otros pedidos.
- La fecha de referencia seleccionada se utiliza solo para **clasificar vencimientos**. Los saldos reflejan los abonos existentes hoy; no reconstruye la cartera histórica de una fecha pasada.
- No genera pagos, intereses, asientos contables ni movimientos de caja. Los importes se muestran en USD, tal como se guardaron en los pedidos.

## Etapa 14 (integrada en código; pruebas visuales pendientes): seguimiento de cobranza por cliente

- En **Finanzas → Cuentas por cobrar** se añade una tabla con el total pendiente por cliente, cantidad de pedidos pendientes, saldo correspondiente a pedidos entregados y saldo de pedidos cuya fecha de entrega prevista ya pasó.
- Agrupa por **clienteId** cuando existe; de lo contrario por nombre normalizado. **Los pedidos sin nombre se mantienen separados** para no mezclar deudas de personas diferentes.
- Los saldos de la agrupación corresponden a los pedidos con total y abonos válidos. Los abonos anulados y los pedidos cancelados no se contabilizan y los sobrepagos no se compensan contra otros pedidos.
- Se corrige la terminología: **fecha prevista de entrega ≠ fecha de vencimiento de pago**. Se muestra expresamente «entrega prevista pasada» en vez de afirmar que una deuda está legalmente vencida.
- Es un informe de solo lectura; no envía mensajes, no crea intereses ni modifica la base o los pedidos.

## Comparador de cantidades de la Etapa 10 (rama de revisión)

En una cotización, abre un trabajo y consulta **Comparador de cantidades**. Muestra 10, 50 y 100 unidades y, si es diferente, la cantidad actual. Cada escenario usa el mismo motor `calcularCotizacion` y conserva los demás trabajos y condiciones de pago. Incluye **costo total, costo unitario, precio unitario, precio total, utilidad y margen**, junto con las alertas de costos incompletos, pérdidas y descuentos aplicados. Materiales, merma, máquinas, producción, diseño (una vez), extras y prorrateo de costos fijos se calculan de nuevo para cada escenario.

El comparador **no guarda datos** ni modifica descuentos. El precio mostrado es un escenario de venta basado en los márgenes y descuentos configurados: **no es una recomendación automática de precio mínimo**. Delivery, comisiones e IVA se excluyen de la tabla por trabajo, aunque el motor los calcula para el total de cotización completa.

## Tipos de cambio independientes (implementación en revisión)

La sección **Tasas de cambio** permite registrar por fecha y hora varias referencias simultáneas, sin reemplazar otra tasa del mismo día: **BCV dólar**, **BCV euro**, **USDT**, **calle/paralelo**, **menudeo bancario** y **personalizada**. Las tasas se introducen **manualmente**; no existe conexión automática con cotizaciones oficiales o mercados.

- Las operaciones del ERP mantienen sus **importes base en USD**. La tasa aplicada se congela en cada cotización, pedido, abono, gasto y compra, junto con su tipo, fecha, fuente, banco si corresponde y equivalencia. Actualizar el historial no modifica importes antiguos.
- Las cotizaciones y otros formularios **no usan automáticamente la última tasa sin distinguir su fuente**. Se elige un tipo y se pulsa expresamente **Usar** para copiar una tasa registrada, o se introduce una tasa personalizada.
- Se registra `Bs por 1 USD` para BCV dólar, calle, menudeo y personalizada; `Bs por 1 EUR` para BCV euro; `Bs por 1 USDT` para USDT. Se puede registrar una referencia EUR o USDT sin equivalencia USD hasta que se necesite aplicar en una transacción.
- Para usar una referencia **EUR o USDT** en una cotización o pago cuyo importe base está en USD, debes indicar adicionalmente los **USD por 1 EUR/USDT** aplicables a esa operación. La tasa efectiva se obtiene como `Bs/USD = (Bs/unidad de referencia) / (USD/unidad de referencia)`. La app no supone paridad 1:1 ni convierte EUR en USD sin esa información.
- Para **menudeo** se registran banco, sentido (compra/venta) y comisión informativa. **La comisión no se suma automáticamente** al cambio: anota la tasa efectiva de tu transacción, incluyendo el efecto de comisiones cuando corresponda, para evitar contabilizarlas dos veces.
- Para pagos explícitos **en efectivo Bs o por pago móvil**, se exige una tasa completa antes de guardar. Para operaciones exclusivamente en USD, la tasa en Bs es opcional.
- Las tasas antiguas conservan su número original. Solo las fuentes antiguas inequívocas pueden identificarse (por ejemplo, fuente `BCV` como BCV dólar); una fuente ambigua se muestra como **histórica sin clasificar**, sin asignarle una conversión automática.
- La tabla `tasas` sigue usando el mismo esquema IndexedDB; se añaden campos opcionales y nuevas filas, sin transformar las anteriores. Las copias de seguridad siguen incluyendo esta tabla y las operaciones con sus metadatos.

**Antes de utilizar con datos reales:** descarga un respaldo, prueba cada tipo con cantidades ficticias, confirma los métodos en Bs, comprueba la sincronización de dos sesiones y revisa que el costo en USD de compras pagadas en Bs refleje el equivalente realmente pagado. No utilizar una tasa de mercado como sustituto de la tasa efectivamente pactada.
