alter table public.grand_lumen_team_messages
add column if not exists deleted_for_everyone boolean not null default false;

create table if not exists public.grand_lumen_team_message_hides (
  message_id uuid not null references public.grand_lumen_team_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.grand_lumen_team_message_hides enable row level security;

revoke all on table public.grand_lumen_team_message_hides from public, anon;
grant select on table public.grand_lumen_team_message_hides to authenticated;

drop policy if exists grand_lumen_message_hides_read_own on public.grand_lumen_team_message_hides;
create policy grand_lumen_message_hides_read_own
on public.grand_lumen_team_message_hides
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.grand_lumen_hide_team_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Sign in to delete this message from your chat.';
  end if;

  if not exists (
    select 1
    from public.grand_lumen_team_messages m
    join public.grand_lumen_team_conversations cv on cv.id = m.conversation_id
    join public.grand_lumen_team_connections c on c.id = cv.connection_id
    where m.id = p_message_id
      and (c.user_low = actor_id or c.user_high = actor_id)
  ) then
    raise exception 'This message is not part of one of your conversations.';
  end if;

  insert into public.grand_lumen_team_message_hides (message_id, user_id)
  values (p_message_id, actor_id)
  on conflict (message_id, user_id) do nothing;

  return true;
end;
$$;

create or replace function public.grand_lumen_delete_team_message_for_everyone(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  affected integer;
begin
  if actor_id is null then
    raise exception 'Sign in to delete this message.';
  end if;

  update public.grand_lumen_team_messages m
  set body = 'This message was deleted',
      deleted_for_everyone = true
  where m.id = p_message_id
    and m.sender_id = actor_id
    and m.deleted_for_everyone = false
    and exists (
      select 1
      from public.grand_lumen_team_conversations cv
      join public.grand_lumen_team_connections c on c.id = cv.connection_id
      where cv.id = m.conversation_id
        and (c.user_low = actor_id or c.user_high = actor_id)
    );

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'Only the sender can delete this message for everyone, or it has already been deleted.';
  end if;

  return true;
end;
$$;

revoke all on function public.grand_lumen_hide_team_message(uuid) from public, anon;
revoke all on function public.grand_lumen_delete_team_message_for_everyone(uuid) from public, anon;
grant execute on function public.grand_lumen_hide_team_message(uuid) to authenticated;
grant execute on function public.grand_lumen_delete_team_message_for_everyone(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'grand_lumen_team_messages'
    ) then
      alter publication supabase_realtime add table public.grand_lumen_team_messages;
    end if;
  end if;
end;
$$;
