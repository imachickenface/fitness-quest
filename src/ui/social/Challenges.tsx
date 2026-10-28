import { useCallback, useEffect, useState } from 'react';
import {
  CHALLENGE_GOALS,
  CHALLENGE_TARGETS,
  challengeProgress,
  challengeTitle,
  challengeValue,
  type ChallengeGoal,
} from '../../core/social/challenge.ts';
import type { Records } from '../../core/records.ts';
import { addDays } from '../../core/dates.ts';
import {
  answerChallenge,
  cancelChallenge,
  fetchChallenges,
  proposeChallenge,
  quitChallenge,
  type Challenge,
  type Contact,
} from '../../sync/social.ts';
import { getClient } from '../../sync/supabase.ts';
import { dayTitle } from '../format.ts';

const GOAL_NAMES: Record<ChallengeGoal, string> = {
  workouts: 'Workouts',
  run_km: 'Run distance',
  active_days: 'Active days',
};

type Props = { me: string; friends: Contact[]; records: Records; today: string };

/** Shared quests with friends: proposals to answer, quests running, and how the last ones went. */
export function Challenges({ me, friends, records, today }: Props) {
  const [list, setList] = useState<Challenge[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const nameOf = new Map(friends.map((f) => [f.id, f.username ?? 'Friend']));

  const load = useCallback(async () => {
    try {
      setList(await fetchChallenges(await getClient(), addDays(today, -7)));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [today]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (fn: (c: Awaited<ReturnType<typeof getClient>>) => Promise<unknown>) => {
    await fn(await getClient());
    await load();
  };

  if (!list || list.length === 0) return error ? <p className="form-error">{error}</p> : null;

  return (
    <section className="quest-section" aria-label="Shared quests">
      <h2>Shared quests</h2>
      <ul className="quest-list">
        {list.map((ch) => {
          const other = ch.from === me ? ch.to : ch.from;
          const name = nameOf.get(other) ?? 'A friend';
          const title = challengeTitle(ch.goal, ch.target);
          const mine = Math.max(
            challengeValue(ch.goal, records, ch.starts, ch.ends, today),
            ch.progress[me] ?? 0,
          );
          const theirs = ch.progress[other] ?? 0;
          const over = ch.ends < today;
          return (
            <li key={ch.id} className="quest shared-quest" aria-label={`${title} with ${name}`}>
              <span className="quest-title">
                {title} <span className="muted">with {name}</span>
              </span>
              {ch.status === 'pending' && ch.to === me && (
                <span className="shared-actions">
                  <span className="muted">
                    {name} asked you, for 7 days from {dayTitle(ch.starts, today)}.
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void act((c) => answerChallenge(c, ch.id, true))}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => void act((c) => answerChallenge(c, ch.id, false))}
                  >
                    Decline
                  </button>
                </span>
              )}
              {ch.status === 'pending' && ch.from === me && (
                <span className="shared-actions">
                  <span className="muted">Waiting for {name} to accept.</span>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => void act((c) => cancelChallenge(c, ch.id))}
                  >
                    Take back
                  </button>
                </span>
              )}
              {ch.status === 'accepted' && (
                <>
                  <Bar label="You" value={mine} goal={ch.goal} target={ch.target} />
                  <Bar label={name} value={theirs} goal={ch.goal} target={ch.target} />
                  <span className="shared-actions">
                    <span className="muted">
                      {over
                        ? result(mine >= ch.target, theirs >= ch.target, name)
                        : `Ends ${dayTitle(ch.ends, today)}.`}
                    </span>
                    {!over && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => void act((c) => quitChallenge(c, ch.id))}
                      >
                        Give up
                      </button>
                    )}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function result(mine: boolean, theirs: boolean, name: string): string {
  if (mine && theirs) return 'You both made it!';
  if (mine) return `You made it. ${name} didn't this time.`;
  if (theirs) return `${name} made it. Next time it's yours.`;
  return 'Neither of you made it this time.';
}

function Bar({
  label,
  value,
  goal,
  target,
}: {
  label: string;
  value: number;
  goal: ChallengeGoal;
  target: number;
}) {
  return (
    <span className="shared-bar">
      <span className="muted">{label}</span>
      <span className="bar quest-bar" aria-hidden="true">
        <span className="bar-fill" style={{ width: `${Math.min(1, value / target) * 100}%` }} />
        <span className="quest-label">{challengeProgress(goal, value, target)}</span>
      </span>
      <span className="visually-hidden">
        {label}: {challengeProgress(goal, value, target)}
      </span>
    </span>
  );
}

/** Propose a shared quest to one friend: pick a goal and a target. */
export function ProposeChallenge({
  friend,
  name,
  today,
  onDone,
}: {
  friend: string;
  name: string;
  today: string;
  onDone: (message: string) => void;
}) {
  const [goal, setGoal] = useState<ChallengeGoal>('workouts');
  const [target, setTarget] = useState(3);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const r = await proposeChallenge(await getClient(), friend, goal, target, today);
      onDone(
        r === 'too_many'
          ? 'One of you already has 3 shared quests going. Finish or take back one first.'
          : r === 'not_friends'
            ? `You and ${name} aren't friends any more.`
            : r === 'bad_start'
              ? "Your phone's date looks wrong. Check it and try again."
              : `Sent to ${name}. It starts when they accept.`,
      );
    } catch {
      onDone(
        navigator.onLine ? "Couldn't send it. Try again." : "You're offline. Try again later.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form propose">
      <fieldset className="chip-fieldset">
        <legend>Shared quest for the next 7 days</legend>
        <div className="chip-row">
          {CHALLENGE_GOALS.map((g) => (
            <label key={g} className="chip-choice">
              <input
                type="radio"
                name="goal"
                checked={goal === g}
                onChange={() => {
                  setGoal(g);
                  setTarget(CHALLENGE_TARGETS[g][1] ?? CHALLENGE_TARGETS[g][0]!);
                }}
              />
              <span>{GOAL_NAMES[g]}</span>
            </label>
          ))}
        </div>
        <div className="chip-row">
          {CHALLENGE_TARGETS[goal].map((t) => (
            <label key={t} className="chip-choice">
              <input
                type="radio"
                name="target"
                checked={target === t}
                onChange={() => setTarget(t)}
              />
              <span>{goal === 'run_km' ? `${t} km` : t}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send()}>
        Challenge {name}: {challengeTitle(goal, target)}
      </button>
    </div>
  );
}
