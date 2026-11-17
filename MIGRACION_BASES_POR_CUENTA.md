# Atelune ERP — separación de datos por cuenta (fase de prueba)

## Comportamiento

- Con Supabase configurado, el ERP abre una base IndexedDB individual por ID de usuario autenticado (`atelune-erp-cuenta-<uid>`).
- La base antigua `atelune-erp` **no se borra ni se modifica** durante la migración.
- Si el propietario de la base antigua coincide con la sesión, el sistema copia los datos a la nueva base en una sola transacción.
- Si hay datos antiguos sin propietario identificado, el ERP exige confirmación antes de copiarlos. No confirmar si corresponden a otra cuenta.
- Si la base antigua está vinculada a otra cuenta, la sesión actual abre una base distinta y no copia esos datos.
- Si un destino existía pero estaba completamente vacío por una migración interrumpida, la copia puede reintentarse.
- Cada sincronizador queda vinculado a la instancia de base de datos de su propia sesión; cambiar de cuenta cierra la instancia anterior.
- La versión de sincronización local se reinicia para bases vacías recién creadas; una base migrada se marca con cambios pendientes para reconciliarla con Supabase.

## Antes de usar con datos reales

1. Descargar un respaldo completo desde Configuración en el dispositivo original.
2. Cerrar las pestañas del ERP abiertas con versiones antiguas.
3. Entrar con la cuenta correcta y revisar el mensaje de migración antes de confirmar.
4. Verificar inventario, pedidos, abonos y configuración en la nueva base.
5. Probar sincronización con datos ficticios en dos dispositivos y dos usuarios reales; comprobar que las políticas RLS estén aplicadas en Supabase.

## Recuperación

El origen `atelune-erp` se conserva durante la fase de prueba. **No borrar almacenamiento del sitio**, cookies, IndexedDB ni los respaldos hasta comprobar la migración. Si una cuenta parece vacía, detener la operación y revisar tanto el respaldo exportado como la cuenta autenticada antes de importar o reemplazar información.

## Alcance de las verificaciones

Pruebas automatizadas de lógica, compilación Vite y pruebas adicionales con IndexedDB simulada para migración, separación entre dos cuentas, recuperación de migración interrumpida y prevención de operaciones cruzadas. **No se ha verificado aún el comportamiento de Supabase en vivo entre dos cuentas** ni la seguridad RLS mediante operaciones reales de aislamiento. No debe interpretarse una compilación exitosa como una prueba de flujo completo.
