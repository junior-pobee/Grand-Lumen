create extension if not exists pgcrypto;

create table if not exists public.grand_lumen_team_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table if not exists public.grand_lumen_connection_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);

create unique index if not exists grand_lumen_connection_request_pair_idx
on public.grand_lumen_connection_requests (least(requester_id, recipient_id), greatest(requester_id, recipient_id))
where status = 'pending';

create table if not exists public.grand_lumen_team_connections (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_low < user_high),
  unique (user_low, user_high)
);

create table if not exists public.grand_lumen_team_conversations (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique references public.grand_lumen_team_connections(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.grand_lumen_team_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.grand_lumen_team_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 12000),
  created_at timestamptz not null default now()
);

create table if not exists public.grand_lumen_project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.grand_lumen_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('viewer', 'editor', 'manager')),
  created_at timestamptz not null default now(),
  check (owner_id <> member_id),
  unique (project_id, member_id)
);

create table if not exists public.grand_lumen_workbooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled workbook',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grand_lumen_workbook_members (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.grand_lumen_workbooks(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('viewer', 'editor', 'manager')),
  created_at timestamptz not null default now(),
  unique (workbook_id, member_id)
);

create table if not exists public.grand_lumen_sheets (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.grand_lumen_workbooks(id) on delete cascade,
  name text not null default 'Sheet 1',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workbook_id, name)
);

create table if not exists public.grand_lumen_sheet_cells (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.grand_lumen_sheets(id) on delete cascade,
  cell_ref text not null,
  value text not null default '',
  formula text,
  format jsonb not null default '{}'::jsonb,
  updated_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (sheet_id, cell_ref),
  check (cell_ref ~ '^[A-Z]{1,3}[1-9][0-9]{0,5}$')
);

create index if not exists grand_lumen_team_messages_conversation_idx
on public.grand_lumen_team_messages (conversation_id, created_at);

create index if not exists grand_lumen_workbooks_owner_idx
on public.grand_lumen_workbooks (owner_id, updated_at desc);

create index if not exists grand_lumen_sheets_workbook_idx
on public.grand_lumen_sheets (workbook_id, position);

create index if not exists grand_lumen_cells_sheet_idx
on public.grand_lumen_sheet_cells (sheet_id, cell_ref);

create or replace function public.grand_lumen_are_connected(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.grand_lumen_team_connections c
    where c.user_low = least(first_user, second_user)
      and c.user_high = greatest(first_user, second_user)
  );
$$;

