create or replace function public.grand_lumen_notify_team_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  actor uuid := auth.uid();
  target uuid;
  sender_name text;
begin
  if actor is null then
    raise exception 'Sign in to send a message notification.';
  end if;

  select
    case when c.user_low = actor then c.user_high else c.user_low end,
    coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'A connection')
  into target, sender_name
  from public.grand_lumen_team_messages m
  join public.grand_lumen_team_conversations cv on cv.id = m.conversation_id
  join public.grand_lumen_team_connections c on c.id = cv.connection_id
  left join public.grand_lumen_profiles p on p.id = actor
  where m.id = p_message_id
    and m.sender_id = actor
    and (c.user_low = actor or c.user_high = actor);

  if target is null then
    raise exception 'The message or connected recipient could not be verified.';
  end if;

  insert into public.grand_lumen_notifications (user_id, title, body, kind, related_id)
  values (target, 'New message', 'You have a new message from ' || sender_name || '.', 'message', p_message_id);

  return true;
end;
$$;

revoke all on function public.grand_lumen_notify_team_message(uuid) from public, anon;
grant execute on function public.grand_lumen_notify_team_message(uuid) to authenticated;
