alter table public.grand_lumen_profiles
  add column if not exists username text,
  add column if not exists bio text,
  add column if not exists cover_url text,
  add column if not exists interests text[] not null default '{}',
  add column if not exists discoverable boolean not null default true,
  add column if not exists profile_viewable boolean not null default true,
  add column if not exists allow_requests boolean not null default true,
  add column if not exists show_online boolean not null default true,
  add column if not exists show_avatar boolean not null default true;

create unique index if not exists grand_lumen_profiles_username_lower_unique
on public.grand_lumen_profiles (lower(username))
where username is not null and length(trim(username)) > 0;

alter table public.grand_lumen_profiles
  add constraint grand_lumen_profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,24}$');

drop policy if exists grand_lumen_profiles_update_own on public.grand_lumen_profiles;
create policy grand_lumen_profiles_update_own
on public.grand_lumen_profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

grant update (display_name, avatar_url, username, bio, cover_url, interests, discoverable, profile_viewable, allow_requests, show_online, show_avatar, updated_at)
on public.grand_lumen_profiles to authenticated;

create table if not exists public.grand_lumen_profile_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint grand_lumen_no_self_block check (blocker_id <> blocked_id)
);

alter table public.grand_lumen_profile_blocks enable row level security;
create policy grand_lumen_profile_blocks_read_own
on public.grand_lumen_profile_blocks for select to authenticated
using (blocker_id = auth.uid());
grant select on public.grand_lumen_profile_blocks to authenticated;

create table if not exists public.grand_lumen_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  kind text not null default 'normal',
  related_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists grand_lumen_notifications_user_created_idx
on public.grand_lumen_notifications (user_id, created_at desc);

alter table public.grand_lumen_notifications enable row level security;
create policy grand_lumen_notifications_read_own
on public.grand_lumen_notifications for select to authenticated
using (user_id = auth.uid());
create policy grand_lumen_notifications_update_own
on public.grand_lumen_notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
grant select, update (read_at) on public.grand_lumen_notifications to authenticated;

create table if not exists public.grand_lumen_moments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  kind text not null default 'idea' check (kind in ('idea','text','photo','video')),
  visibility text not null default 'connections' check (visibility in ('connections','tagged','public')),
  media_path text,
  media_type text check (media_type is null or media_type in ('image','video')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint grand_lumen_moments_content_check check (length(trim(body)) > 0 or media_path is not null)
);

create index if not exists grand_lumen_moments_expiry_idx
on public.grand_lumen_moments (expires_at desc);

create table if not exists public.grand_lumen_moment_tags (
  moment_id uuid not null references public.grand_lumen_moments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (moment_id, user_id)
);

create table if not exists public.grand_lumen_moment_reactions (
  moment_id uuid not null references public.grand_lumen_moments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (moment_id, user_id)
);

