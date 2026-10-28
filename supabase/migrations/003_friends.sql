-- Fitness Quest: friends and the profile friends see (M8). Run this once in each Supabase project, after
-- 002_usernames.sql (SQL Editor > New query > paste > Run). It only creates things, apart from adding one
-- read rule to usernames.
--
-- Access rules:
-- - friendships: you see the rows you are in (except a block someone else placed on you). Rows change only
--   through the functions below, which always act for the signed-in user (auth.uid()).
-- - profiles: the summary a phone publishes (no health data; see PublicProfile in src/contract.ts). Only
--   its owner writes it; the owner and accepted friends read it.
-- - usernames: you can now also read the names of people you are friends with or have an open request with.
-- - Nothing at all without signing in. Rows go with the account (foreign keys cascade).

-- ---------- friendships ----------

-- One row per pair, smaller id first. pending: requested_by asked the other; accepted: friends;
-- blocked: requested_by blocked the other.
create table public.friendships (
  user_a       uuid        not null references auth.users (id) on delete cascade,
  user_b       uuid        not null references auth.users (id) on delete cascade,
  status       text        not null check (status in ('pending', 'accepted', 'blocked')),
  requested_by uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by in (user_a, user_b))
);

create index friendships_b on public.friendships (user_b);

alter table public.friendships enable row level security;

-- a blocked person never learns they were blocked
create policy "see own friendships" on public.friendships
  for select to authenticated
  using (
    (select auth.uid()) in (user_a, user_b)
    and (status <> 'blocked' or requested_by = (select auth.uid()))
  );

revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

-- ---------- helpers for the access rules ----------
-- They answer only about the caller's own relationships, so they can't be used to learn about others.

create function public.is_friend(other uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_a = least((select auth.uid()), other)
      and f.user_b = greatest((select auth.uid()), other)
      and f.status = 'accepted'
  );
$$;

-- friends, or an open request either way
create function public.is_connected(other uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_a = least((select auth.uid()), other)
      and f.user_b = greatest((select auth.uid()), other)
      and f.status in ('pending', 'accepted')
  );
$$;

revoke execute on function public.is_friend(uuid) from public, anon;
revoke execute on function public.is_connected(uuid) from public, anon;
grant execute on function public.is_friend(uuid) to authenticated;
grant execute on function public.is_connected(uuid) to authenticated;

-- ---------- usernames: friends can read each other's ----------

create policy "read connected usernames" on public.usernames
  for select to authenticated
  using (public.is_connected(user_id));

-- ---------- profiles ----------

create table public.profiles (
  user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb       not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 8192),
  updated_at timestamptz not null default clock_timestamp()
);

create trigger profiles_touch
before insert or update on public.profiles
for each row execute function public.records_touch();

alter table public.profiles enable row level security;

create policy "read own or friends' profiles" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id or public.is_friend(user_id));

create policy "publish own profile" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "update own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (user_id, data) on public.profiles to authenticated;
-- user_id too, because an upsert sets every column it sends; the rule above keeps it your own id
grant update (user_id, data) on public.profiles to authenticated;

-- ---------- changing friendships ----------
-- Each function locks the pair first, so two requests crossing at the same moment can't both insert.

create function public.lock_pair(a uuid, b uuid) returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(least(a, b)::text || greatest(a, b)::text, 0));
$$;

revoke execute on function public.lock_pair(uuid, uuid) from public, anon, authenticated;

create function public.friend_count(who uuid) returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.friendships f
  where who in (f.user_a, f.user_b) and f.status = 'accepted';
$$;

revoke execute on function public.friend_count(uuid) from public, anon, authenticated;

