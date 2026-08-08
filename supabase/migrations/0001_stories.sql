-- Tabela de metadados dos stories (legenda, tipo de mídia)
-- Rodar no SQL Editor do Supabase: Dashboard -> SQL Editor -> colar e Run

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  poster_path text,
  media_type text not null check (media_type in ('video', 'photo')),
  caption text check (char_length(caption) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists stories_created_at_idx on public.stories (created_at);

-- RLS ligada sem policies públicas: só o backend (service role) lê e escreve
alter table public.stories enable row level security;
