alter table public.grand_lumen_profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists deleted_at timestamptz;

alter table public.grand_lumen_profiles
  drop constraint if exists grand_lumen_profiles_account_status_check;

alter table public.grand_lumen_profiles
  add constraint grand_lumen_profiles_account_status_check
  check (account_status in ('active','deactivated','deleted'));

create index if not exists grand_lumen_profiles_active_discovery_idx
  on public.grand_lumen_profiles (discoverable, account_status)
  where account_status = 'active';

create or replace function public.grand_lumen_set_account_status(p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  actor uuid := auth.uid();
  current_status text;
  recipient uuid;
  group_row record;
  notification_count integer := 0;
  status_title text;
  status_body text;
begin
  if actor is null then
    raise exception 'Sign in to manage your account.';
  end if;

  if p_status not in ('active','deactivated','deleted') then
    raise exception 'Invalid account status.';
  end if;

  select account_status into current_status
  from public.grand_lumen_profiles
  where id = actor
  for update;

  if not found then
    raise exception 'Your account profile could not be found.';
  end if;

  if current_status = 'deleted' then
    raise exception 'A deleted account cannot be reactivated.';
  end if;

  if current_status = p_status then
    return jsonb_build_object('status', current_status, 'notifications', 0);
  end if;

  if p_status = 'active' then
    update public.grand_lumen_profiles
    set account_status = 'active', updated_at = now()
    where id = actor;
    return jsonb_build_object('status', 'active', 'notifications', 0);
  end if;

  update public.grand_lumen_profiles
  set account_status = p_status,
      deleted_at = case when p_status = 'deleted' then now() else deleted_at end,
      discoverable = false,
      profile_viewable = false,
      allow_requests = false,
      show_online = false,
      show_avatar = case when p_status = 'deleted' then false else show_avatar end,
      username = case when p_status = 'deleted' then null else username end,
      display_name = case when p_status = 'deleted' then 'Deleted account' else display_name end,
      bio = case when p_status = 'deleted' then null else bio end,
      avatar_url = case when p_status = 'deleted' then null else avatar_url end,
      cover_url = case when p_status = 'deleted' then null else cover_url end,
      interests = case when p_status = 'deleted' then '{}'::text[] else interests end,
      updated_at = now()
  where id = actor;

  if p_status = 'deleted' then
    status_title := 'Connection account deleted';
    status_body := 'A connected member has permanently deleted their Grand-Lumen account. Their previous posts and messages remain in your history but are anonymised.';
  else
    status_title := 'Connection account deactivated';
    status_body := 'A connected member has temporarily deactivated their Grand-Lumen account.';
  end if;

  for recipient in
    select distinct other_id
    from (
      select case when c.user_low = actor then c.user_high else c.user_low end as other_id
      from public.grand_lumen_team_connections c
      where c.user_low = actor or c.user_high = actor
    ) connections
    where other_id is not null and other_id <> actor
  loop
    insert into public.grand_lumen_notifications(user_id,title,body,kind,related_id)
    values (recipient, status_title, status_body, 'account_lifecycle', actor);
    notification_count := notification_count + 1;
  end loop;

  for group_row in
    select distinct gm.group_id, gm.user_id
    from public.grand_lumen_group_chat_members mine
    join public.grand_lumen_group_chat_members gm on gm.group_id = mine.group_id
    where mine.user_id = actor
      and mine.left_at is null
      and gm.user_id <> actor
      and gm.left_at is null
  loop
    insert into public.grand_lumen_notifications(user_id,title,body,kind,related_id)
    values (
      group_row.user_id,
      case when p_status = 'deleted' then 'Group member account deleted' else 'Group member account deactivated' end,
      case when p_status = 'deleted'
        then 'A member of one of your groups has deleted their account. Their previous messages remain anonymised in the group history.'
        else 'A member of one of your groups has temporarily deactivated their account.'
      end,
      'account_lifecycle',
      group_row.group_id
    );
    notification_count := notification_count + 1;
  end loop;

  return jsonb_build_object('status', p_status, 'notifications', notification_count);
end;
$$;

revoke all on function public.grand_lumen_set_account_status(text) from public, anon;
grant execute on function public.grand_lumen_set_account_status(text) to authenticated;

create or replace function public.grand_lumen_search_profiles(p_query text default '')
returns table (
  id uuid, display_name text, username text, bio text, avatar_url text, cover_url text,
  interests text[], discoverable boolean, profile_viewable boolean, allow_requests boolean,
  show_online boolean, show_avatar boolean, connection_count bigint
)
language sql stable security definer set search_path = public, auth
as $$
  select p.id, p.display_name, p.username,
         case when p.profile_viewable then p.bio else null end,
         case when p.show_avatar then p.avatar_url else null end,
         case when p.profile_viewable then p.cover_url else null end,
         case when p.profile_viewable then p.interests else '{}'::text[] end,
         p.discoverable, p.profile_viewable, p.allow_requests, p.show_online, p.show_avatar,
         (select count(*) from public.grand_lumen_team_connections c where c.user_low = p.id or c.user_high = p.id)
  from public.grand_lumen_profiles p
  where auth.uid() is not null and p.id <> auth.uid()
    and p.account_status = 'active' and p.discoverable
    and (coalesce(p_query, '') = ''
      or coalesce(p.username, '') ilike '%' || replace(trim(p_query), '@', '') || '%'
      or coalesce(p.display_name, '') ilike '%' || trim(p_query) || '%')
    and not public.grand_lumen_is_blocked_pair(auth.uid(), p.id)
  order by p.display_name nulls last, p.username limit 100;
$$;

create or replace function public.grand_lumen_get_profile(p_user_id uuid)
returns table (
  id uuid, display_name text, username text, bio text, avatar_url text, cover_url text,
  interests text[], discoverable boolean, profile_viewable boolean, allow_requests boolean,
  show_online boolean, show_avatar boolean, connection_count bigint
)
language sql stable security definer set search_path = public, auth
as $$
  select p.id, p.display_name, p.username, p.bio, p.avatar_url, p.cover_url, p.interests,
         p.discoverable, p.profile_viewable, p.allow_requests, p.show_online, p.show_avatar,
         (select count(*) from public.grand_lumen_team_connections c where c.user_low = p.id or c.user_high = p.id)
  from public.grand_lumen_profiles p
  where p.id = p_user_id and p.account_status = 'active'
    and auth.uid() is not null
    and not public.grand_lumen_is_blocked_pair(auth.uid(), p.id)
    and (p.id = auth.uid() or p.profile_viewable);
$$;

create or replace function public.grand_lumen_get_shared_profile(p_username text)
returns table (
  id uuid, display_name text, username text, bio text, avatar_url text, cover_url text,
  interests text[], discoverable boolean, profile_viewable boolean, allow_requests boolean,
  show_online boolean, show_avatar boolean, connection_count bigint
)
language sql stable security definer set search_path = public, auth
as $$
  select p.id, p.display_name, p.username, p.bio, p.avatar_url, p.cover_url, p.interests,
         p.discoverable, p.profile_viewable, p.allow_requests, p.show_online, p.show_avatar,
         (select count(*) from public.grand_lumen_team_connections c where c.user_low = p.id or c.user_high = p.id)
  from public.grand_lumen_profiles p
  where lower(p.username) = lower(trim(p_username))
    and p.account_status = 'active' and p.profile_viewable
    and auth.uid() is not null
    and not public.grand_lumen_is_blocked_pair(auth.uid(), p.id)
  limit 1;
$$;

create or replace function public.grand_lumen_get_profiles_by_ids(p_user_ids uuid[])
returns table (
  id uuid, display_name text, username text, bio text, avatar_url text, cover_url text,
  interests text[], discoverable boolean, profile_viewable boolean, allow_requests boolean,
  show_online boolean, show_avatar boolean, connection_count bigint
)
language sql stable security definer set search_path = public, auth
as $$
  select p.id,
         case when p.account_status = 'deleted' then 'Deleted account' else p.display_name end,
         case when p.account_status = 'deleted' then null else p.username end,
         case when p.account_status = 'active' and p.profile_viewable then p.bio else null end,
         case when p.account_status = 'active' and p.show_avatar then p.avatar_url else null end,
         case when p.account_status = 'active' and p.profile_viewable then p.cover_url else null end,
         case when p.account_status = 'active' and p.profile_viewable then p.interests else '{}'::text[] end,
         p.discoverable, p.profile_viewable, p.allow_requests, p.show_online, p.show_avatar,
         (select count(*) from public.grand_lumen_team_connections c where c.user_low = p.id or c.user_high = p.id)
  from public.grand_lumen_profiles p
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and exists (
      select 1 from public.grand_lumen_team_connections c
      where (c.user_low = auth.uid() and c.user_high = p.id)
         or (c.user_high = auth.uid() and c.user_low = p.id)
    )
    and not public.grand_lumen_is_blocked_pair(auth.uid(), p.id);
$$;

create or replace function public.grand_lumen_send_connection_request(p_recipient_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare actor uuid := auth.uid(); target public.grand_lumen_profiles%rowtype; request_id uuid; declined_at timestamptz;
begin
  if actor is null then raise exception 'Sign in to connect with a member.'; end if;
  if p_recipient_id = actor then raise exception 'You cannot connect to your own account.'; end if;
  select * into target from public.grand_lumen_profiles where id = p_recipient_id;
  if not found or target.account_status <> 'active' or not target.allow_requests then
    raise exception 'This member is not accepting connection requests.';
  end if;
  if public.grand_lumen_is_blocked_pair(actor, p_recipient_id) then raise exception 'This member is unavailable.'; end if;
  if exists (select 1 from public.grand_lumen_team_connections c where c.user_low = least(actor,p_recipient_id) and c.user_high = greatest(actor,p_recipient_id)) then raise exception 'You are already connected.'; end if;
  if exists (select 1 from public.grand_lumen_connection_requests r where r.status = 'pending' and ((r.requester_id = actor and r.recipient_id = p_recipient_id) or (r.requester_id = p_recipient_id and r.recipient_id = actor))) then raise exception 'A connection request is already pending.'; end if;
  select max(r.responded_at) into declined_at from public.grand_lumen_connection_requests r where r.requester_id = actor and r.recipient_id = p_recipient_id and r.status = 'declined';
  if declined_at is not null and declined_at > now() - interval '30 days' then raise exception 'You can send another request to this member 30 days after the previous decline.'; end if;
  insert into public.grand_lumen_connection_requests (requester_id, recipient_id, status) values (actor, p_recipient_id, 'pending') returning id into request_id;
  insert into public.grand_lumen_notifications (user_id,title,body,kind,related_id) values (p_recipient_id,'New connection request','Someone sent you a connection request.','connection',request_id);
  return request_id;
end;
$$;
