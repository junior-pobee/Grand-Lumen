drop policy if exists grand_lumen_profiles_read_connected on public.grand_lumen_profiles;

create policy grand_lumen_profiles_read_connected
on public.grand_lumen_profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.grand_lumen_team_connections c
    where (c.user_low = auth.uid() and c.user_high = id)
       or (c.user_high = auth.uid() and c.user_low = id)
  )
  or exists (
    select 1
    from public.grand_lumen_connection_requests r
    where r.status = 'pending'
      and (
        (r.requester_id = auth.uid() and r.recipient_id = id)
        or (r.recipient_id = auth.uid() and r.requester_id = id)
      )
  )
);

grant select on public.grand_lumen_profiles to authenticated;
