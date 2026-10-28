import { useState, type FormEvent } from 'react';
import {
  BIO_MAX,
  SHOWCASE_MAX,
  TITLE_IDS,
  type Profile,
  type PublicProfile,
  type SocialSettings,
  type TitleId,
} from '../../contract.ts';
import { TITLES } from '../../core/social/titles.ts';
import { saveProfile } from '../../db/db.ts';
import { useDb } from '../dbContext.ts';
import { nowStamp } from '../format.ts';
import { HeroAvatar } from '../HeroAvatar.tsx';
import { Sheet } from '../Sheet.tsx';

type Props = {
  profile: Profile;
  me: PublicProfile | undefined;
  /** exercises with a rank, best first: what the showcase can show */
  liftChoices: { id: string; name: string }[];
  onClose: () => void;
};

/** Edit what friends see: bio, title, showcase and what is shared. Saved on this phone and synced. */
export function ProfileEditor({ profile, me, liftChoices, onClose }: Props) {
  const db = useDb();
  const social = profile.social ?? {};
  const unlocked = new Set<TitleId>(me?.titles ?? ['novice']);
  const [bio, setBio] = useState(social.bio ?? '');
  const [title, setTitle] = useState<TitleId | undefined>(
    social.title && unlocked.has(social.title) ? social.title : undefined,
  );
  const [badges, setBadges] = useState<TitleId[]>(
    (social.showcaseTitles ?? []).filter((t) => unlocked.has(t)),
  );
  const [lifts, setLifts] = useState<string[]>(social.showcaseLifts ?? []);
  const [shareActivity, setShareActivity] = useState(social.shareActivity ?? true);
  const [shareLifts, setShareLifts] = useState(social.shareLifts ?? true);
  const [busy, setBusy] = useState(false);

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item)
      ? list.filter((x) => x !== item)
      : list.length < SHOWCASE_MAX
        ? [...list, item]
        : list;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const next: SocialSettings = {
      bio: bio.trim().slice(0, BIO_MAX),
      ...(title ? { title } : {}),
      showcaseTitles: badges,
      showcaseLifts: lifts,
      shareActivity,
      shareLifts,
    };
    await saveProfile(db, { ...profile, social: next, updatedAt: nowStamp() });
    setBusy(false);
    onClose();
  }

  const locked = TITLE_IDS.filter((t) => !unlocked.has(t));

  return (
    <Sheet title="Edit profile" onClose={onClose}>
      <form className="form profile-editor" onSubmit={(e) => void submit(e)}>
        <div className="profile-editor-hero">
          <HeroAvatar hero={profile.hero} look={profile.heroLook} size={72} />
          <p className="muted">Your hero is your picture. Change how it looks on the Quests tab.</p>
        </div>

        <label className="field">
          <span>Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={BIO_MAX}
            rows={3}
            placeholder="A line about you, like what you're training for"
          />
          <small className="muted">
            {bio.length} / {BIO_MAX}
          </small>
        </label>

        <fieldset className="chip-fieldset">
          <legend>Title under your name</legend>
          <div className="chip-row">
            <label className="chip-choice">
              <input
                type="radio"
                name="title"
                checked={!title}
                onChange={() => setTitle(undefined)}
              />
              <span>None</span>
            </label>
            {TITLE_IDS.filter((t) => unlocked.has(t)).map((t) => (
              <label key={t} className="chip-choice">
                <input
                  type="radio"
                  name="title"
                  checked={title === t}
                  onChange={() => setTitle(t)}
                />
                <span>{TITLES[t].name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="chip-fieldset">
          <legend>Showcase titles (up to {SHOWCASE_MAX})</legend>
          <div className="chip-row">
            {TITLE_IDS.filter((t) => unlocked.has(t)).map((t) => (
              <label key={t} className="chip-choice">
                <input
                  type="checkbox"
                  checked={badges.includes(t)}
                  disabled={!badges.includes(t) && badges.length >= SHOWCASE_MAX}
                  onChange={() => setBadges((b) => toggle(b, t))}
                />
                <span>{TITLES[t].name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {liftChoices.length > 0 && (
          <fieldset className="chip-fieldset">
            <legend>Showcase lifts (up to {SHOWCASE_MAX}; none picked shows your best)</legend>
            <div className="chip-row">
              {liftChoices.map((l) => (
                <label key={l.id} className="chip-choice">
                  <input
                    type="checkbox"
                    checked={lifts.includes(l.id)}
                    disabled={!lifts.includes(l.id) && lifts.length >= SHOWCASE_MAX}
                    onChange={() => setLifts((x) => toggle(x, l.id))}
                  />
                  <span>{l.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="chip-fieldset">
          <legend>What friends see</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={shareActivity}
              onChange={(e) => setShareActivity(e.target.checked)}
            />
            <span>My workouts, runs and finished quests, in their feed</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={shareLifts}
              onChange={(e) => setShareLifts(e.target.checked)}
            />
            <span>My lift ranks and PRs</span>
          </label>
          <p className="muted">
            Always shared with friends: your username, hero, bio, title, level, XP, streak, and how
            many workouts and quests you've done. Never shared: your weight, food and calories.
          </p>
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Save profile
          </button>
        </div>

        {locked.length > 0 && (
          <details className="locked-titles">
            <summary>Titles still to unlock ({locked.length})</summary>
            <ul>
              {locked.map((t) => (
                <li key={t}>
                  <b>{TITLES[t].name}</b> <span className="muted">{TITLES[t].how}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </form>
    </Sheet>
  );
}