create table if not exists public.grand_lumen_moment_comments (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.grand_lumen_moments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists grand_lumen_moment_comments_idx
on public.grand_lumen_moment_comments (moment_id, created_at);

alter table public.grand_lumen_moments enable row level security;
alter table public.grand_lumen_moment_tags enable row level security;
alter table public.grand_lumen_moment_reactions enable row level security;
alter table public.grand_lumen_moment_comments enable row level security;

create or replace function public.grand_lumen_is_blocked_pair(p_first uuid, p_second uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.grand_lumen_profile_blocks b
    where (b.blocker_id = p_first and b.blocked_id = p_second)
       or (b.blocker_id = p_second and b.blocked_id = p_first)
  );
$$;

create or replace function public.grand_lumen_search_profiles(p_query text default '')
returns table (
  id uuid,
  display_name text,
  username text,
  bio text,
  avatar_url text,
  cover_url text,
  interests text[],
  discoverable boolean,
  profile_viewable boolean,
  allow_requests boolean,
  show_online boolean,
  show_avatar boolean,
  connection_count bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.display_name, p.username, p.bio, p.avatar_url, p.cover_url, p.interests,
         p.discoverable, p.profile_viewable, p.allow_requests, p.show_online, p.show_avatar,
         (select count(*) from public.grand_lumen_team_connections c where c.user_low = p.id or c.user_high = p.id)
  from public.grand_lumen_profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.discoverable
    and (coalesce(p_query, '') = ''
      or coalesce(p.username, '') ilike '%' || replace(trim(p_query), '@', '') || '%'
      or coalesce(p.display_name, '') ilike '%' || trim(p_query) || '%')
    and not public.grand_lumen_is_blocked_pair(auth.uid(), p.id)
  order by p.display_name nulls last, p.username
  limit 100;
$$;

create or replace function public.grand_lumen_get_profile(p_user_id uuid)
returns table (
  id uuid,
  display_name text,
  username text,
  bio text,
  avatar_url text,
  cover_url text,
  interests text[],
  discoverable boolean,
  profile_viewable boolean,
  allow_requests boolean,
  show_online boolean,
  show_avatar boolean,
  connection_count bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.display_name, p.username, p.bio, p.avatar_url, p.cover_url, p.interests,
         p.discoverable, p.profile_viewable, p.allow_requests, p.show_online, p.show_avatar,
         (select count(*) from public.grand_lumen_team_connections c where c.user_low = p.id or c.user_high = p.id)
  from public.grand_lumen_profiles p
  where p.id = p_user_id
    and auth.uid() is not null
    and not public.grand_lumen_is_blocked_pair(auth.uid(), p.id)
    and (
      p.id = auth.uid()
      or p.profile_viewable
    );
$$;

create or replace function public.grand_lumen_get_profiles_by_ids(p_user_ids uuid[])
returns table (
  id uuid,
  display_name text,
  username text,
  bio text,
  avatar_url text,
  cover_url text,
  interests text[],
  discoverable boolean,
  profile_viewable boolean,
  allow_requests boolean,
  show_online boolean,
  show_avatar boolean,
  connection_count bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.display_name, p.username, p.bio, p.avatar_url, p.cover_url, p.interests,
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
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  actor uuid := auth.uid();
  target public.grand_lumen_profiles%rowtype;
  request_id uuid;
  declined_at timestamptz;
begin
  if actor is null then raise exception 'Sign in to connect with a member.'; end if;
  if p_recipient_id = actor then raise exception 'You cannot connect to your own account.'; end if;
  select * into target from public.grand_lumen_profiles where id = p_recipient_id;
  if not found or not target.allow_requests then raise exception 'This member is not accepting connection requests.'; end if;
  if public.grand_lumen_is_blocked_pair(actor, p_recipient_id) then raise exception 'This member is unavailable.'; end if;
  if exists (select 1 from public.grand_lumen_team_connections c where c.user_low = least(actor,p_recipient_id) and c.user_high = greatest(actor,p_recipient_id)) then
    raise exception 'You are already connected.';
  end if;
  if exists (select 1 from public.grand_lumen_connection_requests r where r.status = 'pending' and ((r.requester_id = actor and r.recipient_id = p_recipient_id) or (r.requester_id = p_recipient_id and r.recipient_id = actor))) then
    raise exception 'A connection request is already pending.';
  end if;
  select max(r.responded_at) into declined_at
  from public.grand_lumen_connection_requests r
  where r.requester_id = actor and r.recipient_id = p_recipient_id and r.status = 'declined';
  if declined_at is not null and declined_at > now() - interval '30 days' then
    raise exception 'You can send another request to this member 30 days after the previous decline.';
  end if;
  insert into public.grand_lumen_connection_requests (requester_id, recipient_id, status)
  values (actor, p_recipient_id, 'pending')
  returning id into request_id;
  insert into public.grand_lumen_notifications (user_id,title,body,kind,related_id)
  values (p_recipient_id,'New connection request','Someone sent you a connection request.','connection',request_id);
  return request_id;
end;
$$;

create or replace function public.grand_lumen_block_profile(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or p_user_id = actor then raise exception 'Invalid block request.'; end if;
  insert into public.grand_lumen_profile_blocks (blocker_id,blocked_id) values (actor,p_user_id) on conflict do nothing;
  delete from public.grand_lumen_team_connections where user_low = least(actor,p_user_id) and user_high = greatest(actor,p_user_id);
  delete from public.grand_lumen_connection_requests where (requester_id = actor and recipient_id = p_user_id) or (requester_id = p_user_id and recipient_id = actor);
  return true;
end;
$$;

create or replace function public.grand_lumen_remove_connection(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in to remove a connection.'; end if;
  delete from public.grand_lumen_team_connections
  where user_low = least(actor,p_user_id) and user_high = greatest(actor,p_user_id);
  return found;
end;
$$;

create or replace function public.grand_lumen_create_moment(
  p_body text,
  p_kind text,
  p_visibility text,
  p_media_path text default null,
  p_media_type text default null,
  p_tagged_users uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  moment_id uuid;
  target uuid;
begin
  if actor is null then raise exception 'Sign in to publish a moment.'; end if;
  if length(trim(coalesce(p_body,''))) = 0 and p_media_path is null then raise exception 'Add text or media to your moment.'; end if;
  if p_kind not in ('idea','text','photo','video') then raise exception 'Invalid moment type.'; end if;
  if p_visibility not in ('connections','tagged','public') then raise exception 'Invalid audience.'; end if;
  if p_visibility = 'tagged' and coalesce(cardinality(p_tagged_users),0) = 0 then raise exception 'Tag at least one connection for a tagged-only moment.'; end if;
  if p_media_path is not null and split_part(p_media_path,'/',1) <> actor::text then raise exception 'Invalid media ownership.'; end if;
  if exists (
    select 1 from unnest(coalesce(p_tagged_users,'{}'::uuid[])) t(id)
    where not exists (
      select 1 from public.grand_lumen_team_connections c
      where (c.user_low = actor and c.user_high = t.id) or (c.user_high = actor and c.user_low = t.id)
    ) or public.grand_lumen_is_blocked_pair(actor,t.id)
  ) then raise exception 'You can only tag current connections.'; end if;
  insert into public.grand_lumen_moments(author_id,body,kind,visibility,media_path,media_type)
  values (actor,coalesce(p_body,''),p_kind,p_visibility,p_media_path,p_media_type)
  returning id into moment_id;
  foreach target in array coalesce(p_tagged_users,'{}'::uuid[]) loop
    insert into public.grand_lumen_moment_tags(moment_id,user_id) values (moment_id,target) on conflict do nothing;
    insert into public.grand_lumen_notifications(user_id,title,body,kind,related_id)
    values (target,'You were tagged in a Lumen Moment','A connection tagged you in a moment that is available for 24 hours.','moment_tag',moment_id);
  end loop;
  return moment_id;
end;
$$;

create policy grand_lumen_moments_read_visible
on public.grand_lumen_moments for select to authenticated
using (
  expires_at > now()
  and not public.grand_lumen_is_blocked_pair(auth.uid(), author_id)
  and (
    author_id = auth.uid()
    or visibility = 'public'
    or (visibility = 'connections' and exists (
      select 1 from public.grand_lumen_team_connections c
      where (c.user_low = auth.uid() and c.user_high = author_id)
         or (c.user_high = auth.uid() and c.user_low = author_id)
    ))
    or (visibility = 'tagged' and exists (
      select 1 from public.grand_lumen_moment_tags t where t.moment_id = id and t.user_id = auth.uid()
    ))
    or exists (select 1 from public.grand_lumen_moment_tags t where t.moment_id = id and t.user_id = auth.uid())
  )
);

create policy grand_lumen_moments_insert_own
on public.grand_lumen_moments for insert to authenticated
with check (author_id = auth.uid());
create policy grand_lumen_moments_delete_own
on public.grand_lumen_moments for delete to authenticated
using (author_id = auth.uid());

create or replace function public.grand_lumen_is_moment_author(p_moment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $
  select exists (select 1 from public.grand_lumen_moments m where m.id = p_moment_id and m.author_id = auth.uid());
$;

drop policy if exists grand_lumen_moment_tags_read_visible on public.grand_lumen_moment_tags;
create policy grand_lumen_moment_tags_read_visible
on public.grand_lumen_moment_tags for select to authenticated
using (user_id = auth.uid() or public.grand_lumen_is_moment_author(moment_id));

create policy grand_lumen_moment_reactions_read_visible
on public.grand_lumen_moment_reactions for select to authenticated
using (exists (select 1 from public.grand_lumen_moments m where m.id = moment_id));
create policy grand_lumen_moment_reactions_insert_own
on public.grand_lumen_moment_reactions for insert to authenticated
with check (user_id = auth.uid() and exists (select 1 from public.grand_lumen_moments m where m.id = moment_id));
create policy grand_lumen_moment_reactions_delete_own
on public.grand_lumen_moment_reactions for delete to authenticated
using (user_id = auth.uid());

create policy grand_lumen_moment_comments_read_visible
on public.grand_lumen_moment_comments for select to authenticated
using (exists (select 1 from public.grand_lumen_moments m where m.id = moment_id));
create policy grand_lumen_moment_comments_insert_own
on public.grand_lumen_moment_comments for insert to authenticated
with check (user_id = auth.uid() and exists (select 1 from public.grand_lumen_moments m where m.id = moment_id and m.expires_at > now()));

grant select, delete on public.grand_lumen_moments to authenticated;
grant select on public.grand_lumen_moment_tags to authenticated;
grant select, insert, delete on public.grand_lumen_moment_reactions to authenticated;
grant select, insert on public.grand_lumen_moment_comments to authenticated;

create or replace function public.grand_lumen_is_admin()
returns boolean
language sql
stable
security definer
set search_path = auth
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'emmanuelpobee112@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;

create table if not exists public.grand_lumen_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  kind text not null check (kind in ('normal','important')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.grand_lumen_broadcasts enable row level security;
create policy grand_lumen_broadcasts_admin_read
on public.grand_lumen_broadcasts for select to authenticated
using (public.grand_lumen_is_admin());
grant select on public.grand_lumen_broadcasts to authenticated;

create or replace function public.grand_lumen_publish_broadcast(p_title text,p_body text,p_kind text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  broadcast_id uuid;
begin
  if actor is null or not public.grand_lumen_is_admin() then raise exception 'Administrator access is required.'; end if;
  if length(trim(coalesce(p_title,''))) not between 2 and 140 then raise exception 'Title must contain 2–140 characters.'; end if;
  if length(trim(coalesce(p_body,''))) not between 2 and 5000 then raise exception 'Message must contain 2–5000 characters.'; end if;
  if p_kind not in ('normal','important') then raise exception 'Invalid announcement type.'; end if;
  insert into public.grand_lumen_broadcasts(title,body,kind,created_by)
  values (trim(p_title),trim(p_body),p_kind,actor)
  returning id into broadcast_id;
  insert into public.grand_lumen_notifications(user_id,title,body,kind,related_id)
  select p.id, 'Grand-Lumen', trim(p_title) || E'\n' || trim(p_body), case when p_kind = 'important' then 'important' else 'broadcast' end, broadcast_id
  from public.grand_lumen_profiles p;
  return broadcast_id;
end;
$$;

revoke all on function public.grand_lumen_is_blocked_pair(uuid,uuid) from public, anon;
revoke all on function public.grand_lumen_search_profiles(text) from public, anon;
revoke all on function public.grand_lumen_get_profile(uuid) from public, anon;
revoke all on function public.grand_lumen_get_profiles_by_ids(uuid[]) from public, anon;
revoke all on function public.grand_lumen_send_connection_request(uuid) from public, anon;
revoke all on function public.grand_lumen_block_profile(uuid) from public, anon;
revoke all on function public.grand_lumen_remove_connection(uuid) from public, anon;
revoke all on function public.grand_lumen_create_moment(text,text,text,text,text,uuid[]) from public, anon;
revoke all on function public.grand_lumen_is_admin() from public, anon;
revoke all on function public.grand_lumen_publish_broadcast(text,text,text) from public, anon;
grant execute on function public.grand_lumen_is_blocked_pair(uuid,uuid) to authenticated;
grant execute on function public.grand_lumen_is_moment_author(uuid) to authenticated;
grant execute on function public.grand_lumen_search_profiles(text) to authenticated;
grant execute on function public.grand_lumen_get_profile(uuid) to authenticated;
grant execute on function public.grand_lumen_get_profiles_by_ids(uuid[]) to authenticated;
grant execute on function public.grand_lumen_send_connection_request(uuid) to authenticated;
grant execute on function public.grand_lumen_block_profile(uuid) to authenticated;
grant execute on function public.grand_lumen_remove_connection(uuid) to authenticated;
grant execute on function public.grand_lumen_create_moment(text,text,text,text,text,uuid[]) to authenticated;
grant execute on function public.grand_lumen_is_admin() to authenticated;
grant execute on function public.grand_lumen_publish_broadcast(text,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('grand-lumen-moments','grand-lumen-moments',false,52428800,array['image/*','video/*'])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;

create policy grand_lumen_moments_upload_own
on storage.objects for insert to authenticated
with check (bucket_id = 'grand-lumen-moments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy grand_lumen_moments_read_visible
on storage.objects for select to authenticated
using (
  bucket_id = 'grand-lumen-moments'
  and exists (select 1 from public.grand_lumen_moments m where m.media_path = name)
);

create policy grand_lumen_moments_delete_own
on storage.objects for delete to authenticated
using (bucket_id = 'grand-lumen-moments' and (storage.foldername(name))[1] = auth.uid()::text);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grand_lumen_moments') then
      alter publication supabase_realtime add table public.grand_lumen_moments;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grand_lumen_notifications') then
      alter publication supabase_realtime add table public.grand_lumen_notifications;
    end if;
  end if;
end;
$$;
