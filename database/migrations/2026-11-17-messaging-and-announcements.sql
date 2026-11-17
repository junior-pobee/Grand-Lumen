alter table public.grand_lumen_profiles add column if not exists email text;
create unique index if not exists grand_lumen_profiles_email_idx on public.grand_lumen_profiles(lower(email)) where email is not null;

create or replace function public.grand_lumen_sync_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.grand_lumen_profiles (id, email, display_name, avatar_url)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do update set email = excluded.email, display_name = coalesce(excluded.display_name, public.grand_lumen_profiles.display_name), avatar_url = coalesce(excluded.avatar_url, public.grand_lumen_profiles.avatar_url), updated_at = now();
  return new;
end;
$$;

drop trigger if exists grand_lumen_auth_user_profile on auth.users;
create trigger grand_lumen_auth_user_profile after insert or update of email, raw_user_meta_data on auth.users for each row execute procedure public.grand_lumen_sync_profile();

insert into public.grand_lumen_profiles (id, email, display_name, avatar_url)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1)), raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (id) do update set email = excluded.email, updated_at = now();

create table if not exists public.grand_lumen_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_email text not null,
  sender_name text not null default '',
  recipient_email text not null,
  body text not null check (char_length(body) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index if not exists grand_lumen_messages_conversation_idx on public.grand_lumen_messages(sender_email, recipient_email, created_at);

create table if not exists public.grand_lumen_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  author_email text not null,
  created_at timestamptz not null default now()
);

alter table public.grand_lumen_messages enable row level security;
alter table public.grand_lumen_announcements enable row level security;

drop policy if exists "Users read their own conversations" on public.grand_lumen_messages;
create policy "Users read their own conversations" on public.grand_lumen_messages for select to authenticated using (sender_id = auth.uid() or lower(recipient_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "Users send messages as themselves" on public.grand_lumen_messages;
create policy "Users send messages as themselves" on public.grand_lumen_messages for insert to authenticated with check (sender_id = auth.uid() and lower(sender_email) = lower(auth.jwt() ->> 'email') and lower(recipient_email) <> lower(auth.jwt() ->> 'email'));

drop policy if exists "Users read Grand-Lumen updates" on public.grand_lumen_announcements;
create policy "Users read Grand-Lumen updates" on public.grand_lumen_announcements for select to authenticated using (true);

drop policy if exists "Grand-Lumen owner publishes updates" on public.grand_lumen_announcements;
create policy "Grand-Lumen owner publishes updates" on public.grand_lumen_announcements for insert to authenticated with check (lower(auth.jwt() ->> 'email') = 'emmanuelpobee112@gmail.com' and lower(author_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "Grand-Lumen owner manages updates" on public.grand_lumen_announcements;
create policy "Grand-Lumen owner manages updates" on public.grand_lumen_announcements for delete to authenticated using (lower(auth.jwt() ->> 'email') = 'emmanuelpobee112@gmail.com');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grand_lumen_messages') then
      alter publication supabase_realtime add table public.grand_lumen_messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grand_lumen_announcements') then
      alter publication supabase_realtime add table public.grand_lumen_announcements;
    end if;
  end if;
end;
$$;
