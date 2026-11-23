-- Ejecutar después de esquema.sql en un entorno aislado. No reescribe filas existentes.
begin;

create table if not exists public.atelune_operaciones_cobro (
  user_id uuid not null references auth.users(id) on delete cascade,
  operacion uuid not null,
  pedido_id bigint not null,
  tipo text not null check (tipo in ('cobro', 'anulacion')),
  solicitud jsonb not null,
  version bigint not null,
  primary key (user_id, operacion)
);
alter table public.atelune_operaciones_cobro enable row level security;
revoke all on public.atelune_operaciones_cobro from public, anon, authenticated;

-- La sincronización de respaldos de un cliente no puede agregar, borrar ni
-- cambiar abonos de la copia compartida. La primera importación conserva el legado.
create or replace function public.atelune_proteger_abonos()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if new.version <> old.version + 1 then
    raise exception 'Versión de sincronización inválida' using errcode = 'PT409';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(old.datos->'pedidos','[]')) a
    full join jsonb_array_elements(coalesce(new.datos->'pedidos','[]')) b
      on a->>'id' = b->>'id'
    where coalesce(a->'abonos','[]') is distinct from coalesce(b->'abonos','[]')
  ) then
    raise exception 'La copia cambia abonos: concilia los cobros sin reemplazar el respaldo' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists atelune_proteger_abonos on public.atelune_datos;
create trigger atelune_proteger_abonos before update on public.atelune_datos
for each row execute function public.atelune_proteger_abonos();

create or replace function public.atelune_confirmar_operacion(
  p_cuenta uuid, p_operacion uuid, p_pedido bigint, p_version bigint, p_tipo text, p_solicitud jsonb
) returns bigint language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  u uuid := auth.uid();
  copia public.atelune_datos%rowtype;
  previa public.atelune_operaciones_cobro%rowtype;
  pedido jsonb;
  lista jsonb;
  abono jsonb;
  posicion integer;
  indice integer;
  saldo numeric;
  importe numeric;
  tasa numeric;
  equivalente numeric;
  nueva_version bigint;