create or replace function public.grand_lumen_can_access_workbook(target_workbook uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.grand_lumen_workbooks w
    where w.id = target_workbook
      and (
        w.owner_id = auth.uid()
        or exists (
          select 1
          from public.grand_lumen_workbook_members m
          where m.workbook_id = w.id
            and m.member_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.grand_lumen_can_edit_workbook(target_workbook uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.grand_lumen_workbooks w
    where w.id = target_workbook
      and w.owner_id = auth.uid()
  ) or exists (
    select 1
    from public.grand_lumen_workbook_members m
    where m.workbook_id = target_workbook
      and m.member_id = auth.uid()
      and m.role in ('editor', 'manager')
  );
$$;

create or replace function public.grand_lumen_create_team_invite(invite_token_hash text, valid_minutes integer default 10)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if invite_token_hash is null or length(invite_token_hash) < 32 or length(invite_token_hash) > 128 then
    raise exception 'Invalid invitation token';
  end if;
  if valid_minutes < 1 or valid_minutes > 30 then
    raise exception 'Invitation expiry must be between 1 and 30 minutes';
  end if;
  insert into public.grand_lumen_team_invites (user_id, token_hash, expires_at)
  values (auth.uid(), invite_token_hash, now() + make_interval(mins => valid_minutes))
  returning id into invite_id;
  return invite_id;
end;
$$;

create or replace function public.grand_lumen_redeem_team_invite(invite_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.grand_lumen_team_invites%rowtype;
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select * into invite_row
  from public.grand_lumen_team_invites
  where token_hash = invite_token_hash
    and redeemed_at is null
    and expires_at > now()
  for update;
  if not found then
    raise exception 'Invitation is invalid, expired or already used';
  end if;
  if invite_row.user_id = auth.uid() then
    raise exception 'You cannot connect to your own account';
  end if;
  insert into public.grand_lumen_connection_requests (requester_id, recipient_id)
  values (auth.uid(), invite_row.user_id)
  returning id into request_id;
  update public.grand_lumen_team_invites
  set redeemed_by = auth.uid(), redeemed_at = now()
  where id = invite_row.id;
  return request_id;
end;
$$;

create or replace function public.grand_lumen_respond_connection_request(request_id uuid, accept_request boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.grand_lumen_connection_requests%rowtype;
  connection_id uuid;
  low_user uuid;
  high_user uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select * into request_row
  from public.grand_lumen_connection_requests
  where id = request_id and recipient_id = auth.uid() and status = 'pending'
  for update;
  if not found then
    raise exception 'Connection request not found';
  end if;
  if not accept_request then
    update public.grand_lumen_connection_requests
    set status = 'declined', updated_at = now()
    where id = request_row.id;
    return null;
  end if;
  low_user := least(request_row.requester_id, request_row.recipient_id);
  high_user := greatest(request_row.requester_id, request_row.recipient_id);
  insert into public.grand_lumen_team_connections (user_low, user_high, created_by)
  values (low_user, high_user, auth.uid())
  on conflict (user_low, user_high) do update set user_low = excluded.user_low
  returning id into connection_id;
  insert into public.grand_lumen_team_conversations (connection_id)
  values (connection_id)
  on conflict (connection_id) do nothing;
  update public.grand_lumen_connection_requests
  set status = 'accepted', updated_at = now()
  where id = request_row.id;
  return connection_id;
end;
$$;

alter table public.grand_lumen_team_invites enable row level security;
alter table public.grand_lumen_connection_requests enable row level security;
alter table public.grand_lumen_team_connections enable row level security;
alter table public.grand_lumen_team_conversations enable row level security;
alter table public.grand_lumen_team_messages enable row level security;
alter table public.grand_lumen_project_members enable row level security;
alter table public.grand_lumen_workbooks enable row level security;
alter table public.grand_lumen_workbook_members enable row level security;
alter table public.grand_lumen_sheets enable row level security;
alter table public.grand_lumen_sheet_cells enable row level security;

drop policy if exists "Users see their own team invites" on public.grand_lumen_team_invites;
create policy "Users see their own team invites" on public.grand_lumen_team_invites
for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users see requests involving them" on public.grand_lumen_connection_requests;
create policy "Users see requests involving them" on public.grand_lumen_connection_requests
for select to authenticated using (requester_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "Connected users see their connections" on public.grand_lumen_team_connections;
create policy "Connected users see their connections" on public.grand_lumen_team_connections
for select to authenticated using (user_low = auth.uid() or user_high = auth.uid());

drop policy if exists "Connected users see their conversations" on public.grand_lumen_team_conversations;
create policy "Connected users see their conversations" on public.grand_lumen_team_conversations
for select to authenticated using (
  exists (
    select 1 from public.grand_lumen_team_connections c
    where c.id = connection_id and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

drop policy if exists "Conversation members read team messages" on public.grand_lumen_team_messages;
create policy "Conversation members read team messages" on public.grand_lumen_team_messages
for select to authenticated using (
  exists (
    select 1
    from public.grand_lumen_team_conversations tc
    join public.grand_lumen_team_connections c on c.id = tc.connection_id
    where tc.id = conversation_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

drop policy if exists "Conversation members send team messages" on public.grand_lumen_team_messages;
create policy "Conversation members send team messages" on public.grand_lumen_team_messages
for insert to authenticated with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.grand_lumen_team_conversations tc
    join public.grand_lumen_team_connections c on c.id = tc.connection_id
    where tc.id = conversation_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

drop policy if exists "Project members view shared projects" on public.grand_lumen_projects;
create policy "Project members view shared projects" on public.grand_lumen_projects
for select to authenticated using (
  exists (
    select 1 from public.grand_lumen_project_members m
    where m.project_id = id and m.member_id = auth.uid()
  )
);

drop policy if exists "Project owners manage project members" on public.grand_lumen_project_members;
create policy "Project owners manage project members" on public.grand_lumen_project_members
for all to authenticated using (owner_id = auth.uid()) with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.grand_lumen_projects p
    where p.id = project_id and p.user_id = auth.uid()
  )
  and public.grand_lumen_are_connected(owner_id, member_id)
);

drop policy if exists "Project members view their memberships" on public.grand_lumen_project_members;
create policy "Project members view their memberships" on public.grand_lumen_project_members
for select to authenticated using (member_id = auth.uid());

drop policy if exists "Workbook owners manage workbooks" on public.grand_lumen_workbooks;
create policy "Workbook owners manage workbooks" on public.grand_lumen_workbooks
for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "Workbook members view shared workbooks" on public.grand_lumen_workbooks;
create policy "Workbook members view shared workbooks" on public.grand_lumen_workbooks
for select to authenticated using (
  exists (
    select 1 from public.grand_lumen_workbook_members m
    where m.workbook_id = id and m.member_id = auth.uid()
  )
);

drop policy if exists "Workbook owners manage membership" on public.grand_lumen_workbook_members;
create policy "Workbook owners manage membership" on public.grand_lumen_workbook_members
for all to authenticated using (
  exists (
    select 1 from public.grand_lumen_workbooks w
    where w.id = workbook_id and w.owner_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.grand_lumen_workbooks w
    where w.id = workbook_id and w.owner_id = auth.uid()
  )
  and public.grand_lumen_are_connected(auth.uid(), member_id)
);

drop policy if exists "Workbook members view their membership" on public.grand_lumen_workbook_members;
create policy "Workbook members view their membership" on public.grand_lumen_workbook_members
for select to authenticated using (member_id = auth.uid());

drop policy if exists "Workbook members read sheets" on public.grand_lumen_sheets;
create policy "Workbook members read sheets" on public.grand_lumen_sheets
for select to authenticated using (public.grand_lumen_can_access_workbook(workbook_id));

drop policy if exists "Workbook editors manage sheets" on public.grand_lumen_sheets;
create policy "Workbook editors manage sheets" on public.grand_lumen_sheets
for all to authenticated using (public.grand_lumen_can_edit_workbook(workbook_id))
with check (public.grand_lumen_can_edit_workbook(workbook_id));

drop policy if exists "Workbook members read cells" on public.grand_lumen_sheet_cells;
create policy "Workbook members read cells" on public.grand_lumen_sheet_cells
for select to authenticated using (
  exists (
    select 1 from public.grand_lumen_sheets s
    where s.id = sheet_id and public.grand_lumen_can_access_workbook(s.workbook_id)
  )
);

drop policy if exists "Workbook editors manage cells" on public.grand_lumen_sheet_cells;
create policy "Workbook editors manage cells" on public.grand_lumen_sheet_cells
for all to authenticated using (
  exists (
    select 1 from public.grand_lumen_sheets s
    where s.id = sheet_id and public.grand_lumen_can_edit_workbook(s.workbook_id)
  )
) with check (
  updated_by = auth.uid()
  and exists (
    select 1 from public.grand_lumen_sheets s
    where s.id = sheet_id and public.grand_lumen_can_edit_workbook(s.workbook_id)
  )
);

drop policy if exists "Connected users can view each other's public profile card" on public.grand_lumen_profiles;
create policy "Connected users can view each other's public profile card" on public.grand_lumen_profiles
for select to authenticated using (
  id = auth.uid() or public.grand_lumen_are_connected(auth.uid(), id)
);


grant select on public.grand_lumen_team_invites to authenticated;
grant select on public.grand_lumen_connection_requests to authenticated;
grant select on public.grand_lumen_team_connections to authenticated;
grant select on public.grand_lumen_team_conversations to authenticated;
grant select, insert on public.grand_lumen_team_messages to authenticated;
grant select, insert, update, delete on public.grand_lumen_project_members to authenticated;
grant select, insert, update, delete on public.grand_lumen_workbooks to authenticated;
grant select, insert, update, delete on public.grand_lumen_workbook_members to authenticated;
grant select, insert, update, delete on public.grand_lumen_sheets to authenticated;
grant select, insert, update, delete on public.grand_lumen_sheet_cells to authenticated;
grant select on public.grand_lumen_profiles to authenticated;

grant execute on function public.grand_lumen_create_team_invite(text, integer) to authenticated;
grant execute on function public.grand_lumen_redeem_team_invite(text) to authenticated;
grant execute on function public.grand_lumen_respond_connection_request(uuid, boolean) to authenticated;
grant execute on function public.grand_lumen_are_connected(uuid, uuid) to authenticated;
grant execute on function public.grand_lumen_can_access_workbook(uuid) to authenticated;
grant execute on function public.grand_lumen_can_edit_workbook(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grand_lumen_team_messages') then
      alter publication supabase_realtime add table public.grand_lumen_team_messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grand_lumen_connection_requests') then
      alter publication supabase_realtime add table public.grand_lumen_connection_requests;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grand_lumen_sheet_cells') then
      alter publication supabase_realtime add table public.grand_lumen_sheet_cells;
    end if;
  end if;
end;
$$;
