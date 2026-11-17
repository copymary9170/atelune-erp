# Auditoría integral de Atelune — 17 de noviembre de 2026

**Rama de evaluación:** `auditoria-integral-comparador-cantidades`  
**Alcance:** integridad financiera y operativa, seguridad de datos, compatibilidad de respaldos, cálculo de cantidades y documentación.

## Evidencias comprobadas

| Evaluación | Resultado | Alcance real |
|---|---|---|
| Pruebas automatizadas | **129/129 aprobadas** | Node test; incluye 9 pruebas nuevas de cantidad, 3 de sincronización y 2 de flujo integrado |
| Pruebas en horario de Caracas | **14/14 aprobadas** | Regresiones nuevas con `TZ=America/Caracas` |
| Compilación Vite | **Correcta** | Advertencia no bloqueante por importación dinámica de db.js |
| Flujo completo de negocio | **Correcto con IndexedDB simulada** | Cotización → pedido → consumo de inventario → entrega → abono → arqueo → cartera → rentabilidad → respaldo y restauración |
| Cuentas locales A/B | **Correcto con IndexedDB simulada** | Dos identificadores ficticios, bases separadas, sin exposición entre ellas al cerrar/abrir |
| Configuración Supabase | **Variables presentes en Vercel** | Se comprobaron **nombres** de variables, no claves ni registros |
| Políticas RLS en código | **Revisadas estáticamente** | `supabase/esquema.sql` activa RLS y declara SELECT, INSERT y UPDATE limitados a `auth.uid() = user_id`; no declara DELETE |
| Políticas RLS en Supabase real | **NO VERIFICADAS** | No se ejecutó SQL contra el servicio real |
| Dos cuentas autenticadas contra Supabase | **NO VERIFICADAS** | No se abrieron sesiones reales ni se intentó acceso cruzado |
| Pruebas visuales y funcionales en navegadores reales | **PENDIENTES** | Compilación y HTTP 200 no prueban clics, descarga CSV o aspecto responsivo |

**Importante:** los resultados automatizados no garantizan que RLS esté desplegada ni que la sincronización de dos dispositivos sea segura. No utilizar la prueba con dos bases IndexedDB como evidencia de autorización RLS.

## Errores corregidos durante la revisión

1. El sincronizador podía comunicar **éxito** después de tres inserciones/actualizaciones rechazadas por concurrencia. Ahora comunica **error** cuando no obtiene confirmación, conservando el estado local.
2. Si surgía una edición justo antes de descargar datos remotos, podía emitirse **conflicto** y después sobrescribirse visualmente con **éxito**. Ahora se detiene manteniendo el conflicto visible.
3. La Etapa 10 tenía descuentos por cantidad pero no la tabla comparativa solicitada. Se añadió una comparación no destructiva para **10, 50, 100 y cantidad actual**.

## Comparador de cantidades

En **Cotizaciones → abrir cotización → desplegar trabajo → Comparador de cantidades**:

- Los precios se calculan con `calcularCotizacion`, el **mismo motor** que utilizan las cotizaciones y los pedidos, no con fórmulas paralelas.
- Recalcula materiales, tinta que ya esté representada como material de consumo, merma, máquinas, producción por unidad, diseño fijo, extras y distribución de costos fijos. Conserva los demás renglones.
- Muestra costo total, costo por unidad, precio por unidad, precio total, utilidad y margen real. Conserva las escalas de descuento y el descuento manual.
- Identifica pérdidas y datos incompletos; no oculta márgenes negativos.
- **No modifica, guarda ni envía ningún pedido**. Los precios no son mínimos garantizados ni reemplazan la revisión comercial.
- Delivery, comisión e IVA no se incluyen en las cifras **por trabajo**; el motor de cotización los considera por separado en el **total completo**.

## Verificación de RLS pendiente (imprescindible antes de uso multiusuario)