begin
  if u is null or u is distinct from p_cuenta then
    raise exception 'La sesión no corresponde a la cuenta de la operación' using errcode = '42501';
  end if;
  if p_operacion is null or p_pedido is null or p_version is null or
     p_tipo is null or p_tipo not in ('cobro','anulacion') or jsonb_typeof(p_solicitud) is distinct from 'object' then
    raise exception 'Solicitud de cobro inválida' using errcode = '22023';
  end if;
  select * into copia from public.atelune_datos where user_id = u for update;
  if not found then raise exception 'Sincroniza el pedido antes de confirmar' using errcode = 'P0002'; end if;
  select * into previa from public.atelune_operaciones_cobro where user_id = u and operacion = p_operacion;
  if found then
    if previa.pedido_id <> p_pedido or previa.tipo <> p_tipo or previa.solicitud <> p_solicitud then
      raise exception 'El identificador pertenece a otra operación' using errcode = '22023';
    end if;
    return previa.version;
  end if;
  if copia.version <> p_version then
    raise exception 'La versión compartida cambió. Revisa el saldo antes de crear otro intento.' using errcode = 'PT409';
  end if;
  select value, (ordinality - 1)::integer into pedido, posicion
    from jsonb_array_elements(coalesce(copia.datos->'pedidos','[]')) with ordinality
    where value->>'id' = p_pedido::text;
  if not found then raise exception 'Pedido no encontrado en la nube' using errcode = 'P0002'; end if;
  lista := coalesce(nullif(pedido->'abonos','null'::jsonb),'[]');

  if p_tipo = 'cobro' then
    if pedido->>'estado' = 'cancelado' or jsonb_typeof(pedido->'total') is distinct from 'number' or
       exists (select 1 from jsonb_array_elements(lista) a where a->'anulado' is distinct from 'true'::jsonb
         and (jsonb_typeof(a->'monto') is distinct from 'number' or (a->>'monto')::numeric < 0)) then
      raise exception 'El pedido no admite este cobro' using errcode = '22023';
    end if;
    select round((pedido->>'total')::numeric, 2) - round(coalesce(sum((a->>'monto')::numeric), 0),2) into saldo
      from jsonb_array_elements(lista) a where a->'anulado' is distinct from 'true'::jsonb;
    if (p_solicitud->>'saldoEsperado')::numeric is distinct from saldo then
      raise exception 'El saldo compartido cambió' using errcode = 'PT409';
    end if;
    abono := p_solicitud->'abono';
    importe := (abono->>'monto')::numeric;
    tasa := (abono->>'tasa')::numeric;
    equivalente := (abono->>'montoBs')::numeric;
    if jsonb_typeof(abono->'monto') is distinct from 'number' or importe is null or importe <= 0 or
       importe <> round(importe,2) or importe > saldo or
       p_solicitud->>'modo' is null or p_solicitud->>'modo' not in ('completo','parcial','libre') or
       (p_solicitud->>'modo' = 'completo' and importe <> saldo) or
       (p_solicitud->>'modo' = 'parcial' and importe >= saldo) or
       nullif(btrim(abono->>'metodo'),'') is null or
       coalesce(abono->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' or
       coalesce(abono->>'monedaPago','') not in ('USD','Bs') then
      raise exception 'Importe, moneda o datos de cobro inválidos' using errcode = '22023';
    end if;
    perform (abono->>'fecha')::date;
    if abono->>'monedaPago' = 'Bs' then
      if tasa is null or tasa <= 0 or equivalente is null or equivalente <= 0 or
         equivalente <> round(equivalente,2) or
         equivalente is distinct from (abono->>'importePago')::numeric or
         (p_solicitud->>'modo' = 'completo' and equivalente <> round(importe*tasa,2)) or
         (p_solicitud->>'modo' <> 'completo' and round(equivalente/nullif(tasa,0),2) <> importe) then
        raise exception 'Equivalencia en bolívares inválida' using errcode = '22023';
      end if;
    elsif importe is distinct from (abono->>'importePago')::numeric or
          (tasa is not null and (tasa <= 0 or equivalente is distinct from round(importe*tasa,2))) or
          (tasa is null and equivalente is not null) then
      raise exception 'Equivalencia en dólares inválida' using errcode = '22023';
    end if;
    abono := (abono - array['anulado','fechaAnulacion','motivoAnulacion']) || jsonb_build_object(
      'idOperacion',p_operacion,'saldoAntes',saldo,'saldoDespues',saldo-importe,'registradoEn',clock_timestamp());
    lista := lista || jsonb_build_array(abono);
  else
    indice := (p_solicitud->>'indice')::integer;
    abono := lista->indice;
    if indice is null or indice < 0 or abono is null or
       abono is distinct from p_solicitud->'anterior' or abono->'anulado' = 'true'::jsonb or
       nullif(btrim(p_solicitud->>'motivo'),'') is null then
      raise exception 'El abono cambió o falta el motivo de anulación' using errcode = '22023';
    end if;
    lista := jsonb_set(lista,array[indice::text],abono || jsonb_build_object(
      'anulado',true,'motivoAnulacion',left(btrim(p_solicitud->>'motivo'),300),'fechaAnulacion',clock_timestamp()));
  end if;

  nueva_version := copia.version + 1;
  update public.atelune_datos set datos = jsonb_set(copia.datos,array['pedidos',posicion::text,'abonos'],lista),
    version = nueva_version, actualizado = clock_timestamp() where user_id = u;
  insert into public.atelune_operaciones_cobro values (u,p_operacion,p_pedido,p_tipo,p_solicitud,nueva_version);
  return nueva_version;
end;
$$;

revoke execute on function public.atelune_confirmar_operacion(uuid,uuid,bigint,bigint,text,jsonb) from public, anon;
grant execute on function public.atelune_confirmar_operacion(uuid,uuid,bigint,bigint,text,jsonb) to authenticated;
commit;
