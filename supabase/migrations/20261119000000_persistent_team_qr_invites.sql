create table if not exists public.grand_lumen_personal_team_invites (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_value text not null unique,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

alter table public.grand_lumen_personal_team_invites enable row level security;

create or replace function public.grand_lumen_get_or_create_personal_team_invite(invite_token text)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  saved_token text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to load your personal Team invitation.';
  end if;

  if invite_token is null or length(invite_token) <> 64 then
    raise exception 'Invalid invitation token.';
  end if;

  insert into public.grand_lumen_personal_team_invites (user_id, token_value, token_hash)
  values (auth.uid(), invite_token, encode(digest(invite_token, 'sha256'), 'hex'))
  on conflict (user_id) do nothing;

  select token_value into saved_token
  from public.grand_lumen_personal_team_invites
  where user_id = auth.uid();

  return saved_token;
end;
$$;

create or replace function public.grand_lumen_redeem_team_invite(invite_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  inviter_id uuid;
  invite_row public.grand_lumen_team_invites%rowtype;
  existing_request_id uuid;
  new_request_id uuid;
  is_personal_invite boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in before sending a connection request.';
  end if;

  select user_id into inviter_id
  from public.grand_lumen_personal_team_invites
  where token_hash = invite_token_hash;

  if found then
    is_personal_invite := true;
  else
    select * into invite_row
    from public.grand_lumen_team_invites
    where token_hash = invite_token_hash
      and consumed_at is null
      and expires_at > now()
    for update;

    if not found then
      raise exception 'This invitation is invalid, expired or already used.';
    end if;

    inviter_id := invite_row.created_by;
    update public.grand_lumen_team_invites
    set consumed_at = now()
    where id = invite_row.id;
  end if;

  if inviter_id = auth.uid() then
    raise exception 'You cannot connect to your own account.';
  end if;

  if exists (
    select 1 from public.grand_lumen_team_connections
    where user_low = least(auth.uid(), inviter_id)
      and user_high = greatest(auth.uid(), inviter_id)
  ) then
    raise exception 'You are already connected to this member.';
  end if;

  select id into existing_request_id
  from public.grand_lumen_connection_requests
  where status = 'pending'
    and (
      (requester_id = auth.uid() and recipient_id = inviter_id)
      or (requester_id = inviter_id and recipient_id = auth.uid())
    )
  limit 1;

  if existing_request_id is not null then
    return existing_request_id;
  end if;

  insert into public.grand_lumen_connection_requests (requester_id, recipient_id)
  values (auth.uid(), inviter_id)
  returning id into new_request_id;

  return new_request_id;
end;
$$;

grant execute on function public.grand_lumen_get_or_create_personal_team_invite(text) to authenticated;
grant execute on function public.grand_lumen_redeem_team_invite(text) to authenticated;
