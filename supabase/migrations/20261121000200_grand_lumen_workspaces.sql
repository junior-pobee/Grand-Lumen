create table if not exists public.grand_lumen_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_data jsonb not null default '{"version":1,"data":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.grand_lumen_workspaces enable row level security;

drop policy if exists "Users can read their own Grand-Lumen workspace" on public.grand_lumen_workspaces;
create policy "Users can read their own Grand-Lumen workspace"
on public.grand_lumen_workspaces
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create their own Grand-Lumen workspace" on public.grand_lumen_workspaces;
create policy "Users can create their own Grand-Lumen workspace"
on public.grand_lumen_workspaces
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own Grand-Lumen workspace" on public.grand_lumen_workspaces;
create policy "Users can update their own Grand-Lumen workspace"
on public.grand_lumen_workspaces
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_grand_lumen_workspace_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists grand_lumen_workspaces_updated_at on public.grand_lumen_workspaces;
create trigger grand_lumen_workspaces_updated_at
before update on public.grand_lumen_workspaces
for each row
execute function public.set_grand_lumen_workspace_updated_at();

alter table public.grand_lumen_workspaces replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.grand_lumen_workspaces;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
