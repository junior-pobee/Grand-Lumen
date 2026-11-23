create or replace function public.grand_lumen_handle_connection_request(
  p_request_id uuid,
  p_accept boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  request_row public.grand_lumen_connection_requests%rowtype;
  connection_key uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond to connection requests.';
  end if;

  select requests.*
  into request_row
  from public.grand_lumen_connection_requests as requests
  where requests.id = p_request_id
    and requests.recipient_id = auth.uid()
    and requests.status = 'pending'
  for update;

  if not found then
    raise exception 'This request is no longer pending or does not belong to your signed-in account.';
  end if;

  if not p_accept then
    update public.grand_lumen_connection_requests
    set status = 'declined',
        responded_at = now()
    where id = p_request_id;
    return p_request_id;
  end if;

  insert into public.grand_lumen_team_connections (user_low, user_high)
  values (
    least(request_row.requester_id, request_row.recipient_id),
    greatest(request_row.requester_id, request_row.recipient_id)
  )
  on conflict (user_low, user_high) do nothing;

  select connections.id
  into connection_key
  from public.grand_lumen_team_connections as connections
  where connections.user_low = least(request_row.requester_id, request_row.recipient_id)
    and connections.user_high = greatest(request_row.requester_id, request_row.recipient_id);

  if connection_key is null then
    raise exception 'The connection record could not be created.';
  end if;

  insert into public.grand_lumen_team_conversations (connection_id)
  values (connection_key)
  on conflict (connection_id) do nothing;

  update public.grand_lumen_connection_requests
  set status = 'accepted',
      responded_at = now()
  where id = p_request_id;

  insert into public.grand_lumen_notifications (user_id, title, body, kind, related_id)
  values (
    request_row.requester_id,
    'Connection request accepted',
    'Your connection request was accepted. You can now chat in Team.',
    'connection_accepted',
    p_request_id
  );

  return connection_key;
end;
$$;

grant execute on function public.grand_lumen_handle_connection_request(uuid, boolean) to authenticated;

create or replace function public.grand_lumen_get_moment_authors(p_author_ids uuid[])
returns table (
  id uuid,
  display_name text,
  username text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select distinct p.id, p.display_name, p.username
  from public.grand_lumen_profiles p
  where auth.uid() is not null
    and p.id = any(coalesce(p_author_ids, '{}'::uuid[]))
    and not public.grand_lumen_is_blocked_pair(auth.uid(), p.id)
    and exists (
      select 1
      from public.grand_lumen_moments m
      where m.author_id = p.id
        and m.expires_at > now()
        and (
          m.author_id = auth.uid()
          or m.visibility = 'public'
          or (m.visibility = 'connections' and exists (
            select 1
            from public.grand_lumen_team_connections c
            where (c.user_low = auth.uid() and c.user_high = m.author_id)
               or (c.user_high = auth.uid() and c.user_low = m.author_id)
          ))
          or (m.visibility = 'tagged' and exists (
            select 1 from public.grand_lumen_moment_tags t
            where t.moment_id = m.id and t.user_id = auth.uid()
          ))
          or exists (
            select 1 from public.grand_lumen_moment_tags t
            where t.moment_id = m.id and t.user_id = auth.uid()
          )
        )
    );
$$;

revoke all on function public.grand_lumen_get_moment_authors(uuid[]) from public, anon;
grant execute on function public.grand_lumen_get_moment_authors(uuid[]) to authenticated;
