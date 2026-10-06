-- =====================================================================
-- Sobremesa — esquema de base de datos para Supabase
-- Pegar completo en: Supabase → SQL Editor → New query → Run
-- =====================================================================

-- ---------- Administradores ----------
-- Solo las cuentas listadas acá pueden moderar. Las agregás a mano
-- (ver README, paso 4).
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
-- Sin políticas: nadie la lee ni la escribe desde la web.

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;


-- ---------- Encuesta ----------
create table public.votes (
  id         bigint generated always as identity primary key,
  voter_id   uuid not null unique,          -- identificador anónimo por navegador
  tema       text not null check (tema in ('educacion','salud','ambiente','futuro')),
  created_at timestamptz not null default now()
);
alter table public.votes enable row level security;

create policy "cualquiera vota"
  on public.votes for insert to anon, authenticated
  with check (true);

create policy "admins ven votos"
  on public.votes for select to authenticated
  using (public.is_admin());


-- ---------- Foro ----------
create table public.comments (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 40),
  body       text not null check (char_length(body) between 1 and 500),
  tema       text check (tema in ('educacion','salud','ambiente','futuro')),
  status     text not null default 'pending'
             check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
alter table public.comments enable row level security;

create policy "cualquiera comenta (queda pendiente)"
  on public.comments for insert to anon, authenticated
  with check (status = 'pending');

create policy "se ven los aprobados; admins ven todo"
  on public.comments for select to anon, authenticated
  using (status = 'approved' or public.is_admin());

create policy "admins moderan comentarios"
  on public.comments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins borran comentarios"
  on public.comments for delete to authenticated
  using (public.is_admin());

create index comments_status_created_idx on public.comments (status, created_at desc);


-- ---------- Notas propuestas ----------
create table public.notas (
  id         bigint generated always as identity primary key,
  titulo     text not null check (char_length(titulo) between 1 and 90),
  autor      text not null check (char_length(autor) between 1 and 40),
  contacto   text check (char_length(contacto) <= 120),   -- privado: solo lo ven admins
  resumen    text not null check (char_length(resumen) between 1 and 800),
  tema       text check (tema in ('educacion','salud','ambiente','futuro')),
  status     text not null default 'pending'
             check (status in ('pending','published','rejected')),
  created_at timestamptz not null default now()
);
alter table public.notas enable row level security;

create policy "cualquiera propone (queda pendiente)"
  on public.notas for insert to anon, authenticated
  with check (status = 'pending');

create policy "se ven las publicadas; admins ven todo"
  on public.notas for select to anon, authenticated
  using (status = 'published' or public.is_admin());

create policy "admins moderan notas"
  on public.notas for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins borran notas"
  on public.notas for delete to authenticated
  using (public.is_admin());

create index notas_status_created_idx on public.notas (status, created_at desc);

-- El contacto nunca se expone al público: el rol anónimo solo puede
-- leer estas columnas.
revoke select on public.notas from anon;
grant select (id, titulo, autor, resumen, tema, status, created_at) on public.notas to anon;


-- ---------- Números públicos ----------
create or replace function public.poll_results()
returns table (tema text, votos bigint)
language sql stable security definer
set search_path = public
as $$
  select tema, count(*) from public.votes group by tema;
$$;

create or replace function public.public_stats()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'votos',       (select count(*) from public.votes),
    'comentarios', (select count(*) from public.comments where status = 'approved'),
    'notas',       (select count(*) from public.notas    where status <> 'rejected')
  );
$$;

grant execute on function public.poll_results() to anon, authenticated;
grant execute on function public.public_stats() to anon, authenticated;
