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
  new_connection_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond to connection requests.';
  end if;

  update public.grand_lumen_connection_requests as requests
  set status = case when accept_request then 'accepted' else 'declined' end,
      responded_at = now()
  where requests.id = request_id
    and requests.recipient_id = auth.uid()
    and requests.status = 'pending'
  returning requests.* into request_row;

  if not found then
    raise exception 'This request is no longer pending or does not belong to your account.';
  end if;

  if not accept_request then
    return request_row.id;
  end if;

  insert into public.grand_lumen_team_connections as connections (user_low, user_high)
  values (
    least(request_row.requester_id, request_row.recipient_id),
    greatest(request_row.requester_id, request_row.recipient_id)
  )
  on conflict (user_low, user_high) do update
  set user_low = excluded.user_low
  returning connections.id into new_connection_id;

  insert into public.grand_lumen_team_conversations (connection_id)
  values (new_connection_id)
  on conflict (connection_id) do nothing;

  return new_connection_id;
end;
$$;

grant execute on function public.grand_lumen_respond_connection_request(uuid, boolean) to authenticated;
