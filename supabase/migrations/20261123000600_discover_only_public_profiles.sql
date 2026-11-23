create or replace function public.grand_lumen_search_profiles(p_query text default '')
returns table (
  id uuid,
  display_name text,
  username text,
  bio text,
  avatar_url text,
  cover_url text,
  interests text[],
  discoverable boolean,
  profile_viewable boolean,
  allow_requests boolean,
  show_online boolean,
  show_avatar boolean,
  connection_count bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.display_name, p.username,
         p.bio,
         case when p.show_avatar then p.avatar_url else null end,
         p.cover_url,
         p.interests,
         p.discoverable, p.profile_viewable, p.allow_requests, p.show_online, p.show_avatar,
         (select count(*) from public.grand_lumen_team_connections c where c.user_low = p.id or c.user_high = p.id)
  from public.grand_lumen_profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.discoverable
    and p.profile_viewable
    and (coalesce(p_query, '') = ''
      or coalesce(p.username, '') ilike '%' || replace(trim(p_query), '@', '') || '%'
      or coalesce(p.display_name, '') ilike '%' || trim(p_query) || '%')
    and not public.grand_lumen_is_blocked_pair(auth.uid(), p.id)
  order by p.display_name nulls last, p.username
  limit 100;
$$;

revoke all on function public.grand_lumen_search_profiles(text) from public, anon;
grant execute on function public.grand_lumen_search_profiles(text) to authenticated;
