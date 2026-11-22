create table if not exists public.grand_lumen_group_chats (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grand_lumen_group_chat_members (
  group_id uuid not null references public.grand_lumen_group_chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (group_id,user_id)
);

create table if not exists public.grand_lumen_group_chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.grand_lumen_group_chats(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 12000),
  deleted_for_everyone boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.grand_lumen_group_message_hides (
  message_id uuid not null references public.grand_lumen_group_chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id,user_id)
);

create table if not exists public.grand_lumen_group_call_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.grand_lumen_group_chats(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('audio','video')),
  status text not null default 'active' check (status in ('active','ended')),
  created_at timestamptz not null default now()
);

create table if not exists public.grand_lumen_group_call_invites (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.grand_lumen_group_call_sessions(id) on delete cascade,
  group_id uuid not null references public.grand_lumen_group_chats(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  peer_id text not null,
  media_type text not null check (media_type in ('audio','video')),
  status text not null default 'pending' check (status in ('pending','accepted','declined','ended')),
  created_at timestamptz not null default now()
);

create table if not exists public.grand_lumen_group_call_participants (
  session_id uuid not null references public.grand_lumen_group_call_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  peer_id text not null,
  joined_at timestamptz not null default now(),
  primary key (session_id,user_id)
);

create index if not exists grand_lumen_group_members_user_idx on public.grand_lumen_group_chat_members(user_id,joined_at desc) where left_at is null;
create index if not exists grand_lumen_group_messages_group_created_idx on public.grand_lumen_group_chat_messages(group_id,created_at);
create index if not exists grand_lumen_group_calls_active_idx on public.grand_lumen_group_call_sessions(group_id,created_at desc) where status='active';

alter table public.grand_lumen_group_chats enable row level security;
alter table public.grand_lumen_group_chat_members enable row level security;
alter table public.grand_lumen_group_chat_messages enable row level security;
alter table public.grand_lumen_group_message_hides enable row level security;
alter table public.grand_lumen_group_call_sessions enable row level security;
alter table public.grand_lumen_group_call_invites enable row level security;
alter table public.grand_lumen_group_call_participants enable row level security;

create or replace function public.grand_lumen_is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,auth
as $
 select exists(select 1 from public.grand_lumen_group_chat_members gm where gm.group_id=p_group_id and gm.user_id=auth.uid() and gm.left_at is null);
$;

revoke all on function public.grand_lumen_is_group_member(uuid) from public,anon;
grant execute on function public.grand_lumen_is_group_member(uuid) to authenticated;

drop policy if exists grand_lumen_group_chats_read_members on public.grand_lumen_group_chats;
create policy grand_lumen_group_chats_read_members on public.grand_lumen_group_chats for select to authenticated using (public.grand_lumen_is_group_member(id));

drop policy if exists grand_lumen_group_members_read_members on public.grand_lumen_group_chat_members;
create policy grand_lumen_group_members_read_members on public.grand_lumen_group_chat_members for select to authenticated using (public.grand_lumen_is_group_member(group_id));

drop policy if exists grand_lumen_group_messages_read_members on public.grand_lumen_group_chat_messages;
create policy grand_lumen_group_messages_read_members on public.grand_lumen_group_chat_messages for select to authenticated using (public.grand_lumen_is_group_member(group_id));

drop policy if exists grand_lumen_group_messages_insert_members on public.grand_lumen_group_chat_messages;
create policy grand_lumen_group_messages_insert_members on public.grand_lumen_group_chat_messages for insert to authenticated with check (sender_id=auth.uid() and public.grand_lumen_is_group_member(group_id));

drop policy if exists grand_lumen_group_hides_read_own on public.grand_lumen_group_message_hides;
create policy grand_lumen_group_hides_read_own on public.grand_lumen_group_message_hides for select to authenticated using (user_id=auth.uid());

drop policy if exists grand_lumen_group_calls_read_members on public.grand_lumen_group_call_sessions;
create policy grand_lumen_group_calls_read_members on public.grand_lumen_group_call_sessions for select to authenticated using (public.grand_lumen_is_group_member(group_id));

drop policy if exists grand_lumen_group_invites_read_members on public.grand_lumen_group_call_invites;
create policy grand_lumen_group_invites_read_members on public.grand_lumen_group_call_invites for select to authenticated using (recipient_id=auth.uid() or caller_id=auth.uid());

drop policy if exists grand_lumen_group_invites_insert_members on public.grand_lumen_group_call_invites;
create policy grand_lumen_group_invites_insert_members on public.grand_lumen_group_call_invites for insert to authenticated with check (caller_id=auth.uid() and public.grand_lumen_is_group_member(group_id));

drop policy if exists grand_lumen_group_participants_read_members on public.grand_lumen_group_call_participants;
create policy grand_lumen_group_participants_read_members on public.grand_lumen_group_call_participants for select to authenticated using (exists(select 1 from public.grand_lumen_group_chat_members m join public.grand_lumen_group_call_sessions s on s.group_id=m.group_id where s.id=grand_lumen_group_call_participants.session_id and public.grand_lumen_is_group_member(s.group_id)));

drop policy if exists grand_lumen_group_calls_insert_host on public.grand_lumen_group_call_sessions;
create policy grand_lumen_group_calls_insert_host on public.grand_lumen_group_call_sessions for insert to authenticated with check (host_id=auth.uid() and public.grand_lumen_is_group_member(group_id));
drop policy if exists grand_lumen_group_calls_update_host on public.grand_lumen_group_call_sessions;
create policy grand_lumen_group_calls_update_host on public.grand_lumen_group_call_sessions for update to authenticated using (host_id=auth.uid()) with check (host_id=auth.uid());
drop policy if exists grand_lumen_group_invites_update_participants on public.grand_lumen_group_call_invites;
create policy grand_lumen_group_invites_update_participants on public.grand_lumen_group_call_invites for update to authenticated using (recipient_id=auth.uid() or caller_id=auth.uid()) with check (recipient_id=auth.uid() or caller_id=auth.uid());
drop policy if exists grand_lumen_group_participants_insert_self on public.grand_lumen_group_call_participants;
create policy grand_lumen_group_participants_insert_self on public.grand_lumen_group_call_participants for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.grand_lumen_group_call_sessions s join public.grand_lumen_group_chat_members gm on gm.group_id=s.group_id where s.id=grand_lumen_group_call_participants.session_id and public.grand_lumen_is_group_member(s.group_id)));
drop policy if exists grand_lumen_group_participants_delete_self on public.grand_lumen_group_call_participants;
create policy grand_lumen_group_participants_delete_self on public.grand_lumen_group_call_participants for delete to authenticated using (user_id=auth.uid());
create or replace function public.grand_lumen_create_group_chat(p_name text,p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare actor uuid:=auth.uid(); new_group uuid; member uuid;
begin
 if actor is null then raise exception 'Sign in to create a group.'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'Group name must be between 1 and 80 characters.'; end if;
 insert into public.grand_lumen_group_chats(name,created_by) values(trim(p_name),actor) returning id into new_group;
 insert into public.grand_lumen_group_chat_members(group_id,user_id,role,added_by) values(new_group,actor,'admin',actor);
 foreach member in array coalesce(p_member_ids,'{}'::uuid[]) loop
  if member=actor then continue; end if;
  if not exists(select 1 from public.grand_lumen_team_connections c where (c.user_low=actor and c.user_high=member) or (c.user_high=actor and c.user_low=member)) then raise exception 'Every invited person must be connected to you.'; end if;
  insert into public.grand_lumen_group_chat_members(group_id,user_id,role,added_by) values(new_group,member,'member',actor) on conflict(group_id,user_id) do nothing;
 end loop;
 return new_group;
end;
$$;

create or replace function public.grand_lumen_add_group_chat_members(p_group_id uuid,p_member_ids uuid[])
returns integer language plpgsql security definer set search_path=public,auth as $$
declare actor uuid:=auth.uid(); member uuid; added integer:=0;
begin
 if actor is null then raise exception 'Sign in to add members.'; end if;
 if not exists(select 1 from public.grand_lumen_group_chat_members where group_id=p_group_id and user_id=actor and role='admin' and left_at is null) then raise exception 'Only the group admin can add members.'; end if;
 foreach member in array coalesce(p_member_ids,'{}'::uuid[]) loop
  if member=actor then continue; end if;
  if not exists(select 1 from public.grand_lumen_team_connections c where (c.user_low=actor and c.user_high=member) or (c.user_high=actor and c.user_low=member)) then raise exception 'Every added person must be connected to the group admin.'; end if;
  insert into public.grand_lumen_group_chat_members(group_id,user_id,role,added_by,left_at) values(p_group_id,member,'member',actor,null)
  on conflict(group_id,user_id) do update set left_at=null,added_by=actor,joined_at=now()
  where public.grand_lumen_group_chat_members.left_at is not null;
  if found then added:=added+1; end if;
 end loop;
 return added;
end;
$$;

create or replace function public.grand_lumen_rename_group_chat(p_group_id uuid,p_name text)
returns boolean language plpgsql security definer set search_path=public,auth as $$
begin
 if auth.uid() is null or not exists(select 1 from public.grand_lumen_group_chat_members where group_id=p_group_id and user_id=auth.uid() and role='admin' and left_at is null) then raise exception 'Only the group admin can rename this group.'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'Group name must be between 1 and 80 characters.'; end if;
 update public.grand_lumen_group_chats set name=trim(p_name),updated_at=now() where id=p_group_id;
 return true;
end;
$$;

create or replace function public.grand_lumen_remove_group_chat_member(p_group_id uuid,p_member_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth as $$
begin
 if auth.uid() is null or not exists(select 1 from public.grand_lumen_group_chat_members where group_id=p_group_id and user_id=auth.uid() and role='admin' and left_at is null) then raise exception 'Only the group admin can remove members.'; end if;
 if p_member_id=auth.uid() then raise exception 'Use Leave group to leave this group.'; end if;
 update public.grand_lumen_group_chat_members set left_at=now() where group_id=p_group_id and user_id=p_member_id and left_at is null and role<>'admin';
 if not found then raise exception 'Member could not be removed.'; end if;
 return true;
end;
$$;

create or replace function public.grand_lumen_leave_group_chat(p_group_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth as $$
declare actor uuid:=auth.uid(); next_admin uuid;
begin
 if actor is null then raise exception 'Sign in to leave this group.'; end if;
 if not exists(select 1 from public.grand_lumen_group_chat_members where group_id=p_group_id and user_id=actor and left_at is null) then raise exception 'You are not an active member of this group.'; end if;
 if exists(select 1 from public.grand_lumen_group_chat_members where group_id=p_group_id and user_id=actor and role='admin' and left_at is null) then
  select user_id into next_admin from public.grand_lumen_group_chat_members where group_id=p_group_id and user_id<>actor and left_at is null order by joined_at limit 1;
  if next_admin is not null then update public.grand_lumen_group_chat_members set role='admin' where group_id=p_group_id and user_id=next_admin; end if;
 end if;
 update public.grand_lumen_group_chat_members set left_at=now() where group_id=p_group_id and user_id=actor and left_at is null;
 if not exists(select 1 from public.grand_lumen_group_chat_members where group_id=p_group_id and left_at is null) then delete from public.grand_lumen_group_chats where id=p_group_id; end if;
 return true;
end;
$$;

create or replace function public.grand_lumen_hide_group_chat_message(p_message_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth as $$
begin
 if auth.uid() is null or not exists(select 1 from public.grand_lumen_group_chat_messages m join public.grand_lumen_group_chat_members gm on gm.group_id=m.group_id where m.id=p_message_id and gm.user_id=auth.uid() and gm.left_at is null) then raise exception 'This message is not in one of your active groups.'; end if;
 insert into public.grand_lumen_group_message_hides(message_id,user_id) values(p_message_id,auth.uid()) on conflict do nothing;
 return true;
end;
$$;

create or replace function public.grand_lumen_delete_group_chat_message_for_everyone(p_message_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth as $$
begin
 update public.grand_lumen_group_chat_messages m set body='This message was deleted',deleted_for_everyone=true
 where m.id=p_message_id and m.sender_id=auth.uid() and not m.deleted_for_everyone
 and exists(select 1 from public.grand_lumen_group_chat_members gm where gm.group_id=m.group_id and gm.user_id=auth.uid() and gm.left_at is null);
 if not found then raise exception 'Only the sender can delete this message for everyone.'; end if;
 return true;
end;
$$;

create or replace function public.grand_lumen_clear_group_chat_for_me(p_group_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth as $$
begin
 if auth.uid() is null or not exists(select 1 from public.grand_lumen_group_chat_members where group_id=p_group_id and user_id=auth.uid() and left_at is null) then raise exception 'You are not an active member of this group.'; end if;
 insert into public.grand_lumen_group_message_hides(message_id,user_id)
 select id,auth.uid() from public.grand_lumen_group_chat_messages where group_id=p_group_id on conflict do nothing;
 return true;
end;
$$;

revoke all on function public.grand_lumen_create_group_chat(text,uuid[]) from public,anon;
revoke all on function public.grand_lumen_add_group_chat_members(uuid,uuid[]) from public,anon;
revoke all on function public.grand_lumen_rename_group_chat(uuid,text) from public,anon;
revoke all on function public.grand_lumen_remove_group_chat_member(uuid,uuid) from public,anon;
revoke all on function public.grand_lumen_leave_group_chat(uuid) from public,anon;
revoke all on function public.grand_lumen_hide_group_chat_message(uuid) from public,anon;
revoke all on function public.grand_lumen_delete_group_chat_message_for_everyone(uuid) from public,anon;
revoke all on function public.grand_lumen_clear_group_chat_for_me(uuid) from public,anon;
grant execute on function public.grand_lumen_create_group_chat(text,uuid[]) to authenticated;
grant execute on function public.grand_lumen_add_group_chat_members(uuid,uuid[]) to authenticated;
grant execute on function public.grand_lumen_rename_group_chat(uuid,text) to authenticated;
grant execute on function public.grand_lumen_remove_group_chat_member(uuid,uuid) to authenticated;
grant execute on function public.grand_lumen_leave_group_chat(uuid) to authenticated;
grant execute on function public.grand_lumen_hide_group_chat_message(uuid) to authenticated;
grant execute on function public.grand_lumen_delete_group_chat_message_for_everyone(uuid) to authenticated;
grant execute on function public.grand_lumen_clear_group_chat_for_me(uuid) to authenticated;

grant select,insert on public.grand_lumen_group_chats to authenticated;
grant select on public.grand_lumen_group_chat_members to authenticated;
grant select,insert on public.grand_lumen_group_chat_messages to authenticated;
grant select on public.grand_lumen_group_message_hides to authenticated;
grant select,insert,update on public.grand_lumen_group_call_sessions to authenticated;
grant select,insert,update on public.grand_lumen_group_call_invites to authenticated;
grant select,insert,update,delete on public.grand_lumen_group_call_participants to authenticated;

drop policy if exists grand_lumen_team_attachments_upload on storage.objects;
create policy grand_lumen_team_attachments_upload on storage.objects for insert to authenticated with check (
 bucket_id='grand-lumen-team-attachments'
 and (storage.foldername(name))[2]=auth.uid()::text
 and (
  exists(select 1 from public.grand_lumen_team_conversations cv join public.grand_lumen_team_connections c on c.id=cv.connection_id where cv.id::text=(storage.foldername(name))[1] and (c.user_low=auth.uid() or c.user_high=auth.uid()))
  or exists(select 1 from public.grand_lumen_group_chat_members gm where gm.group_id::text=(storage.foldername(name))[1] and public.grand_lumen_is_group_member(gm.group_id))
 )
);

drop policy if exists grand_lumen_team_attachments_read on storage.objects;
create policy grand_lumen_team_attachments_read on storage.objects for select to authenticated using (
 bucket_id='grand-lumen-team-attachments'
 and (
  exists(select 1 from public.grand_lumen_team_conversations cv join public.grand_lumen_team_connections c on c.id=cv.connection_id where cv.id::text=(storage.foldername(name))[1] and (c.user_low=auth.uid() or c.user_high=auth.uid()))
  or exists(select 1 from public.grand_lumen_group_chat_members gm where gm.group_id::text=(storage.foldername(name))[1] and gm.user_id=auth.uid() and gm.left_at is null)
 )
);

do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='grand_lumen_group_chat_messages') then alter publication supabase_realtime add table public.grand_lumen_group_chat_messages; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='grand_lumen_group_chat_members') then alter publication supabase_realtime add table public.grand_lumen_group_chat_members; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='grand_lumen_group_call_invites') then alter publication supabase_realtime add table public.grand_lumen_group_call_invites; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='grand_lumen_group_call_sessions') then alter publication supabase_realtime add table public.grand_lumen_group_call_sessions; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='grand_lumen_group_call_participants') then alter publication supabase_realtime add table public.grand_lumen_group_call_participants; end if;
 end if;
end;
$$;
