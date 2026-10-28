/**
 * Friends and published profiles on the server (supabase/migrations/003_friends.sql). The server's rules
 * decide who sees what; this file only calls them. Everything read from other accounts is checked with the
 * contract before the app uses it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PublicActivity, PublicProfile } from '../contract.ts';
import { CHALLENGE_GOALS, type ChallengeGoal } from '../core/social/challenge.ts';

export type RequestResult =
  | 'sent'
  | 'accepted'
  | 'already_sent'
  | 'already_friends'
  | 'not_found'
  | 'self'
  | 'blocked'
  | 'too_many_requests'
  | 'too_many_friends'
  | 'no_username';

export type Relation = 'friend' | 'incoming' | 'outgoing' | 'blocked';

/** Someone this account has a friendship row with, as the server shows it to this account. */
export type Contact = {
  id: string;
  relation: Relation;
  username?: string;
  /** friends only, and only once they've published one */
  profile?: PublicProfile;
  since: string;
};

type Row = {
  user_a: string;
  user_b: string;
  status: 'pending' | 'accepted' | 'blocked';
  requested_by: string;
  updated_at: string;
};

const fail = (what: string, message: string) => new Error(`${what}: ${message}`);

/** Publish this account's summary for its friends (insert or replace). */
export async function publishProfile(
  c: SupabaseClient,
  userId: string,
  data: PublicProfile,
): Promise<void> {
  const { error } = await c
    .from('profiles')
    .upsert({ user_id: userId, data }, { onConflict: 'user_id' });
  if (error) throw fail('publish profile', error.message);
}

/** Everyone this account is connected to, with names and (for friends) their checked profiles. */
export async function fetchContacts(c: SupabaseClient, me: string): Promise<Contact[]> {
  const { data, error } = await c
    .from('friendships')
    .select('user_a, user_b, status, requested_by, updated_at')
    .returns<Row[]>();
  if (error) throw fail('friends', error.message);
  const rows = data ?? [];
  const contacts: Contact[] = rows.map((r) => {
    const id = r.user_a === me ? r.user_b : r.user_a;
    const relation: Relation =
      r.status === 'accepted'
        ? 'friend'
        : r.status === 'blocked'
          ? 'blocked'
          : r.requested_by === me
            ? 'outgoing'
            : 'incoming';
    return { id, relation, since: r.updated_at };
  });
  const ids = contacts.map((x) => x.id);
  if (ids.length === 0) return contacts;

  const [names, profiles] = await Promise.all([
    c.from('usernames').select('user_id, username').in('user_id', ids),
    c
      .from('profiles')
      .select('user_id, data')
      .in(
        'user_id',
        contacts.filter((x) => x.relation === 'friend').map((x) => x.id),
      ),
  ]);
  if (names.error) throw fail('names', names.error.message);
  if (profiles.error) throw fail('profiles', profiles.error.message);
  const nameOf = new Map(
    (names.data as { user_id: string; username: string }[]).map((n) => [n.user_id, n.username]),
  );
  const profileOf = new Map<string, PublicProfile>();
  for (const p of profiles.data as { user_id: string; data: unknown }[]) {
    const checked = PublicProfile.safeParse(p.data);
    if (checked.success) profileOf.set(p.user_id, checked.data); // a bad one is shown as no profile
  }
  return contacts.map((x) => {
    const username = nameOf.get(x.id);
    const profile = profileOf.get(x.id);
    return { ...x, ...(username ? { username } : {}), ...(profile ? { profile } : {}) };
  });
}

async function call<T extends string | null>(
  c: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw fail(fn, error.message);
  return data as T;
}

export const sendRequest = (c: SupabaseClient, username: string) =>
  call<RequestResult>(c, 'send_friend_request', { target_username: username });

export const answerRequest = (c: SupabaseClient, other: string, accept: boolean) =>
  call<'accepted' | 'declined' | 'not_found' | 'too_many_friends'>(c, 'answer_friend_request', {
    other,
    accept,
  });

export const removeFriend = (c: SupabaseClient, other: string) =>
  call<'removed' | 'not_found'>(c, 'remove_friend', { other });

export const blockUser = (c: SupabaseClient, other: string) =>
  call<'blocked'>(c, 'block_user', { other });

export const unblockUser = (c: SupabaseClient, other: string) =>
  call<'unblocked' | 'not_found'>(c, 'unblock_user', { other });