1. Acceder al **proyecto Supabase que utiliza realmente Atelune**. No compartir aquí claves, contraseñas, cadenas de conexión o datos del negocio.
2. Ejecutar `supabase/verificar_rls.sql` en **SQL Editor** y revisar el resultado. Es una consulta **solo lectura** que no devuelve pedidos, usuarios ni clientes.
3. Resultado esperado: `tabla_existe=true`, `rls_habilitada=true`, `total_politicas=3`, `lectura_restringida=true`, `insercion_restringida=true`, `actualizacion_restringida=true`, `borrado_permitido=false`.
4. Si no coincide, **no asumir que el esquema local está desplegado**. Revisar políticas y permisos con un administrador autorizado antes de continuar.
5. Crear **dos cuentas de prueba** A y B en Supabase, sin usar la cuenta productiva y sin datos reales.
6. Iniciar sesión en Atelune con A, crear un elemento identificable `PRUEBA-CUENTA-A` y sincronizar. Cerrar sesión. Entrar con B: no debe aparecer nada de A; crear `PRUEBA-CUENTA-B` y sincronizar. Volver a A y confirmar solo datos A. Repetir desde dos dispositivos o perfiles de navegador diferentes.
7. Comprobar también que B **no pueda leer, actualizar ni insertar registros usando el `user_id` de A** mediante un cliente autenticado con la sesión de B y la clave pública correspondiente. No usar una clave `service_role`, porque omitiría RLS.
8. Realizar una edición simultánea *con datos ficticios*, confirmar que se detecta conflicto y no se borra información sin consentimiento; descargar respaldos de ambas copias antes de escoger una resolución.
9. Registrar resultados, fecha, versión publicada y usuarios ficticios empleados (sin exponer datos de acceso).

## Pruebas funcionales pendientes en interfaz

Usar **cuentas y registros exclusivamente ficticios**. Si la vista previa está conectada a la misma nube que producción, no iniciar sesión con una cuenta que contenga datos reales.

- **Cotizaciones:** crear un trabajo con materiales, merma, máquina, diseño fijo, producción y descuentos. Comparar 10, 50 y 100 unidades; comprobar precio, costo y margen contra la cotización al cambiar manualmente la cantidad. Verificar que abrir el comparador no guarda cambios.
- **Pedidos e inventario:** convertir una cotización ficticia a pedido, entrar en producción, verificar que el consumo se contabiliza una sola vez; cancelar sin devolución y con devolución física confirmada en escenarios separados.
- **Caja:** registrar efectivo USD y Bs con tasa propia, abonos vigentes y anulados, gastos, compras y cierres. Comprobar sumas, diferencias y prohibición de cerrar con tasa ausente.
- **Cartera:** comprobar saldo, sobrepago, cliente con varios pedidos y fechas de entrega previstas. Una **fecha prevista de entrega no equivale necesariamente a fecha de vencimiento del pago**.
- **Rentabilidad:** entregar un pedido, revisar el período de entrega y el importe presupuestado; comprobar que costos faltantes no generan ganancia inventada.
- **Respaldos:** exportar, revisar el archivo y restaurarlo únicamente en un entorno ficticio; confirmar que no se pierden arqueos, compras ni pedidos.
- **Diseño:** revisar menú, tablas, formularios y navegación en móvil y escritorio; descargar y abrir CSV para inspeccionar sus columnas.
- **Sincronización:** probar dos cuentas y dos dispositivos con y sin conexión antes de habilitar uso multiusuario.

## Límites conocidos

- Los arqueos antiguos en Bs sin tasa propia se mantienen incompletos: nunca se inventa una tasa retroactiva.
- Los saldos por cobrar son actuales, no una reconstrucción histórica.
- Los pagos anulados se excluyen del cálculo, pero el sistema no constituye un libro de auditoría inmutable.
- El precio comparativo es **presupuestado** y depende de la exactitud de costos, rendimientos, depreciaciones, tarifas y merma registrados.

**Decisión de despliegue:** mantener esta auditoría y el comparador en una rama de prueba hasta efectuar las verificaciones externas de RLS, las dos sesiones reales y una revisión visual. La versión principal y la base de datos real permanecen intactas.
