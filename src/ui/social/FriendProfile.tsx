import { useState } from 'react';
import type { PublicProfile } from '../../contract.ts';
import { TIERS } from '../../core/ranks.ts';
import { TITLES } from '../../core/social/titles.ts';
import type { Contact } from '../../sync/social.ts';
import { load, type Units } from '../format.ts';
import { HeroAvatar } from '../HeroAvatar.tsx';
import { Sheet } from '../Sheet.tsx';
import { ProposeChallenge } from './Challenges.tsx';

/** A profile's top half: hero, name, title, bio and the numbers. Used for friends and for your own preview. */
export function ProfileCard({
  name,
  profile,
  units,
}: {
  name: string;
  profile: PublicProfile;
  units: Units;
}) {
  return (
    <div className="profile-card">
      <HeroAvatar hero={profile.hero} look={profile.heroLook} size={96} />
      <div className="profile-who">
        <h3>{name}</h3>
        {profile.title && <p className="profile-title">{TITLES[profile.title].name}</p>}
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      </div>
      <dl className="profile-stats">
        <div>
          <dt>Level</dt>
          <dd>{profile.level}</dd>
        </div>
        <div>
          <dt>This week</dt>
          <dd>{profile.weekXp} XP</dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd>
            {profile.streakDays} {profile.streakDays === 1 ? 'day' : 'days'}
          </dd>
        </div>
        <div>
          <dt>Workouts</dt>
          <dd>{profile.workouts}</dd>
        </div>
        <div>
          <dt>Quests</dt>
          <dd>{profile.questsDone}</dd>
        </div>
        {profile.overall && (
          <div>
            <dt>Lift rank</dt>
            <dd>{TIERS[profile.overall.tierIndex]}</dd>
          </div>
        )}
      </dl>
      {profile.showcaseTitles.length > 0 && (
        <ul className="chip-row profile-badges" aria-label="Showcase titles">
          {profile.showcaseTitles.map((t) => (
            <li key={t} className="chip" title={TITLES[t].how}>
              {TITLES[t].name}
            </li>
          ))}
        </ul>
      )}
      {profile.lifts.length > 0 && (
        <ul className="profile-lifts" aria-label="Best lifts">
          {profile.lifts.map((l) => (
            <li key={l.exerciseId}>
              <span>{l.name}</span>
              <span className="muted">
                {load(l.best.weightKg, units)} × {l.best.reps}
              </span>
              <span className="profile-tier">{TIERS[l.tierIndex]}</span>
            </li>
          ))}
        </ul>
      )}
      {profile.program && <p className="muted">Program: {profile.program}</p>}
    </div>
  );
}

type Props = {
  contact: Contact;
  units: Units;
  today: string;
  onClose: () => void;
  onRemove: () => Promise<void>;
  onBlock: () => Promise<void>;
};

/** A friend's profile, with Remove and Block. */
export function FriendProfile({ contact, units, today, onClose, onRemove, onBlock }: Props) {
  const [confirm, setConfirm] = useState<'remove' | 'block' | undefined>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | undefined>();
  const name = contact.username ?? 'Friend';

  async function act(what: 'remove' | 'block') {
    setBusy(true);
    await (what === 'remove' ? onRemove() : onBlock());
    setBusy(false);
    onClose();
  }

  return (
    <Sheet title={name} onClose={onClose}>
      {contact.profile ? (
        <ProfileCard name={name} profile={contact.profile} units={units} />
      ) : (
        <p className="muted">
          {name} hasn't shared a profile yet. It appears after their next sync.
        </p>
      )}
      {sent ? (
        <p className="muted" role="status">
          {sent}
        </p>
      ) : (
        <ProposeChallenge friend={contact.id} name={name} today={today} onDone={setSent} />
      )}
      <div className="friend-actions">
        {confirm ? (
          <div className="restore-confirm" role="group" aria-label="Confirm">
            <p>
              {confirm === 'remove'
                ? `Remove ${name} from your friends? You stop seeing each other's profiles.`
                : `Block ${name}? You stop being friends, and they can't send you requests. They aren't told.`}
            </p>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => void act(confirm)}
            >
              {confirm === 'remove' ? 'Remove friend' : 'Block'}
            </button>
            <button type="button" className="link-btn" onClick={() => setConfirm(undefined)}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button type="button" className="link-btn" onClick={() => setConfirm('remove')}>
              Remove friend
            </button>
            <button type="button" className="link-btn" onClick={() => setConfirm('block')}>
              Block
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
