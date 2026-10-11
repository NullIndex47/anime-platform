begin;
-- Fail safely if an unrelated profiles table already exists.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_key text collate "C" generated always as (lower(username collate "C")) stored,
  constraint profiles_username_unique unique (username_key),
  constraint profiles_username_format check (
    char_length(username) between 3 and 20 and username collate "C" !~ '[^A-Za-z0-9_]'
  ),
  constraint profiles_username_reserved check (
    lower(username collate "C") not in (
      'admin', 'administrator', 'administrador', 'support', 'soporte',
      'yoru', 'moderator', 'moderador', 'mod', 'root', 'system',
      'sistema', 'staff', 'official', 'oficial', 'help', 'api', 'null'
    )
  )
);
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select (id, username) on public.profiles to anon, authenticated;
grant insert (id, username) on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;
create policy profiles_public_read on public.profiles
  for select to anon, authenticated using (true);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
comment on table public.profiles is 'Public YORU identity; created only after the user chooses a valid username.';
commit;
