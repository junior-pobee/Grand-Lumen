create table if not exists public.grand_lumen_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grand_lumen_team_invites (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.grand_lumen_connection_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint grand_lumen_no_self_request check (requester_id <> recipient_id)
);

create unique index if not exists grand_lumen_one_pending_request_per_pair
on public.grand_lumen_connection_requests (
  least(requester_id, recipient_id),
  greatest(requester_id, recipient_id)
)
where status = 'pending';

create table if not exists public.grand_lumen_team_connections (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint grand_lumen_connection_order check (user_low < user_high),
  constraint grand_lumen_connection_unique unique (user_low, user_high)
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
  body text not null check (length(trim(body)) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index if not exists grand_lumen_requests_recipient_status_idx
on public.grand_lumen_connection_requests (recipient_id, status, created_at desc);

create index if not exists grand_lumen_requests_requester_idx
on public.grand_lumen_connection_requests (requester_id, created_at desc);

create index if not exists grand_lumen_messages_conversation_created_idx
on public.grand_lumen_team_messages (conversation_id, created_at);

alter table public.grand_lumen_profiles enable row level security;
alter table public.grand_lumen_team_invites enable row level security;
alter table public.grand_lumen_connection_requests enable row level security;
alter table public.grand_lumen_team_connections enable row level security;
alter table public.grand_lumen_team_conversations enable row level security;
alter table public.grand_lumen_team_messages enable row level security;

drop policy if exists grand_lumen_profiles_read_connected on public.grand_lumen_profiles;
create policy grand_lumen_profiles_read_connected
on public.grand_lumen_profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.grand_lumen_team_connections c
    where (c.user_low = auth.uid() and c.user_high = id)
       or (c.user_high = auth.uid() and c.user_low = id)
  )
);

