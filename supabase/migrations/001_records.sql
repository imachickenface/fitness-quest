-- Fitness Quest: one table holds every synced record, one row per record, owned by one account.
-- Run this once in each Supabase project (SQL Editor > New query > paste > Run). Safe to read: it only
-- creates things, it never drops or changes existing data.
--
-- Access rules (Row Level Security): a signed-in user can read, add and change only rows whose user_id
-- is their own id. Signed-out requests (the publishable key alone) can do nothing. Rows are never
-- deleted one by one: the app marks them `deleted` so the delete reaches the user's other phones. The
-- whole account and all its rows go only through delete_my_account().

create table public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('profile', 'foods', 'foodEntries', 'savedMeals',
                                                  'workouts', 'weighIns', 'programs', 'quests')),
  id         text        not null check (char_length(id) between 1 and 200),
  data       jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, id),
  -- a live row has data; a deleted one may drop it
  check (deleted or data is not null),
  -- one record is small (a workout is ~1 KB); this stops one account filling the free database
  check (pg_column_size(data) <= 65536)
);

-- "what changed since my last pull" for one account
create index records_pull on public.records (user_id, updated_at);

-- The server sets updated_at on every write, so a phone's clock never decides which version is newer.
create function public.records_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger records_touch
before insert or update on public.records
for each row execute function public.records_touch();

-- Row Level Security: own rows only.
alter table public.records enable row level security;

create policy "read own records" on public.records
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "add own records" on public.records
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "change own records" on public.records
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy, and no access at all without signing in.
revoke all on public.records from anon;
revoke delete, truncate, references, trigger on public.records from authenticated;
grant select, insert, update on public.records to authenticated;

-- Delete the caller's account and every row they own. It can only ever act on auth.uid().
create function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  delete from public.records where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
