-- Aplicar después de tasas_automaticas.sql. Solo cambia permisos de esta tabla.
begin;

revoke all on public.atelune_tasas_automaticas from public, anon, authenticated, service_role;
grant select on public.atelune_tasas_automaticas to authenticated;
grant select, insert on public.atelune_tasas_automaticas to service_role;
grant usage on sequence public.atelune_tasas_automaticas_id_seq to service_role;

commit;
