import { useState } from 'react';
import type { SetEntry, Workout } from '../contract.ts';
import { addDays } from '../core/dates.ts';
import { isoDay } from '../core/program/generate.ts';
import { ARNOLD, type SplitDay } from '../core/split.ts';
import { Sheet } from './Sheet.tsx';
import { dayTitle } from './format.ts';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type Props = {
  workouts: Workout[];
  today: string;
  day: SplitDay;
  /** the day the split suggests; picking another one is remembered until a workout is logged */
  suggested: string;
  template: { name: string; sets: SetEntry[] }[];
  /** the effort to aim for */
  aim: string;
  /** exercise names for a split day, for the picker */
  exercisesFor: (dayId: string) => string[];
  onPick: (dayId: string) => void;
  onStart: () => void;
};

/** Next up on the Arnold split: this week's training days, the next day, and a way to pick another. */
export function SplitCard({
  workouts,
  today,
  day,
  suggested,
  template,
  aim,
  exercisesFor,
  onPick,
  onStart,
}: Props) {
  const [picking, setPicking] = useState(false);
  const monday = addDays(today, 1 - isoDay(today));
  const trained = new Set(
    workouts.filter((w) => w.kind === 'strength' || w.kind === 'other').map((w) => w.date),
  );

  return (
    <section className="panel next-up" aria-labelledby="next-title">
      <p className="muted next-label">Next up · Arnold split</p>
      <ol className="week-strip" aria-label="This week">
        {WEEKDAYS.map((label, i) => {
          const date = addDays(monday, i);
          const state = trained.has(date) ? 'done' : 'rest';
          return (
            <li
              key={date}
              className={`week-day ${state}${date === today ? ' today' : ''}`}
              aria-label={`${dayTitle(date, today)}: ${state === 'done' ? 'trained' : 'no workout'}`}
            >
              {label}
            </li>
          );
        })}
      </ol>
      <h2 id="next-title">{day.title}</h2>
      <p className="muted next-list">
        {template.map((e) => e.name).join(' · ')}
        {template.length > 0 && ` · aim for ${aim}`}
      </p>
      <div className="next-actions">
        <button type="button" className="btn btn-primary" onClick={onStart}>
          Start {day.title.toLowerCase()}
        </button>
        <button type="button" className="btn" onClick={() => setPicking(true)}>
          Change
        </button>
      </div>
      {picking && (
        <Sheet title="Pick today's workout" onClose={() => setPicking(false)}>
          <ul className="split-days">
            {ARNOLD.map((d) => (
              <li key={d.id} className={`split-day${d.id === day.id ? ' current' : ''}`}>
                <div className="week-row-text">
                  <b>
                    {d.title}
                    {d.id === suggested ? ' (next in the split)' : ''}
                  </b>
                  <span className="muted">
                    {exercisesFor(d.id).join(' · ') || 'Exercises come from your history'}
                  </span>
                </div>
                {d.id === day.id ? (
                  <span className="week-state planned">Picked</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      onPick(d.id);
                      setPicking(false);
                    }}
                  >
                    Do it today
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </section>
  );
}
