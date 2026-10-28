import { useState, type FormEvent } from 'react';
import type { Profile, PublicProfile } from '../../contract.ts';
import type { Records } from '../../core/records.ts';
import { leaderboard } from '../../core/social/leaderboard.ts';
import { TITLES } from '../../core/social/titles.ts';
import { localDate } from '../../core/diary.ts';
import {
  answerRequest,
  blockUser,
  removeFriend,
  requestMessage,
  sendRequest,
  unblockUser,
  type Contact,
} from '../../sync/social.ts';
import { getClient } from '../../sync/supabase.ts';
import { USERNAME_MAX } from '../../sync/username.ts';
import { useAccount } from '../accountContext.ts';
import { HeroAvatar } from '../HeroAvatar.tsx';
import { Challenges } from './Challenges.tsx';
import { Feed } from './Feed.tsx';
import { FriendProfile, ProfileCard } from './FriendProfile.tsx';
import { Invites } from './Invites.tsx';
import { ProfileEditor } from './ProfileEditor.tsx';
import { useContacts } from './useContacts.ts';

type Props = {
  profile: Profile;
  /** your own summary as friends see it; undefined while the records load */
  me: PublicProfile | undefined;
  liftChoices: { id: string; name: string }[];
  /** this phone's records, for shared-quest progress; undefined while they load */
  records: Records | undefined;
};

