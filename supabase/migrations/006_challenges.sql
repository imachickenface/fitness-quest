-- Fitness Quest: shared quests between two friends (M8.9). Run this once in each Supabase project, after
-- 005_activity.sql (SQL Editor > New query > paste > Run). It only creates things.
--
-- One friend proposes a goal for the next 7 days ("3 workouts each"); the other accepts or declines. Each
-- side's phone counts its own progress and publishes it; both see both. At most 3 open or running per
-- person. Everything changes through the functions below, which act for the signed-in user, except one's
-- own progress row.

create table public.challenges (
  id         uuid        primary key default gen_random_uuid(),
  from_user  uuid        not null references auth.users (id) on delete cascade,
  to_user    uuid        not null references auth.users (id) on delete cascade,
  goal       text        not null check (goal in ('workouts', 'run_km', 'active_days')),
  target     integer     not null check (target between 1 and 200),
  starts     date        not null,
  ends       date        not null,
  status     text        not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user),
  check (ends = starts + 6),
  check (goal <> 'active_days' or target <= 7)
);

create index challenges_from on public.challenges (from_user);
create index challenges_to on public.challenges (to_user);

alter table public.challenges enable row level security;

create policy "see own challenges" on public.challenges
  for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));

revoke all on public.challenges from anon, authenticated;
grant select on public.challenges to authenticated;

create table public.challenge_progress (
  challenge_id uuid        not null references public.challenges (id) on delete cascade,
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  value        numeric     not null check (value between 0 and 100000),
  updated_at   timestamptz not null default clock_timestamp(),
  primary key (challenge_id, user_id)
);

create trigger challenge_progress_touch
before insert or update on public.challenge_progress
for each row execute function public.records_touch();

alter table public.challenge_progress enable row level security;

-- a participant of the challenge
create function public.in_challenge(challenge uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.challenges c
    where c.id = challenge and (select auth.uid()) in (c.from_user, c.to_user)
  );
$$;

-- a participant of a running challenge
create function public.in_running_challenge(challenge uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.challenges c
    where c.id = challenge and c.status = 'accepted'
      and (select auth.uid()) in (c.from_user, c.to_user)
  );
$$;

revoke execute on function public.in_challenge(uuid) from public, anon;
revoke execute on function public.in_running_challenge(uuid) from public, anon;
grant execute on function public.in_challenge(uuid) to authenticated;
grant execute on function public.in_running_challenge(uuid) to authenticated;

create policy "see progress of own challenges" on public.challenge_progress
  for select to authenticated
  using (public.in_challenge(challenge_id));

create policy "publish own progress" on public.challenge_progress
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.in_running_challenge(challenge_id));

create policy "update own progress" on public.challenge_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.in_running_challenge(challenge_id));

revoke all on public.challenge_progress from anon, authenticated;
grant select on public.challenge_progress to authenticated;
grant insert (challenge_id, user_id, value) on public.challenge_progress to authenticated;
-- every column an upsert sends; the rules keep it your own row of a running challenge
grant update (challenge_id, user_id, value) on public.challenge_progress to authenticated;

-- open (pending) or running (accepted and not over) challenges someone is in
create function public.live_challenges(who uuid) returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.challenges c
  where who in (c.from_user, c.to_user)
    and (c.status = 'pending' or (c.status = 'accepted' and c.ends >= current_date - 1));
$$;

revoke execute on function public.live_challenges(uuid) from public, anon, authenticated;

-- Propose a shared quest to a friend, starting on `starts` (the proposer's today) for 7 days.
-- Returns the new id, or: not_friends, too_many (3 open or running for either of you), bad_start.
create function public.propose_challenge(friend uuid, goal text, target integer, starts date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := auth.uid();
  new_id uuid;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if not public.is_friend(friend) then
    return 'not_friends';
  end if;
  -- the phone's today, within a day of the server's either way (time zones)
  if propose_challenge.starts < current_date - 1 or propose_challenge.starts > current_date + 1 then
    return 'bad_start';
  end if;
  perform public.lock_pair(me, friend);
  if public.live_challenges(me) >= 3 or public.live_challenges(friend) >= 3 then
    return 'too_many';
  end if;
  insert into public.challenges (from_user, to_user, goal, target, starts, ends)
  values (me, friend, propose_challenge.goal, propose_challenge.target, propose_challenge.starts,
          propose_challenge.starts + 6)
  returning challenges.id into new_id;
  return new_id::text;
end;
$$;

-- Accept or decline a shared quest a friend proposed. Returns accepted, declined, not_found, too_many.
create function public.answer_challenge(challenge uuid, accept boolean) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c  public.challenges%rowtype;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select * into c from public.challenges
  where id = challenge and to_user = me and status = 'pending' for update;
  if not found then
    return 'not_found';
  end if;
  if not accept then
    update public.challenges set status = 'declined' where id = challenge;
    return 'declined';
  end if;
  if not public.is_friend(c.from_user) then
    return 'not_found';
  end if;
  update public.challenges set status = 'accepted' where id = challenge;
  return 'accepted';
end;
$$;

-- Take back a shared quest you proposed that hasn't been answered. Returns cancelled, not_found.
create function public.cancel_challenge(challenge uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from public.challenges
  where id = challenge and from_user = auth.uid() and status = 'pending';
  return case when found then 'cancelled' else 'not_found' end;
end;
$$;

-- Give up a running shared quest (either side): it ends for both. Returns ended, not_found.
create function public.quit_challenge(challenge uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from public.challenges
  where id = challenge and status = 'accepted' and auth.uid() in (from_user, to_user);
  return case when found then 'ended' else 'not_found' end;
end;
$$;

revoke execute on function public.propose_challenge(uuid, text, integer, date) from public, anon;
revoke execute on function public.answer_challenge(uuid, boolean) from public, anon;
revoke execute on function public.cancel_challenge(uuid) from public, anon;
revoke execute on function public.quit_challenge(uuid) from public, anon;
grant execute on function public.propose_challenge(uuid, text, integer, date) to authenticated;
grant execute on function public.answer_challenge(uuid, boolean) to authenticated;
grant execute on function public.cancel_challenge(uuid) to authenticated;
grant execute on function public.quit_challenge(uuid) to authenticated;
