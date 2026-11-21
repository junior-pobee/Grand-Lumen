insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'grand-lumen-team-attachments',
  'grand-lumen-team-attachments',
  false,
  52428800,
  array[
    'image/*',
    'video/*',
    'audio/*',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists grand_lumen_team_attachments_upload on storage.objects;
create policy grand_lumen_team_attachments_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'grand-lumen-team-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.grand_lumen_team_conversations cv
    join public.grand_lumen_team_connections c on c.id = cv.connection_id
    where cv.id::text = (storage.foldername(name))[1]
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

drop policy if exists grand_lumen_team_attachments_read on storage.objects;
create policy grand_lumen_team_attachments_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'grand-lumen-team-attachments'
  and exists (
    select 1
    from public.grand_lumen_team_conversations cv
    join public.grand_lumen_team_connections c on c.id = cv.connection_id
    where cv.id::text = (storage.foldername(name))[1]
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

drop policy if exists grand_lumen_team_attachments_delete_own on storage.objects;
create policy grand_lumen_team_attachments_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'grand-lumen-team-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
);

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
    raise exception 'Sign in to delete this message.';
  end if;

  if not exists (
    select 1
    from public.grand_lumen_team_messages m
    join public.grand_lumen_team_conversations cv on cv.id = m.conversation_id
    join public.grand_lumen_team_connections c on c.id = cv.connection_id
    where m.id = p_message_id
      and m.sender_id = actor_id
      and (c.user_low = actor_id or c.user_high = actor_id)
  ) then
    raise exception 'You can only delete messages that you sent.';
  end if;

  insert into public.grand_lumen_team_message_hides (message_id, user_id)
  values (p_message_id, actor_id)
  on conflict (message_id, user_id) do nothing;

  return true;
end;
$$;

revoke all on function public.grand_lumen_hide_team_message(uuid) from public, anon;
grant execute on function public.grand_lumen_hide_team_message(uuid) to authenticated;
