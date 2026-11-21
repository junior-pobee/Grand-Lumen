create table if not exists public.grand_lumen_team_message_reads (
  message_id uuid not null references public.grand_lumen_team_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.grand_lumen_team_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);

alter table public.grand_lumen_team_message_reads enable row level security;
alter table public.grand_lumen_team_push_subscriptions enable row level security;

drop policy if exists grand_lumen_message_reads_select_own on public.grand_lumen_team_message_reads;
create policy grand_lumen_message_reads_select_own on public.grand_lumen_team_message_reads
for select to authenticated using (user_id = auth.uid());

drop policy if exists grand_lumen_message_reads_insert_own on public.grand_lumen_team_message_reads;
create policy grand_lumen_message_reads_insert_own on public.grand_lumen_team_message_reads
for insert to authenticated with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.grand_lumen_team_messages m
    join public.grand_lumen_team_conversations cv on cv.id = m.conversation_id
    join public.grand_lumen_team_connections c on c.id = cv.connection_id
    where m.id = message_id
      and m.sender_id <> auth.uid()
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

drop policy if exists grand_lumen_message_reads_update_own on public.grand_lumen_team_message_reads;
create policy grand_lumen_message_reads_update_own on public.grand_lumen_team_message_reads
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists grand_lumen_push_subscriptions_manage_own on public.grand_lumen_team_push_subscriptions;
create policy grand_lumen_push_subscriptions_manage_own on public.grand_lumen_team_push_subscriptions
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.grand_lumen_team_message_reads to authenticated;
grant select, insert, update, delete on public.grand_lumen_team_push_subscriptions to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grand_lumen_team_message_reads'
    ) then
      alter publication supabase_realtime add table public.grand_lumen_team_message_reads;
    end if;
  end if;
end;
$$;
