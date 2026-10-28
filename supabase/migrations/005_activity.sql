-- Fitness Quest: what friends did lately, and cheers (M8.7). Run this once in each Supabase project,
-- after 004_invites.sql (SQL Editor > New query > paste > Run). It only creates things.
--
-- activity: short items a phone publishes about the last 30 days (a workout's name and size, a run's
-- distance and time, a finished quest, a new best lift; see PublicActivity in src/contract.ts). Only the
-- owner writes and removes them; the owner and accepted friends read them. Turning off "share my workouts"
-- removes them all.
-- cheers: one per friend per item. A friend adds or takes back their own cheer; the item's owner and the
-- cheerer can see it. Cheers go with their item, and both go with the account.

create table public.activity (
  owner      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null check (char_length(id) between 1 and 120),
  data       jsonb       not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 2048),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (owner, id)
);

create trigger activity_touch
before insert or update on public.activity
for each row execute function public.records_touch();

alter table public.activity enable row level security;

create policy "read own or friends' activity" on public.activity
  for select to authenticated
  using ((select auth.uid()) = owner or public.is_friend(owner));

create policy "publish own activity" on public.activity
  for insert to authenticated
  with check ((select auth.uid()) = owner);

create policy "update own activity" on public.activity
  for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

create policy "remove own activity" on public.activity
  for delete to authenticated
  using ((select auth.uid()) = owner);

revoke all on public.activity from anon, authenticated;
grant select, delete on public.activity to authenticated;
grant insert (owner, id, data) on public.activity to authenticated;
-- owner and id too, because an upsert sets every column it sends; the rules keep them your own
grant update (owner, id, data) on public.activity to authenticated;

-- At most 200 items per account, so one phone can't fill the free database.
create function public.activity_limit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.activity where owner = new.owner) >= 200 then
    raise exception 'too many activity items' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.activity_limit() from public, anon, authenticated;

create trigger activity_limit
before insert on public.activity
for each row execute function public.activity_limit();

create table public.cheers (
  owner       uuid        not null,
  activity_id text        not null,
  from_user   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (owner, activity_id, from_user),
  foreign key (owner, activity_id) references public.activity (owner, id) on delete cascade
);

create index cheers_from on public.cheers (from_user);

alter table public.cheers enable row level security;

create policy "see cheers on own items or own cheers" on public.cheers
  for select to authenticated
  using ((select auth.uid()) in (owner, from_user));

-- only friends cheer, never on their own items
create policy "cheer a friend" on public.cheers
  for insert to authenticated
  with check (
    (select auth.uid()) = from_user
    and owner <> (select auth.uid())
    and public.is_friend(owner)
  );

create policy "take back own cheer" on public.cheers
  for delete to authenticated
  using ((select auth.uid()) = from_user);

revoke all on public.cheers from anon, authenticated;
grant select, delete on public.cheers to authenticated;
grant insert (owner, activity_id, from_user) on public.cheers to authenticated;