-- Ask someone to be friends, by their exact username (capitals don't matter).
-- Returns: sent, accepted (they had already asked you), already_sent, already_friends, not_found, self,
-- blocked (you blocked them: unblock first), too_many_requests (20 open), too_many_friends (100),
-- no_username (pick yours first).
-- Someone who blocked you looks like not_found.
create function public.send_friend_request(target_username text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := auth.uid();
  them   uuid;
  existing public.friendships%rowtype;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from public.usernames where user_id = me) then
    return 'no_username';
  end if;
  select user_id into them from public.usernames where lower(username) = lower(target_username);
  if them is null then
    return 'not_found';
  end if;
  if them = me then
    return 'self';
  end if;

  perform public.lock_pair(me, them);
  select * into existing from public.friendships
  where user_a = least(me, them) and user_b = greatest(me, them);

  if found then
    if existing.status = 'accepted' then
      return 'already_friends';
    elsif existing.status = 'blocked' then
      return case when existing.requested_by = me then 'blocked' else 'not_found' end;
    elsif existing.requested_by = me then
      return 'already_sent';
    else
      -- they asked first: asking back accepts
      if public.friend_count(me) >= 100 or public.friend_count(them) >= 100 then
        return 'too_many_friends';
      end if;
      update public.friendships set status = 'accepted', updated_at = now()
      where user_a = existing.user_a and user_b = existing.user_b;
      return 'accepted';
    end if;
  end if;

  if (select count(*) from public.friendships
      where requested_by = me and status = 'pending') >= 20 then
    return 'too_many_requests';
  end if;
  if public.friend_count(me) >= 100 then
    return 'too_many_friends';
  end if;

  insert into public.friendships (user_a, user_b, status, requested_by)
  values (least(me, them), greatest(me, them), 'pending', me);
  return 'sent';
end;
$$;

-- Accept or decline a request someone sent you. Returns: accepted, declined, not_found, too_many_friends.
create function public.answer_friend_request(other uuid, accept boolean) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  perform public.lock_pair(me, other);
  if not exists (
    select 1 from public.friendships
    where user_a = least(me, other) and user_b = greatest(me, other)
      and status = 'pending' and requested_by = other
  ) then
    return 'not_found';
  end if;
  if not accept then
    delete from public.friendships where user_a = least(me, other) and user_b = greatest(me, other);
    return 'declined';
  end if;
  if public.friend_count(me) >= 100 or public.friend_count(other) >= 100 then
    return 'too_many_friends';
  end if;
  update public.friendships set status = 'accepted', updated_at = now()
  where user_a = least(me, other) and user_b = greatest(me, other);
  return 'accepted';
end;
$$;

-- Unfriend someone, or take back a request you sent. A block stays (use unblock_user).
-- Returns: removed, not_found.
create function public.remove_friend(other uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  perform public.lock_pair(me, other);
  delete from public.friendships
  where user_a = least(me, other) and user_b = greatest(me, other)
    and (status = 'accepted' or (status = 'pending' and requested_by = me));
  return case when found then 'removed' else 'not_found' end;
end;
$$;

-- Block someone: ends any friendship or request between you, and stops them asking again.
-- Returns: blocked.
create function public.block_user(other uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if other = me or not exists (select 1 from auth.users where id = other) then
    return 'blocked'; -- nothing to do, and no hint whether the account exists
  end if;
  perform public.lock_pair(me, other);
  insert into public.friendships (user_a, user_b, status, requested_by)
  values (least(me, other), greatest(me, other), 'blocked', me)
  on conflict (user_a, user_b) do update
    set status = 'blocked', requested_by = me, updated_at = now()
    -- a block they placed on you stays theirs
    where public.friendships.status <> 'blocked';
  return 'blocked';
end;
$$;

-- Undo your block. Returns: unblocked, not_found.
create function public.unblock_user(other uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  perform public.lock_pair(me, other);
  delete from public.friendships
  where user_a = least(me, other) and user_b = greatest(me, other)
    and status = 'blocked' and requested_by = me;
  return case when found then 'unblocked' else 'not_found' end;
end;
$$;

revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.answer_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.remove_friend(uuid) from public, anon;
revoke execute on function public.block_user(uuid) from public, anon;
revoke execute on function public.unblock_user(uuid) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.answer_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
