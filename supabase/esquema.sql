-- Atelune · tabla de datos en la nube (ejecutar una sola vez en Supabase → SQL Editor).
-- Cada usuaria tiene UNA fila con todos sus datos; las políticas RLS impiden ver la de otra persona.

create table if not exists public.atelune_datos (
  user_id     uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  datos       jsonb       not null,
  version     bigint      not null default 1,
  actualizado timestamptz not null default now(),
  dispositivo text
);

alter table public.atelune_datos enable row level security;

drop policy if exists "leer mis datos" on public.atelune_datos;
drop policy if exists "crear mis datos" on public.atelune_datos;
drop policy if exists "actualizar mis datos" on public.atelune_datos;

create policy "leer mis datos" on public.atelune_datos
  for select to authenticated using (auth.uid() = user_id);
create policy "crear mis datos" on public.atelune_datos
  for insert to authenticated with check (auth.uid() = user_id);
create policy "actualizar mis datos" on public.atelune_datos
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Sin política de borrado: desde la app no se puede eliminar la fila.
