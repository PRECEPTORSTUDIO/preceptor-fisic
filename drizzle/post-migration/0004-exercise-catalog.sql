-- ════════════════════════════════════════════════════════════════════
-- exercise_catalog — catálogo global de exercícios (ExerciseDB Pro)
-- 1.324 exercícios licenciados, read-only pra todos os profissionais.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════

-- Extensão pg_trgm — precisa existir ANTES do índice gin_trgm_ops abaixo
create extension if not exists pg_trgm;

create table if not exists public.exercise_catalog (
	id uuid primary key default gen_random_uuid(),
	external_id text not null unique,
	name text not null,
	name_en text not null,
	body_part text not null,
	target_muscle text not null,
	secondary_muscles jsonb not null default '[]'::jsonb,
	equipment text,
	difficulty text,
	category text,
	instructions jsonb not null default '[]'::jsonb,
	instructions_en jsonb not null default '[]'::jsonb,
	description text,
	video_url text,
	created_at timestamptz not null default now()
);

create unique index if not exists exercise_catalog_external_idx
	on public.exercise_catalog(external_id);
create index if not exists exercise_catalog_body_part_idx
	on public.exercise_catalog(body_part);
create index if not exists exercise_catalog_target_idx
	on public.exercise_catalog(target_muscle);
create index if not exists exercise_catalog_name_en_idx
	on public.exercise_catalog(name_en);

-- Full-text search em PT-BR no nome (pra busca no catálogo)
create index if not exists exercise_catalog_name_trgm_idx
	on public.exercise_catalog using gin (name gin_trgm_ops);

-- RLS: leitura pra qualquer profissional autenticado. Sem write via app
-- (catálogo é populado só via script de ingest com service_role).
alter table public.exercise_catalog enable row level security;
drop policy if exists "read_any_authed" on public.exercise_catalog;
create policy "read_any_authed" on public.exercise_catalog
	for select using (auth.role() = 'authenticated');
