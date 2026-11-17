# Auditoría y precauciones
- Solo se revierten salidas automáticas de producción. Las mermas manuales no se restituyen. La cancelación implica que el material reingresó físicamente.
- No se permite salida de inventario por encima de las existencias registradas.
- Los pagos anulados permanecen visibles, pero se excluyen de los saldos y de los asientos reconstruidos. No constituye un registro inmutable de auditoría.
- Los respaldos se validan antes de reemplazar las tablas; **descargar un respaldo verificado** antes de restaurar.
- La sincronización real con Supabase y los cambios entre distintas cuentas requieren pruebas específicas antes de habilitar uso multiusuario.
