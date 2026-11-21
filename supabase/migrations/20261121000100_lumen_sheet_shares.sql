create table if not exists public.lumen_sheet_shares (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  workbook_data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.lumen_sheet_shares enable row level security;

drop policy if exists "Users can create their own Lumen Sheets shares" on public.lumen_sheet_shares;
create policy "Users can create their own Lumen Sheets shares"
on public.lumen_sheet_shares
for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Authenticated users can open shared Lumen Sheets links" on public.lumen_sheet_shares;

drop policy if exists "Owners can delete their Lumen Sheets shares" on public.lumen_sheet_shares;
create policy "Owners can delete their Lumen Sheets shares"
on public.lumen_sheet_shares
for delete
to authenticated
using (auth.uid() = owner_id);

create index if not exists lumen_sheet_shares_token_idx on public.lumen_sheet_shares(token);

create or replace function public.get_lumen_sheet_share(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select workbook_data
  from public.lumen_sheet_shares
  where token = share_token
  limit 1;
$$;

revoke all on function public.get_lumen_sheet_share(uuid) from public;
grant execute on function public.get_lumen_sheet_share(uuid) to authenticated;
