-- Atelune: referencias externas compartidas; nunca mezclarlas con el JSON de
-- cuentas, cotizaciones, pedidos, pagos ni movimientos históricos.
create table if not exists public.atelune_tasas_automaticas (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('bcv_usd','bcv_eur','usdt','calle','menudeo')),
  fuente text not null,
  entidad text not null default '',
  sentido text not null default '',
  moneda text not null check (moneda in ('USD','EUR','USDT')),
  bs_por_unidad numeric(24,8) not null check (bs_por_unidad > 0),
  fecha_valor date not null,
  instante_fuente timestamptz,
  registrado_en timestamptz not null default now(),
  url_fuente text not null,
  confirmado boolean not null default true,
  unique (tipo,fuente,entidad,sentido,fecha_valor,bs_por_unidad)
);
create index if not exists atelune_tasas_automaticas_busqueda
  on public.atelune_tasas_automaticas (tipo,fecha_valor desc,registrado_en desc);

alter table public.atelune_tasas_automaticas enable row level security;
revoke all on public.atelune_tasas_automaticas from anon;
revoke all on public.atelune_tasas_automaticas from authenticated;
grant select on public.atelune_tasas_automaticas to authenticated;
drop policy if exists "leer referencias automaticas" on public.atelune_tasas_automaticas;
create policy "leer referencias automaticas" on public.atelune_tasas_automaticas
  for select to authenticated using (true);

-- Añadir historial de solo inserción: ni un administrador operativo puede
-- sustituir una tasa antigua accidentalmente.
create or replace function public.atelune_impedir_modificar_tasa_automatica()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Las tasas automáticas son históricas: no se pueden editar ni borrar';
end $$;
drop trigger if exists atelune_tasas_solo_insertar on public.atelune_tasas_automaticas;
create trigger atelune_tasas_solo_insertar before update or delete
on public.atelune_tasas_automaticas for each row
execute function public.atelune_impedir_modificar_tasa_automatica();
