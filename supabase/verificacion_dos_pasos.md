# Verificación en dos pasos de Atelune

La cuenta puede activar TOTP desde **Configuración y respaldo → Seguridad: verificación en dos pasos**. Debe escanear el QR y confirmar un código de seis dígitos. El QR y la clave permanecen en memoria de esa pantalla; no se incluyen en respaldos ni en la configuración del negocio. Se pueden vincular varios autenticadores y elegir uno al iniciar sesión. Para eliminar uno se pide su código actual.

Una sesión con contraseña (`aal1`) y factores verificados queda bloqueada antes de abrir la base local o iniciar la sincronización. Los errores al consultar los factores también bloquean la entrada. Una sesión ya verificada (`aal2`) puede seguir trabajando con los datos locales sin consultar los factores en cada arranque. El código se valida con Supabase Auth, que aplica su expiración y límites de intentos.

La migración `verificacion_dos_pasos.sql` añade políticas restrictivas para las tablas existentes y un trigger que exige MFA también para escrituras de RPC con `SECURITY DEFINER`. Mantiene las políticas de propiedad y permite el servicio de tasas programadas. Las cuentas sin factores confirmados conservan su acceso.

El build de producción de Vercel ejecuta `tools/aplicar-mfa.mjs` después de compilar, usando la conexión PostgreSQL ya configurada. Si la migración falla, el build falla y no se publica la nueva versión. No se usa la conexión en builds locales ni de vista previa. La migración se puede ejecutar directamente desde SQL Editor después de `esquema.sql`. Si en el futuro se añaden las tablas opcionales de cobros o tasas, se debe ejecutar de nuevo para protegerlas.

## Recuperación

Se recomienda añadir un autenticador de respaldo en otro dispositivo. Si se pierden todos, la propietaria del proyecto Supabase debe verificar la identidad de la persona antes de retirar su factor desde la administración. Restablecer la contraseña no elimina MFA. No hay un acceso alternativo que omita el código desde Atelune.