/** What to tell the person after they send a request. */
export function requestMessage(r: RequestResult, username: string): string {
  switch (r) {
    case 'sent':
      return `Request sent to ${username}.`;
    case 'accepted':
      return `${username} had already asked you, so you're friends now.`;
    case 'already_sent':
      return `You've already asked ${username}. They need to accept.`;
    case 'already_friends':
      return `You and ${username} are already friends.`;
    case 'not_found':
      return `No one is called ${username}. Check the spelling.`;
    case 'self':
      return "That's your own username.";
    case 'blocked':
      return `You blocked ${username}. Unblock them first.`;
    case 'too_many_requests':
      return 'You have 20 requests waiting. Wait for some answers, or take one back.';
    case 'too_many_friends':
      return 'You already have 100 friends, the most there can be.';
    case 'no_username':
      return 'Pick your own username first.';
  }
}

// ---------- invite links (004_invites.sql) ----------

export type RedeemResult =
  'friends' | 'already_friends' | 'own' | 'expired' | 'too_many_friends' | 'no_username';

export type Invite = { token: string; expiresAt: string };

/** A new invite token, or null when 5 links are already live. */
export const createInvite = (c: SupabaseClient) => call<string | null>(c, 'create_invite', {});

/** This account's live invite links, newest first. */
export async function listInvites(c: SupabaseClient): Promise<Invite[]> {
  const { data, error } = await c
    .from('invites')
    .select('token, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw fail('invites', error.message);
  return (data as { token: string; expires_at: string }[]).map((i) => ({
    token: i.token,
    expiresAt: i.expires_at,
  }));
}

export async function cancelInvite(c: SupabaseClient, token: string): Promise<void> {
  const { error } = await c.from('invites').delete().eq('token', token);
  if (error) throw fail('cancel invite', error.message);
}

/** Who made an invite, or null when it can't be used. */
export const inviteOwnerName = (c: SupabaseClient, token: string) =>
  call<string | null>(c, 'invite_owner_name', { invite: token });

export const redeemInvite = (c: SupabaseClient, token: string) =>
  call<RedeemResult>(c, 'redeem_invite', { invite: token });

/** The link to share: the token sits after `#`, so it never reaches a server log. */
export const inviteLink = (token: string) =>
  `${location.origin}${import.meta.env.BASE_URL}#invite=${token}`;

/** The invite token in this page's address, if it was opened from an invite link. */
export function inviteInUrl(): string | undefined {
  const m = /(?:^#|&)invite=([0-9a-f]{32})(?:&|$)/.exec(location.hash);
  return m?.[1];
}

export function redeemMessage(r: RedeemResult, name: string): string {
  switch (r) {
    case 'friends':
      return `You and ${name} are friends now.`;
    case 'already_friends':
      return `You and ${name} are already friends.`;
    case 'own':
      return "That's your own invite link. Share it with a friend.";
    case 'expired':
      return 'This invite link has expired or was cancelled. Ask for a new one.';
    case 'too_many_friends':
      return 'One of you already has 100 friends, the most there can be.';
    case 'no_username':
      return 'Pick your own username first.';
  }
}

// ---------- activity and cheers (005_activity.sql) ----------

export type FeedItem = {
  owner: string;
  id: string;
  data: PublicActivity;
  updatedAt: string;
};

/** Replace this account's published activity with `items` (by id): upsert them, remove the rest. */
export async function publishActivity(
  c: SupabaseClient,
  userId: string,
  items: { id: string; data: PublicActivity }[],
): Promise<void> {
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100).map((x) => ({ owner: userId, id: x.id, data: x.data }));
    const { error } = await c.from('activity').upsert(chunk, { onConflict: 'owner,id' });
    if (error) throw fail('publish activity', error.message);
  }
  const { data, error } = await c.from('activity').select('id').eq('owner', userId);
  if (error) throw fail('activity', error.message);
  const keep = new Set(items.map((x) => x.id));
  const gone = (data as { id: string }[]).map((r) => r.id).filter((id) => !keep.has(id));
  for (let i = 0; i < gone.length; i += 100) {
    const { error: e } = await c
      .from('activity')
      .delete()
      .eq('owner', userId)
      .in('id', gone.slice(i, i + 100));
    if (e) throw fail('remove activity', e.message);
  }
}

/** Friends' recent activity, newest first, checked with the contract. */
export async function fetchFeed(c: SupabaseClient, friendIds: string[]): Promise<FeedItem[]> {
  if (friendIds.length === 0) return [];
  const { data, error } = await c
    .from('activity')
    .select('owner, id, data, updated_at')
    .in('owner', friendIds)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw fail('activity', error.message);
  const out: FeedItem[] = [];
  for (const r of data as { owner: string; id: string; data: unknown; updated_at: string }[]) {
    const checked = PublicActivity.safeParse(r.data);
    if (checked.success)
      out.push({ owner: r.owner, id: r.id, data: checked.data, updatedAt: r.updated_at });
  }
  return out.sort(
    (a, b) =>
      (b.data.date > a.data.date ? 1 : b.data.date < a.data.date ? -1 : 0) ||
      (b.updatedAt > a.updatedAt ? 1 : -1),
  );
}

