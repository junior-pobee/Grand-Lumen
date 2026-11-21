create unique index if not exists grand_lumen_project_members_project_member_uidx
on public.grand_lumen_project_members(project_id, member_id);

alter table public.grand_lumen_project_members enable row level security;
alter table public.grand_lumen_projects enable row level security;

revoke all on table public.grand_lumen_project_members from public, anon;
grant select, insert, update, delete on table public.grand_lumen_project_members to authenticated;
grant select, insert, update, delete on table public.grand_lumen_projects to authenticated;

drop policy if exists "Project owners manage project members" on public.grand_lumen_project_members;
drop policy if exists "Project members view their memberships" on public.grand_lumen_project_members;
drop policy if exists "Project members can view their project shares" on public.grand_lumen_project_members;
drop policy if exists "Project owners can share with connected members" on public.grand_lumen_project_members;
drop policy if exists "Project owners can update member roles" on public.grand_lumen_project_members;
drop policy if exists "Project owners can revoke member access" on public.grand_lumen_project_members;

create policy "Project owners can view their project memberships"
on public.grand_lumen_project_members
for select
to authenticated
using (owner_id = auth.uid());

create policy "Shared members can view their project memberships"
on public.grand_lumen_project_members
for select
to authenticated
using (member_id = auth.uid());

drop policy if exists "Users manage their own projects" on public.grand_lumen_projects;
drop policy if exists "Project members view shared projects" on public.grand_lumen_projects;
drop policy if exists "Users can read owned or shared Grand-Lumen projects" on public.grand_lumen_projects;
drop policy if exists "Users can create their own Grand-Lumen projects" on public.grand_lumen_projects;
drop policy if exists "Owners can update their Grand-Lumen projects" on public.grand_lumen_projects;
drop policy if exists "Owners can delete their Grand-Lumen projects" on public.grand_lumen_projects;

create policy "Grand Lumen project owners can read projects"
on public.grand_lumen_projects
for select
to authenticated
using (user_id = auth.uid());

create policy "Grand Lumen shared members can read projects"
on public.grand_lumen_projects
for select
to authenticated
using (
  exists (
    select 1
    from public.grand_lumen_project_members m
    where m.project_id = grand_lumen_projects.id
      and m.member_id = auth.uid()
  )
);

create policy "Grand Lumen users can create projects"
on public.grand_lumen_projects
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Grand Lumen owners can update projects"
on public.grand_lumen_projects
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Grand Lumen owners can delete projects"
on public.grand_lumen_projects
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.grand_lumen_share_project(
  p_project_id uuid,
  p_member_ids uuid[],
  p_role text default 'editor'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  shared_count integer := 0;
begin
  if actor_id is null then
    raise exception 'You must be signed in to share a project.';
  end if;

  if p_role not in ('viewer', 'editor', 'manager') then
    raise exception 'Choose a valid project permission.';
  end if;

  if not exists (
    select 1
    from public.grand_lumen_projects p
    where p.id = p_project_id
      and p.user_id = actor_id
  ) then
    raise exception 'Only the project owner can share this project.';
  end if;

  if p_member_ids is null or cardinality(p_member_ids) = 0 then
    raise exception 'Choose at least one connected member.';
  end if;

  if exists (
    select 1
    from unnest(p_member_ids) as selected(member_id)
    where selected.member_id is null
       or selected.member_id = actor_id
       or not exists (
         select 1
         from public.grand_lumen_team_connections c
         where (c.user_low = actor_id and c.user_high = selected.member_id)
            or (c.user_high = actor_id and c.user_low = selected.member_id)
       )
  ) then
    raise exception 'One or more selected accounts are not connected to you. Refresh Team and try again.';
  end if;

  insert into public.grand_lumen_project_members (project_id, owner_id, member_id, role)
  select p_project_id, actor_id, selected.member_id, p_role
  from (
    select distinct unnest(p_member_ids) as member_id
  ) selected
  on conflict (project_id, member_id)
  do update set owner_id = excluded.owner_id, role = excluded.role;

  get diagnostics shared_count = row_count;
  return shared_count;
end;
$$;

revoke all on function public.grand_lumen_share_project(uuid, uuid[], text) from public, anon;
grant execute on function public.grand_lumen_share_project(uuid, uuid[], text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'grand_lumen_project_members'
    ) then
      alter publication supabase_realtime add table public.grand_lumen_project_members;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'grand_lumen_projects'
    ) then
      alter publication supabase_realtime add table public.grand_lumen_projects;
    end if;
  end if;
end;
$$;
