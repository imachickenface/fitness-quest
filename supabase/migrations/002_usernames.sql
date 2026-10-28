-- Fitness Quest: one username per account, picked after the first sign-in. No two accounts share a name,
-- whatever the capitals ("Sam" and "sam" are the same name). Run this once in each Supabase project, after
-- 001_records.sql (SQL Editor > New query > paste > Run). It only creates things.
--
-- Access rules: a signed-in user can read, pick and change only their own username. Nobody can list or
-- read other people's names; the only thing anyone learns about another account is that a name is taken,
-- when they try to pick it. Signed-out requests can do nothing. The row goes with the account
-- (delete_my_account() deletes the auth user, and the foreign key removes the row).

create table public.usernames (
  user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  -- 3-20 letters, digits or underscores: safe to show anywhere, no look-alike spaces or symbols
  username   text        not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

create unique index usernames_unique on public.usernames (lower(username));

alter table public.usernames enable row level security;

create policy "read own username" on public.usernames
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "pick own username" on public.usernames
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "change own username" on public.usernames
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Only the name itself can be written; no deletes, and no access at all without signing in.
revoke all on public.usernames from anon, authenticated;
grant select on public.usernames to authenticated;
grant insert (user_id, username) on public.usernames to authenticated;
grant update (username) on public.usernames to authenticated;
