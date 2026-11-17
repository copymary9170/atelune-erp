-- Atelune ERP: diagnóstico SOLO LECTURA del aislamiento de cuentas.
-- Ejecutar en el editor SQL de Supabase. No crea, altera ni borra datos.
-- No devuelve clientes, pedidos, correos, IDs de usuario ni claves.
-- Resultado esperado: rls_habilitada=true, total_politicas=3,
-- leer/crear/actualizar=true, borrar=false.

with tabla as (
  select c.oid, c.relrowsecurity as rls_habilitada
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'atelune_datos'
    and c.relkind in ('r', 'p')
),
politicas as (
  select cmd, roles, qual, with_check
  from pg_policies
  where schemaname = 'public' and tablename = 'atelune_datos'
)
select
  exists(select 1 from tabla) as tabla_existe,
  coalesce((select rls_habilitada from tabla),false) as rls_habilitada,
  (select count(*) from politicas) as total_politicas,
  exists(select 1 from politicas where cmd = 'SELECT'
    and 'authenticated' = any(roles)
    and qual like '%auth.uid()%'
    and qual like '%user_id%') as lectura_restringida,
  exists(select 1 from politicas where cmd = 'INSERT'
    and 'authenticated' = any(roles)
    and with_check like '%auth.uid()%'
    and with_check like '%user_id%') as insercion_restringida,
  exists(select 1 from politicas where cmd = 'UPDATE'
    and 'authenticated' = any(roles)
    and qual like '%auth.uid()%'
    and with_check like '%auth.uid()%'
    and qual like '%user_id%'
    and with_check like '%user_id%') as actualizacion_restringida,
  exists(select 1 from politicas where cmd in ('DELETE','ALL')
    and 'authenticated' = any(roles)) as borrado_permitido;

-- Este diagnóstico comprueba configuración de RLS, NO reemplaza
-- una prueba de lectura y escritura con dos cuentas autenticadas.