drop policy if exists grand_lumen_requests_read_participants on public.grand_lumen_connection_requests;
create policy grand_lumen_requests_read_participants
on public.grand_lumen_connection_requests for select to authenticated
using (requester_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists grand_lumen_connections_read_members on public.grand_lumen_team_connections;
create policy grand_lumen_connections_read_members
on public.grand_lumen_team_connections for select to authenticated
using (user_low = auth.uid() or user_high = auth.uid());

drop policy if exists grand_lumen_conversations_read_members on public.grand_lumen_team_conversations;
create policy grand_lumen_conversations_read_members
on public.grand_lumen_team_conversations for select to authenticated
using (
  exists (
    select 1
    from public.grand_lumen_team_connections c
    where c.id = connection_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

drop policy if exists grand_lumen_messages_read_members on public.grand_lumen_team_messages;
create policy grand_lumen_messages_read_members
on public.grand_lumen_team_messages for select to authenticated
using (
  exists (
    select 1
    from public.grand_lumen_team_conversations cv
    join public.grand_lumen_team_connections c on c.id = cv.connection_id
    where cv.id = conversation_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

drop policy if exists grand_lumen_messages_insert_members on public.grand_lumen_team_messages;
create policy grand_lumen_messages_insert_members
on public.grand_lumen_team_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.grand_lumen_team_conversations cv
    join public.grand_lumen_team_connections c on c.id = cv.connection_id
    where cv.id = conversation_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

grant usage on schema public to authenticated;
grant select on public.grand_lumen_profiles to authenticated;
grant select on public.grand_lumen_connection_requests to authenticated;
grant select on public.grand_lumen_team_connections to authenticated;
grant select on public.grand_lumen_team_conversations to authenticated;
grant select, insert on public.grand_lumen_team_messages to authenticated;

create or replace function public.grand_lumen_sync_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.grand_lumen_profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email
  )
  on conflict (id) do update
  set display_name = coalesce(excluded.display_name, public.grand_lumen_profiles.display_name),
      email = excluded.email,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists grand_lumen_auth_user_profile on auth.users;
create trigger grand_lumen_auth_user_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.grand_lumen_sync_profile();

insert into public.grand_lumen_profiles (id, display_name, email)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'),
  email
from auth.users
on conflict (id) do update
set display_name = coalesce(excluded.display_name, public.grand_lumen_profiles.display_name),
    email = excluded.email,
    updated_at = now();

create or replace function public.grand_lumen_create_team_invite(
  invite_token_hash text,
  valid_minutes integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_invite_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a connection invitation.';
  end if;
  if invite_token_hash is null or length(invite_token_hash) <> 64 then
    raise exception 'Invalid invitation token.';
  end if;
  if valid_minutes < 1 or valid_minutes > 60 then
    raise exception 'Invitation validity must be between 1 and 60 minutes.';
  end if;

  insert into public.grand_lumen_team_invites (created_by, token_hash, expires_at)
  values (auth.uid(), invite_token_hash, now() + make_interval(mins => valid_minutes))
  returning id into new_invite_id;

  return new_invite_id;
end;
$$;

create or replace function public.grand_lumen_redeem_team_invite(invite_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invite_row public.grand_lumen_team_invites%rowtype;
  existing_request_id uuid;
  new_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before sending a connection request.';
  end if;

  select * into invite_row
  from public.grand_lumen_team_invites
  where token_hash = invite_token_hash
    and consumed_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'This invitation is invalid, expired or already used.';
  end if;

  if invite_row.created_by = auth.uid() then
    raise exception 'You cannot connect to your own account.';
  end if;

  if exists (
    select 1 from public.grand_lumen_team_connections
    where user_low = least(auth.uid(), invite_row.created_by)
      and user_high = greatest(auth.uid(), invite_row.created_by)
  ) then
    raise exception 'You are already connected to this member.';
  end if;

  select id into existing_request_id
  from public.grand_lumen_connection_requests
  where status = 'pending'
    and (
      (requester_id = auth.uid() and recipient_id = invite_row.created_by)
      or (requester_id = invite_row.created_by and recipient_id = auth.uid())
    )
  limit 1;

  update public.grand_lumen_team_invites
  set consumed_at = now()
  where id = invite_row.id;

  if existing_request_id is not null then
    return existing_request_id;
  end if;

  insert into public.grand_lumen_connection_requests (requester_id, recipient_id)
  values (auth.uid(), invite_row.created_by)
  returning id into new_request_id;

  return new_request_id;
end;
$$;

create or replace function public.grand_lumen_respond_connection_request(
  request_id uuid,
  accept_request boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  request_row public.grand_lumen_connection_requests%rowtype;
  connection_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond to connection requests.';
  end if;

  update public.grand_lumen_connection_requests
  set status = case when accept_request then 'accepted' else 'declined' end,
      responded_at = now()
  where id = request_id
    and recipient_id = auth.uid()
    and status = 'pending'
  returning * into request_row;

  if not found then
    raise exception 'This request is no longer pending or does not belong to your account.';
  end if;

  if not accept_request then
    return request_row.id;
  end if;

  insert into public.grand_lumen_team_connections (user_low, user_high)
  values (
    least(request_row.requester_id, request_row.recipient_id),
    greatest(request_row.requester_id, request_row.recipient_id)
  )
  on conflict (user_low, user_high) do update
  set user_low = excluded.user_low
  returning id into connection_id;

  insert into public.grand_lumen_team_conversations (connection_id)
  values (connection_id)
  on conflict (connection_id) do nothing;

  return connection_id;
end;
$$;

grant execute on function public.grand_lumen_create_team_invite(text, integer) to authenticated;
grant execute on function public.grand_lumen_redeem_team_invite(text) to authenticated;
grant execute on function public.grand_lumen_respond_connection_request(uuid, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grand_lumen_team_connections'
    ) then
      alter publication supabase_realtime add table public.grand_lumen_team_connections;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grand_lumen_connection_requests'
    ) then
      alter publication supabase_realtime add table public.grand_lumen_connection_requests;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grand_lumen_team_messages'
    ) then
      alter publication supabase_realtime add table public.grand_lumen_team_messages;
    end if;
  end if;
end;
$$;
