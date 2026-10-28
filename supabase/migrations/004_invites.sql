-- Fitness Quest: invite links (M8.6). Run this once in each Supabase project, after 003_friends.sql
-- (SQL Editor > New query > paste > Run). It only creates things.
--
-- An invite is a random token its owner shares as a link or QR code (.../fitness-quest/#invite=<token>).
-- Whoever opens it and taps "Add friend" becomes the owner's friend straight away: sharing the link was
-- the owner's yes. A link works for 7 days and for anyone it reaches, so the app says so when sharing; its
-- owner can cancel it sooner. At most 5 live links per account.
--
-- Access rules: you see and cancel only your own invites. Tokens are made by the server (122 random bits);
-- using one goes through redeem_invite(), which acts for the signed-in user. Nothing without signing in.

create table public.invites (
  token      text        primary key check (token ~ '^[0-9a-f]{32}$'),
  owner      uuid        not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create index invites_owner on public.invites (owner);

alter table public.invites enable row level security;

create policy "see own invites" on public.invites
  for select to authenticated
  using ((select auth.uid()) = owner);

create policy "cancel own invites" on public.invites
  for delete to authenticated
  using ((select auth.uid()) = owner);

revoke all on public.invites from anon, authenticated;
grant select, delete on public.invites to authenticated;

-- Make a new invite link. Returns the token, or null with 5 live ones already.
create function public.create_invite() returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me        uuid := auth.uid();
  new_token text;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  delete from public.invites where owner = me and expires_at <= now();
  if (select count(*) from public.invites where owner = me) >= 5 then
    return null;
  end if;
  new_token := replace(gen_random_uuid()::text, '-', '');
  insert into public.invites (token, owner) values (new_token, me);
  return new_token;
end;
$$;

-- Who made this invite, for "<name> invited you". Null when the link is unknown, expired, yours, or
-- between people where one blocked the other (so a link never reveals a block).
create function public.invite_owner_name(invite text) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.username
  from public.invites i
  join public.usernames u on u.user_id = i.owner
  where i.token = invite
    and i.expires_at > now()
    and i.owner <> (select auth.uid())
    and not exists (
      select 1 from public.friendships f
      where f.user_a = least(i.owner, (select auth.uid()))
        and f.user_b = greatest(i.owner, (select auth.uid()))
        and f.status = 'blocked'
    );
$$;

-- Use an invite: become friends with its owner.
-- Returns: friends, already_friends, own, expired (also unknown links and blocks either way),
-- too_many_friends, no_username.
create function public.redeem_invite(invite text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me    uuid := auth.uid();
  them  uuid;
  state text;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from public.usernames where user_id = me) then
    return 'no_username';
  end if;
  select owner into them from public.invites where token = invite and expires_at > now();
  if them is null then
    return 'expired';
  end if;
  if them = me then
    return 'own';
  end if;

  perform public.lock_pair(me, them);
  select status into state from public.friendships
  where user_a = least(me, them) and user_b = greatest(me, them);
  if state = 'accepted' then
    return 'already_friends';
  elsif state = 'blocked' then
    return 'expired';
  end if;
  if public.friend_count(me) >= 100 or public.friend_count(them) >= 100 then
    return 'too_many_friends';
  end if;
  insert into public.friendships (user_a, user_b, status, requested_by)
  values (least(me, them), greatest(me, them), 'accepted', them)
  on conflict (user_a, user_b) do update
    set status = 'accepted', updated_at = now();
  return 'friends';
end;
$$;

revoke execute on function public.create_invite() from public, anon;
revoke execute on function public.invite_owner_name(text) from public, anon;
revoke execute on function public.redeem_invite(text) from public, anon;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.invite_owner_name(text) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
