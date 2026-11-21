create table if not exists public.grand_lumen_project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.grand_lumen_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('viewer', 'editor', 'manager')),
  created_at timestamptz not null default now(),
  unique (project_id, member_id),
  check (owner_id <> member_id)
);

create unique index if not exists grand_lumen_project_members_project_member_uidx on public.grand_lumen_project_members(project_id, member_id);
create index if not exists grand_lumen_project_members_member_idx on public.grand_lumen_project_members(member_id);
create index if not exists grand_lumen_project_members_owner_idx on public.grand_lumen_project_members(owner_id);

alter table public.grand_lumen_project_members enable row level security;

revoke all on table public.grand_lumen_project_members from public, anon;
grant select, insert, update, delete on table public.grand_lumen_project_members to authenticated;

drop policy if exists "Project members can view their project shares" on public.grand_lumen_project_members;
create policy "Project members can view their project shares"
on public.grand_lumen_project_members
for select
to authenticated
using (auth.uid() = owner_id or auth.uid() = member_id);

drop policy if exists "Project owners can share with connected members" on public.grand_lumen_project_members;
create policy "Project owners can share with connected members"
on public.grand_lumen_project_members
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.grand_lumen_projects p
    where p.id = project_id and p.user_id = auth.uid()
  )
  and exists (
    select 1 from public.grand_lumen_team_connections c
    where (c.user_low = auth.uid() and c.user_high = member_id)
       or (c.user_high = auth.uid() and c.user_low = member_id)
  )
);

drop policy if exists "Project owners can update member roles" on public.grand_lumen_project_members;
create policy "Project owners can update member roles"
on public.grand_lumen_project_members
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Project owners can revoke member access" on public.grand_lumen_project_members;
create policy "Project owners can revoke member access"
on public.grand_lumen_project_members
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can read owned or shared Grand-Lumen projects" on public.grand_lumen_projects;
drop policy if exists "Users manage their own projects" on public.grand_lumen_projects;

create policy "Users can read owned or shared Grand-Lumen projects"
on public.grand_lumen_projects
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.grand_lumen_project_members m
    where m.project_id = id and m.member_id = auth.uid()
  )
);

create policy "Users can create their own Grand-Lumen projects"
on public.grand_lumen_projects
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Owners can update their Grand-Lumen projects"
on public.grand_lumen_projects
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Owners can delete their Grand-Lumen projects"
on public.grand_lumen_projects
for delete
to authenticated
using (auth.uid() = user_id);
