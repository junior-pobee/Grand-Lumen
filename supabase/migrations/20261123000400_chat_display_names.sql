alter table public.grand_lumen_profiles
  add column if not exists chat_display_name text;

alter table public.grand_lumen_profiles
  drop constraint if exists grand_lumen_profiles_chat_display_name_length_check;

alter table public.grand_lumen_profiles
  add constraint grand_lumen_profiles_chat_display_name_length_check
  check (chat_display_name is null or char_length(btrim(chat_display_name)) between 1 and 80);

create index if not exists grand_lumen_profiles_chat_display_name_idx
  on public.grand_lumen_profiles (id)
  where chat_display_name is not null;
