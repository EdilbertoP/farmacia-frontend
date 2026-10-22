-- Ejecutar una vez en Supabase > SQL Editor. No altera las tablas de negocio.
begin;

create table if not exists public.ia_informes_demanda (
  id uuid primary key default gen_random_uuid(),
  creado_por uuid not null default auth.uid() references auth.users(id),
  producto_id bigint not null,
  producto text not null check (length(producto) between 1 and 200),
  horizonte_dias integer not null check (horizonte_dias in (7,14,30)),
  texto text not null check (length(trim(texto)) between 1 and 6000),
  texto_original text not null check (length(texto_original) between 1 and 6000),
  datos_base jsonb not null,
  modelo text not null,
  generado_en timestamptz not null,
  confirmado boolean not null check (confirmado = true),
  confirmado_en timestamptz not null default now()
);
alter table public.ia_informes_demanda enable row level security;
drop policy if exists ia_informes_leer_propios on public.ia_informes_demanda;
create policy ia_informes_leer_propios on public.ia_informes_demanda
  for select to authenticated using (creado_por = (select auth.uid()));
drop policy if exists ia_informes_confirmar_propios on public.ia_informes_demanda;
create policy ia_informes_confirmar_propios on public.ia_informes_demanda
  for insert to authenticated with check (creado_por = (select auth.uid()) and confirmado = true);
revoke all on public.ia_informes_demanda from anon, authenticated;
grant select, insert on public.ia_informes_demanda to authenticated;
create index if not exists ia_informes_propietario_fecha
  on public.ia_informes_demanda (creado_por, confirmado_en desc);

-- Contador persistente: no puede modificarse directamente desde el navegador.
create table if not exists public.ia_uso_diario (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  intentos integer not null,
  ultima_consulta timestamptz not null,
  primary key (usuario_id, dia)
);
alter table public.ia_uso_diario enable row level security;
revoke all on public.ia_uso_diario from anon, authenticated;
create or replace function public.ia_reservar_consulta()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := auth.uid();
  filas integer;
begin
  if usuario is null then return false; end if;
  insert into public.ia_uso_diario as uso (usuario_id, dia, intentos, ultima_consulta)
  values (usuario, (now() at time zone 'America/Guatemala')::date, 1, now())
  on conflict (usuario_id, dia) do update
  set intentos = uso.intentos + 1, ultima_consulta = now()
  where uso.intentos < 30 and uso.ultima_consulta <= now() - interval '10 seconds';
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;
revoke all on function public.ia_reservar_consulta() from public, anon;
grant execute on function public.ia_reservar_consulta() to authenticated;
commit;
