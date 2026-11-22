insert into public.grand_lumen_group_chat_members(group_id,user_id,role,added_by,left_at)
select g.id,g.created_by,'admin',g.created_by,null
from public.grand_lumen_group_chats g
on conflict(group_id,user_id) do update
set role='admin',added_by=excluded.added_by,left_at=null;

create or replace function public.grand_lumen_create_group_chat(p_name text,p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
 actor uuid:=auth.uid();
 new_group uuid;
 member uuid;
begin
 if actor is null then raise exception 'Sign in to create a group.'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'Group name must be between 1 and 80 characters.'; end if;
 insert into public.grand_lumen_group_chats(name,created_by)
 values(trim(p_name),actor)
 returning id into new_group;
 insert into public.grand_lumen_group_chat_members(group_id,user_id,role,added_by,left_at)
 values(new_group,actor,'admin',actor,null)
 on conflict(group_id,user_id) do update
 set role='admin',added_by=actor,left_at=null;
 foreach member in array coalesce(p_member_ids,'{}'::uuid[]) loop
  if member=actor then continue; end if;
  if not exists(
   select 1 from public.grand_lumen_team_connections c
   where (c.user_low=actor and c.user_high=member)
      or (c.user_high=actor and c.user_low=member)
  ) then raise exception 'Every invited person must be connected to you.'; end if;
  insert into public.grand_lumen_group_chat_members(group_id,user_id,role,added_by,left_at)
  values(new_group,member,'member',actor,null)
  on conflict(group_id,user_id) do update
  set role='member',added_by=actor,left_at=null
  where public.grand_lumen_group_chat_members.left_at is not null;
 end loop;
 return new_group;
end;
$$;

revoke all on function public.grand_lumen_create_group_chat(text,uuid[]) from public,anon;
grant execute on function public.grand_lumen_create_group_chat(text,uuid[]) to authenticated;
