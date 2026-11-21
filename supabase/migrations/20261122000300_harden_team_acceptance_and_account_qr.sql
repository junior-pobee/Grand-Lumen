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

  return connection_key;
end;
$$;

grant execute on function public.grand_lumen_handle_connection_request(uuid, boolean) to authenticated;
