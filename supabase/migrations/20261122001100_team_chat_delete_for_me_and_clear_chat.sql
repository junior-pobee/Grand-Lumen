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

create or replace function public.grand_lumen_clear_team_chat_for_me(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Sign in to clear this chat.';
  end if;

  if not exists (
    select 1
    from public.grand_lumen_team_conversations cv
    join public.grand_lumen_team_connections c on c.id = cv.connection_id
    where cv.id = p_conversation_id
      and (c.user_low = actor_id or c.user_high = actor_id)
  ) then
    raise exception 'This conversation is not available to your account.';
  end if;

  insert into public.grand_lumen_team_message_hides (message_id, user_id)
  select m.id, actor_id
  from public.grand_lumen_team_messages m
  where m.conversation_id = p_conversation_id
  on conflict (message_id, user_id) do nothing;

  return true;
end;
$$;

revoke all on function public.grand_lumen_hide_team_message(uuid) from public, anon;
revoke all on function public.grand_lumen_clear_team_chat_for_me(uuid) from public, anon;
grant execute on function public.grand_lumen_hide_team_message(uuid) to authenticated;
grant execute on function public.grand_lumen_clear_team_chat_for_me(uuid) to authenticated;
