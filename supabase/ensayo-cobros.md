# Ensayo y activación de cobros confirmados

## Proyecto de ensayo con Supabase Auth

1. Crea un proyecto Supabase independiente con datos ficticios. En **Authentication → Users**, crea y confirma dos cuentas de ensayo, A y B, con contraseñas distintas. Conserva las credenciales fuera del repositorio y los respaldos.
2. En el SQL Editor de **ese proyecto**, aplica [el esquema base](esquema.sql) y [la migración de cobros](cobros_confirmados.sql), en ese orden. Para probar la ventana sin RPC, detente después del esquema base y aplica la migración solo al terminar la prueba de pendientes.
3. Arranca Atelune localmente con la URL y la clave pública del proyecto de ensayo en `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (o la clave publicable en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Comprueba el identificador del proyecto antes de iniciar sesión. Las claves de servicio no se necesitan en el navegador.
4. Abre dos perfiles de navegador o dos dispositivos con almacenamiento independiente. Inicia sesión como A en ambos y como B en un tercer perfil. Crea pedidos ficticios y sincroniza el pedido de A en ambos perfiles antes de cobrar. Conserva la versión inicial y el saldo para comparar.

| Prueba | Resultado esperado |
|---|---|
| Con el esquema base y sin la RPC, guardar un intento y recargar | Estado pendiente, saldo intacto y mismo identificador al reintentar. Descargar el respaldo desde Configuración y comprobar que conserva la solicitud y que las credenciales quedan fuera. |
| En los dos perfiles A, liquidar el mismo saldo revisado | Un solo abono en la copia compartida. El otro intento queda visible como rechazado por conflicto, también después de recargar. No se puede reenviar. |
| Perder la respuesta después de confirmar y volver a enviar la misma solicitud | La RPC devuelve la confirmación existente. Se conserva el identificador y el saldo baja una sola vez. |
| Anular un abono confirmado | Se conserva el importe original, el motivo y el historial. Repetir el mismo UUID no duplica la anulación. |
| Con la sesión de B, consultar la fila de A y llamar la RPC con la cuenta A | RLS oculta la fila de A y la RPC rechaza la cuenta ajena. B tampoco puede consultar el registro privado de operaciones. |
| Intentar sincronizar una copia anterior que cambie abonos | El disparador rechaza esa escritura. Un cambio normal en el respaldo que mantiene los abonos sigue permitido. |

Para verificar la instalación con una sesión administradora, comprueba que la función exista con la firma `public.atelune_confirmar_operacion(uuid,uuid,bigint,bigint,text,jsonb)`, que `authenticated` pueda ejecutarla y que `anon` carezca de ese permiso. Comprueba RLS en `atelune_datos` y `atelune_operaciones_cobro`, y que `atelune_proteger_abonos` esté habilitado. No uses una sesión de administrador para comprobar el aislamiento de las cuentas.

## Antes de aplicar la migración de producción

- [ ] Pausar cobros y anulaciones. Inventariar todos los perfiles, pestañas antiguas y equipos desconectados. Evitar la sincronización de las versiones antiguas mientras se concilian.
- [ ] Tomar un respaldo de la base compartida y comprobar que se restaura en un entorno aislado. Descargar el respaldo habitual de cada dispositivo.
- [ ] En **Configuración → Respaldo de datos → Descargar respaldo de cobros pendientes**, guardar el archivo separado de cada dispositivo. Verificar propietario, pedido, UUID, estado, versión esperada, fecha, importe, moneda y tasa. El respaldo habitual no incluye esta cola. Conservar juntos los respaldos y el dispositivo original hasta cerrar la conciliación.
- [ ] Comparar los abonos de la nube, las copias de cada dispositivo y los comprobantes de caja o banco. Para abonos antiguos sin UUID, cruzar pedido, referencia, importe, moneda, fecha y anulaciones. Identificar ya registrados, duplicados, pendientes comprobados y casos por aclarar.
- [ ] Completar el ensayo, coordinar la actualización de todos los dispositivos y obtener autorización para la migración. Reanudar primero desde un dispositivo y revisar cada caso antes de pasar al siguiente.

## Recuperación

Si falla la ejecución o se pierde su respuesta, mantener la pausa y verificar los objetos, permisos y visibilidad de la RPC antes de repetir el SQL. Conservar la cola y descargar otro respaldo si hubo cambios.

Si un cobro queda incierto, buscar primero su UUID en el registro compartido con acceso administrativo de solo lectura. Si el intento sigue pendiente en el dispositivo original, usar **Reintentar confirmación** para mantener su UUID. Si la versión o el saldo cambió, volver a conciliar el comprobante antes de registrar otro intento. **Archivar tras conciliar** libera el pedido y conserva el intento en el respaldo separado.

Si se perdió el dispositivo, usar el JSON como evidencia para recuperar el pedido, el UUID y la solicitud con soporte autorizado. Comprobar propietario, duplicados, estado remoto, versión esperada y saldo antes de cualquier recuperación. Una solicitud marcada `solicitudCompleta: false` requiere revisión manual. El archivo no tiene un importador en Atelune ni realiza confirmaciones.

Si hay diferencias financieras o confirmaciones posteriores al respaldo, restaurar el respaldo **en un entorno aislado para comparar**. Reemplazar la copia de producción o desactivar la protección podría perder cobros ya confirmados. Conciliar por pedido y reanudar únicamente después de verificar los saldos.
