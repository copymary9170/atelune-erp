-- Protección adicional: exige AAL2 solamente a cuentas con MFA verificada.
-- No modifica filas, factores, contraseñas ni políticas de propiedad existentes.
begin;
select pg_advisory_xact_lock(hashtext('atelune-verificacion-dos-pasos-v1'));

create or replace function public.atelune_mfa_permitida()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt()->>'aal', '') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified'
    )
  );
$$;
revoke all on function public.atelune_mfa_permitida() from public, anon;
grant execute on function public.atelune_mfa_permitida() to authenticated;

create or replace function public.atelune_exigir_mfa_escritura()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- auth.role conserva el rol del JWT también dentro de RPC SECURITY DEFINER.
  if auth.role() = 'authenticated' and not public.atelune_mfa_permitida() then
    raise exception 'Completa la verificación en dos pasos antes de continuar' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.atelune_exigir_mfa_escritura() from public, anon, authenticated;

do $$
declare tabla text;
begin
  if to_regclass('public.atelune_datos') is null then
    raise exception 'Instala primero esquema.sql';
  end if;
  foreach tabla in array array['atelune_datos', 'atelune_operaciones_cobro', 'atelune_tasas_automaticas'] loop
    if to_regclass('public.' || tabla) is null then continue; end if;
    execute format('alter table public.%I enable row level security', tabla);
    execute format('drop policy if exists atelune_segundo_paso on public.%I', tabla);
    execute format('create policy atelune_segundo_paso on public.%I as restrictive for all to authenticated using ((select public.atelune_mfa_permitida())) with check ((select public.atelune_mfa_permitida()))', tabla);
    -- RLS puede ser omitida por un RPC SECURITY DEFINER: el trigger también
    -- protege los cobros confirmados sin cambiar su lógica ni sus permisos.
    execute format('drop trigger if exists atelune_exigir_mfa on public.%I', tabla);
    execute format('create trigger atelune_exigir_mfa before insert or update or delete on public.%I for each row execute function public.atelune_exigir_mfa_escritura()', tabla);
  end loop;
end;
$$;
commit;
