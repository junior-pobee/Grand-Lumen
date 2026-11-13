create extension if not exists pgcrypto;

create table if not exists public.grand_lumen_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grand_lumen_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grand_lumen_saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  url text not null,
  source text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, url)
);

create table if not exists public.grand_lumen_research_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.grand_lumen_projects(id) on delete set null,
  title text not null default 'Untitled research note',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grand_lumen_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  accent text not null default 'blue',
  updated_at timestamptz not null default now()
);

alter table public.grand_lumen_profiles enable row level security;
alter table public.grand_lumen_projects enable row level security;
alter table public.grand_lumen_saved_items enable row level security;
alter table public.grand_lumen_research_notes enable row level security;
alter table public.grand_lumen_preferences enable row level security;

create policy "Users manage their own profiles" on public.grand_lumen_profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users manage their own projects" on public.grand_lumen_projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage their own saved items" on public.grand_lumen_saved_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage their own research notes" on public.grand_lumen_research_notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage their own preferences" on public.grand_lumen_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists grand_lumen_projects_user_created_idx on public.grand_lumen_projects(user_id, created_at desc);
create index if not exists grand_lumen_saved_user_created_idx on public.grand_lumen_saved_items(user_id, created_at desc);
create index if not exists grand_lumen_notes_user_updated_idx on public.grand_lumen_research_notes(user_id, updated_at desc);
