create or replace function public.grand_lumen_add_group_chat_members(p_group_id uuid,p_member_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=public,auth
as $$
declare
 actor uuid:=auth.uid();
 member uuid;
 added integer:=0;
begin
 if actor is null then
  raise exception 'Sign in to add members.';
 end if;

 if not exists(
  select 1
  from public.grand_lumen_group_chat_members
  where group_id=p_group_id
    and user_id=actor
    and left_at is null
 ) then
  raise exception 'Only active group members can add people.';
 end if;

 foreach member in array coalesce(p_member_ids,'{}'::uuid[]) loop
  if member=actor then
   continue;
  end if;

  if not exists(
   select 1
   from public.grand_lumen_team_connections c
   where (c.user_low=actor and c.user_high=member)
      or (c.user_high=actor and c.user_low=member)
  ) then
   raise exception 'Every added person must be connected to you.';
  end if;

  insert into public.grand_lumen_group_chat_members(group_id,user_id,role,added_by,left_at)
  values(p_group_id,member,'member',actor,null)
  on conflict(group_id,user_id) do update
   set left_at=null,added_by=actor,joined_at=now()
   where public.grand_lumen_group_chat_members.left_at is not null;

  if found then
   added:=added+1;
  end if;
 end loop;

 return added;
end;
$$;

revoke all on function public.grand_lumen_add_group_chat_members(uuid,uuid[]) from public,anon;
grant execute on function public.grand_lumen_add_group_chat_members(uuid,uuid[]) to authenticated;