export type Cheer = { owner: string; activityId: string; from: string; at: string };

/** Cheers this account gave, and cheers on its own items. */
export async function fetchCheers(c: SupabaseClient): Promise<Cheer[]> {
  const { data, error } = await c
    .from('cheers')
    .select('owner, activity_id, from_user, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw fail('cheers', error.message);
  return (
    data as { owner: string; activity_id: string; from_user: string; created_at: string }[]
  ).map((r) => ({
    owner: r.owner,
    activityId: r.activity_id,
    from: r.from_user,
    at: r.created_at,
  }));
}

export async function cheer(
  c: SupabaseClient,
  me: string,
  owner: string,
  activityId: string,
  on: boolean,
): Promise<void> {
  const { error } = on
    ? await c
        .from('cheers')
        .upsert(
          { owner, activity_id: activityId, from_user: me },
          { onConflict: 'owner,activity_id,from_user', ignoreDuplicates: true },
        )
    : await c
        .from('cheers')
        .delete()
        .eq('owner', owner)
        .eq('activity_id', activityId)
        .eq('from_user', me);
  if (error) throw fail('cheer', error.message);
}

// ---------- shared quests (006_challenges.sql) ----------

export type Challenge = {
  id: string;
  from: string;
  to: string;
  goal: ChallengeGoal;
  target: number;
  starts: string;
  ends: string;
  status: 'pending' | 'accepted' | 'declined';
  /** each side's published progress, by user id */
  progress: Record<string, number>;
};

type ChallengeRow = {
  id: string;
  from_user: string;
  to_user: string;
  goal: string;
  target: number;
  starts: string;
  ends: string;
  status: Challenge['status'];
};

const isGoal = (g: string): g is ChallengeGoal =>
  (CHALLENGE_GOALS as readonly string[]).includes(g);

/** Shared quests that are open, running, or ended in the last week. */
export async function fetchChallenges(c: SupabaseClient, since: string): Promise<Challenge[]> {
  const { data, error } = await c
    .from('challenges')
    .select('id, from_user, to_user, goal, target, starts, ends, status')
    .gte('ends', since)
    .neq('status', 'declined')
    .order('starts', { ascending: false });
  if (error) throw fail('shared quests', error.message);
  const rows = (data as ChallengeRow[]).filter((r) => isGoal(r.goal));
  if (rows.length === 0) return [];
  const p = await c
    .from('challenge_progress')
    .select('challenge_id, user_id, value')
    .in(
      'challenge_id',
      rows.map((r) => r.id),
    );
  if (p.error) throw fail('progress', p.error.message);
  const progress = new Map<string, Record<string, number>>();
  for (const r of p.data as { challenge_id: string; user_id: string; value: number }[]) {
    const m = progress.get(r.challenge_id) ?? {};
    m[r.user_id] = Number(r.value);
    progress.set(r.challenge_id, m);
  }
  return rows.map((r) => ({
    id: r.id,
    from: r.from_user,
    to: r.to_user,
    goal: r.goal as ChallengeGoal,
    target: r.target,
    starts: r.starts,
    ends: r.ends,
    status: r.status,
    progress: progress.get(r.id) ?? {},
  }));
}

export const proposeChallenge = (
  c: SupabaseClient,
  friend: string,
  goal: ChallengeGoal,
  target: number,
  starts: string,
) => call<string>(c, 'propose_challenge', { friend, goal, target, starts });

export const answerChallenge = (c: SupabaseClient, id: string, accept: boolean) =>
  call<'accepted' | 'declined' | 'not_found'>(c, 'answer_challenge', { challenge: id, accept });

export const cancelChallenge = (c: SupabaseClient, id: string) =>
  call<'cancelled' | 'not_found'>(c, 'cancel_challenge', { challenge: id });

export const quitChallenge = (c: SupabaseClient, id: string) =>
  call<'ended' | 'not_found'>(c, 'quit_challenge', { challenge: id });

/** Publish this account's own progress on running shared quests. */
export async function publishProgress(
  c: SupabaseClient,
  userId: string,
  rows: { challengeId: string; value: number }[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await c.from('challenge_progress').upsert(
    rows.map((r) => ({ challenge_id: r.challengeId, user_id: userId, value: r.value })),
    { onConflict: 'challenge_id,user_id' },
  );
  if (error) throw fail('progress', error.message);
}
