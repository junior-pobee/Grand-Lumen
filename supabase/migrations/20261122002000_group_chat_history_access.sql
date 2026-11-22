drop policy if exists grand_lumen_group_messages_read_active_members on public.grand_lumen_group_chat_messages;
create policy grand_lumen_group_messages_read_active_members
on public.grand_lumen_group_chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.grand_lumen_group_chat_members gm
    where gm.group_id = grand_lumen_group_chat_messages.group_id
      and gm.user_id = auth.uid()
      and gm.left_at is null
  )
);

grant select on public.grand_lumen_group_chat_messages to authenticated;

drop policy if exists grand_lumen_group_members_read_active_members on public.grand_lumen_group_chat_members;
create policy grand_lumen_group_members_read_active_members
on public.grand_lumen_group_chat_members
for select
to authenticated
using (
  exists (
    select 1
    from public.grand_lumen_group_chat_members active_member
    where active_member.group_id = grand_lumen_group_chat_members.group_id
      and active_member.user_id = auth.uid()
      and active_member.left_at is null
  )
);

grant select on public.grand_lumen_group_chat_members to authenticated;