/** The Friends tab: your profile, adding friends, requests and the friends list. */
export function Friends({ profile, me, liftChoices, records }: Props) {
  const account = useAccount();
  const signedIn = account.status === 'signed-in' ? account : undefined;
  const { contacts, error, refresh } = useContacts(signedIn?.userId);
  const [open, setOpen] = useState<Contact | undefined>();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  if (account.status !== 'signed-in') {
    return (
      <div className="screen">
        <header className="screen-head">
          <h1>Friends</h1>
        </header>
        <section className="panel">
          <h2>Train with friends</h2>
          <p className="muted">
            Sign in to add friends, show off your profile and see how your week compares. Friends
            see your level, workouts, quests and lift ranks, never your weight or food.
          </p>
          {account.status === 'signed-out' && (
            <button type="button" className="btn btn-primary" onClick={() => void account.signIn()}>
              Sign in with Google
            </button>
          )}
        </section>
      </div>
    );
  }

  const name = account.username ?? 'You';
  const friends = (contacts ?? [])
    .filter((c) => c.relation === 'friend')
    .sort((a, b) => (a.username ?? '').localeCompare(b.username ?? ''));
  const incoming = (contacts ?? []).filter((c) => c.relation === 'incoming');
  const outgoing = (contacts ?? []).filter((c) => c.relation === 'outgoing');
  const blocked = (contacts ?? []).filter((c) => c.relation === 'blocked');

  // every change asks the server, then reloads the list
  const act = async (fn: (c: Awaited<ReturnType<typeof getClient>>) => Promise<unknown>) => {
    setNotice(undefined);
    try {
      const r = await fn(await getClient());
      if (r === 'too_many_friends')
        setNotice('One of you already has 100 friends, the most there can be.');
    } catch {
      setNotice(
        navigator.onLine ? "That didn't work. Try again." : "You're offline. Try again later.",
      );
    }
    await refresh();
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Friends</h1>
      </header>

      <section className="panel" aria-label="Your profile">
        {me ? (
          <ProfileCard name={name} profile={me} units={profile.units} />
        ) : (
          <p className="muted">Loading your profile…</p>
        )}
        <button type="button" className="btn" onClick={() => setEditing(true)}>
          Edit profile
        </button>
      </section>

      {friends.length > 0 && (
        <section className="quest-section" aria-label="This week's leaderboard">
          <h2>This week</h2>
          <ol className="entry-list leaderboard">
            {leaderboard(
              [
                ...(me ? [{ id: account.userId, name, profile: me, me: true }] : []),
                ...friends.map((c) => ({
                  id: c.id,
                  name: c.username ?? 'Friend',
                  ...(c.profile ? { profile: c.profile } : {}),
                })),
              ],
              localDate(new Date()),
            ).map((s) => (
              <li key={s.id} className={s.me ? 'entry leader me' : 'entry leader'}>
                <span className="leader-rank">{s.rank}</span>
                <span className="entry-name">
                  <b>{s.me ? `${s.name} (you)` : s.name}</b>
                </span>
                <span className="entry-kcal">{s.weekXp} XP</span>
              </li>
            ))}
          </ol>
          <p className="fine-print">XP from Monday until now. A new week starts every Monday.</p>
        </section>
      )}

      {friends.length > 0 && records && (
        <Challenges
          me={account.userId}
          friends={friends}
          records={records}
          today={localDate(new Date())}
        />
      )}

      {friends.length > 0 && (
        <Feed me={account.userId} friends={friends} today={localDate(new Date())} />
      )}

      <AddFriend onSent={refresh} />
      <Invites />

      {notice && (
        <p className="form-error" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="status">
          {error === 'offline'
            ? "You're offline. Friends load when you're back online."
            : `Couldn't load friends: ${error}`}
        </p>
      )}

      {incoming.length > 0 && (
        <section className="quest-section" aria-label="Friend requests">
          <h2>Friend requests</h2>
          <ul className="entry-list friend-list">
            {incoming.map((c) => (
              <li key={c.id} className="entry">
                <span className="entry-name">
                  <b>{c.username}</b>
                  <span className="muted">wants to be friends</span>
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void act((cl) => answerRequest(cl, c.id, true))}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => void act((cl) => answerRequest(cl, c.id, false))}
                >
                  Decline
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="quest-section" aria-label="Your friends">
        <h2>Your friends{contacts ? ` (${friends.length})` : ''}</h2>
        {contacts === undefined && !error && <p className="muted">Loading…</p>}
        {contacts && friends.length === 0 && (
          <p className="muted">
            No friends yet. Add someone by their username above. They get a request to accept.
          </p>
        )}
        {friends.length > 0 && (
          <ul className="entry-list friend-list">
            {friends.map((c) => (
              <li key={c.id} className="entry">
                <button type="button" className="friend-row" onClick={() => setOpen(c)}>
                  <HeroAvatar hero={c.profile?.hero} look={c.profile?.heroLook} size={44} />
                  <span className="entry-name">
                    <b>{c.username}</b>
                    <span className="muted">
                      {c.profile
                        ? `Level ${c.profile.level}${c.profile.title ? ` · ${TITLES[c.profile.title].name}` : ''}`
                        : 'No profile yet'}
                    </span>
                  </span>
                  {c.profile && <span className="entry-kcal">{c.profile.weekXp} XP</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="quest-section" aria-label="Requests you sent">
          <h2>Waiting for an answer</h2>
          <ul className="entry-list friend-list">
            {outgoing.map((c) => (
              <li key={c.id} className="entry">
                <span className="entry-name">
                  <b>{c.username}</b>
                  <span className="muted">hasn't answered yet</span>
                </span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => void act((cl) => removeFriend(cl, c.id))}
                >
                  Take back
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {blocked.length > 0 && (
        <details className="danger-zone">
          <summary>Blocked ({blocked.length})</summary>
          <ul className="entry-list">
            {blocked.map((c) => (
              <li key={c.id} className="entry">
                <span className="entry-name">{c.username ?? 'Someone you blocked'}</span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => void act((cl) => unblockUser(cl, c.id))}
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {open && (
        <FriendProfile
          contact={open}
          units={profile.units}
          today={localDate(new Date())}
          onClose={() => setOpen(undefined)}
          onRemove={() => act((cl) => removeFriend(cl, open.id))}
          onBlock={() => act((cl) => blockUser(cl, open.id))}
        />
      )}
      {editing && (
        <ProfileEditor
          profile={profile}
          me={me}
          liftChoices={liftChoices}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

/** Send a request by exact username. */
function AddFriend({ onSent }: { onSent: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const wanted = name.trim();
    if (!wanted) return;
    setBusy(true);
    try {
      const r = await sendRequest(await getClient(), wanted);
      setMessage({ text: requestMessage(r, wanted), ok: r === 'sent' || r === 'accepted' });
      if (r === 'sent' || r === 'accepted') {
        setName('');
        await onSent();
      }
    } catch (err) {
      setMessage({
        text: navigator.onLine
          ? `Couldn't send: ${err instanceof Error ? err.message : String(err)}`
          : "You're offline. Try again when you're back online.",
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="panel form add-friend"
      onSubmit={(e) => void submit(e)}
      aria-label="Add a friend"
    >
      <h2>Add a friend</h2>
      <label className="field">
        <span>Their username</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          maxLength={USERNAME_MAX}
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
        Send request
      </button>
      {message && (
        <p className={message.ok ? 'muted' : 'form-error'} role="status">
          {message.text}
        </p>
      )}
    </form>
  );
}
