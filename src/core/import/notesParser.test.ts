import { describe, expect, it } from 'vitest';
import { Workout as WorkoutSchema } from '../../contract.ts';
import { parseDate, parseLine, parseNotes } from './notesParser.ts';

const today = '2026-10-26';

const SAMPLE = `Mon 20 Oct
Chest & back
Bench press 80x8, 80x8, 85x6
Incline DB press 3x10 @ 30kg
Pull ups 3x8
Barbell row 70kg 4x8
felt good today

21/10
Arms
Curls 30 x 10 x 3
Tricep pushdown: 25kg 12, 12, 10
Lateral raises 3 sets of 15 at 10

2026-10-22 legs
Squat 100x5x5
Leg press 200lb 3x12
Run 5k 27:30
Calves ??? 4 sets maybe`;

const sets = (n: number, set: object) => Array.from({ length: n }, () => set);

describe('parseNotes', () => {
  const result = parseNotes(SAMPLE, today);

  it('turns each dated block into a valid workout', () => {
    for (const w of result.workouts) expect(WorkoutSchema.parse(w)).toEqual(w);
    expect(result.workouts.map((w) => [w.id, w.date, w.kind, w.title])).toEqual([
      ['import-2026-10-20-1', '2026-10-20', 'strength', 'Chest & back'],
      ['import-2026-10-21-1', '2026-10-21', 'strength', 'Arms'],
      ['import-2026-10-22-1', '2026-10-22', 'strength', 'legs'],
      ['import-2026-10-22-2', '2026-10-22', 'run', undefined],
    ]);
    for (const w of result.workouts) {
      expect(w.source).toBe('import');
      expect(w.loggedAt).toBe(`${w.date}T12:00:00+00:00`);
    }
  });

  it('reads every lift format in the sample', () => {
    const [chest, arms, legs] = result.workouts;
    expect(chest!.exercises).toEqual([
      {
        name: 'Bench press',
        sets: [
          { weightKg: 80, reps: 8 },
          { weightKg: 80, reps: 8 },
          { weightKg: 85, reps: 6 },
        ],
      },
      { name: 'Incline DB press', sets: sets(3, { weightKg: 30, reps: 10 }) },
      { name: 'Pull ups', sets: sets(3, { reps: 8 }) },
      { name: 'Barbell row', sets: sets(4, { weightKg: 70, reps: 8 }) },
    ]);
    expect(arms!.exercises).toEqual([
      { name: 'Curls', sets: sets(3, { weightKg: 30, reps: 10 }) },
      {
        name: 'Tricep pushdown',
        sets: [
          { weightKg: 25, reps: 12 },
          { weightKg: 25, reps: 12 },
          { weightKg: 25, reps: 10 },
        ],
      },
      { name: 'Lateral raises', sets: sets(3, { weightKg: 10, reps: 15 }) },
    ]);
    expect(legs!.exercises).toEqual([
      { name: 'Squat', sets: sets(5, { weightKg: 100, reps: 5 }) },
      { name: 'Leg press', sets: sets(3, { weightKg: 90.7, reps: 12 }) },
    ]);
  });

  it('puts runs in their own workout', () => {
    expect(result.workouts[3]!.exercises).toEqual([
      { name: 'Run', sets: [{ distanceM: 5000, durationS: 1650 }] },
    ]);
  });

  it('keeps lines without numbers as the workout note', () => {
    expect(result.workouts[0]!.note).toBe('felt good today');
    expect(result.workouts[1]!.note).toBeUndefined();
  });

  it('reports lines with numbers it could not read, with their line number', () => {
    expect(result.unparsed).toEqual([{ line: 19, text: 'Calves ??? 4 sets maybe' }]);
  });

  it('reports exercise lines that come before any date', () => {
    const r = parseNotes('Bench 80x8\n\n2026-10-20\nSquat 100x5', today);
    expect(r.unparsed).toEqual([{ line: 1, text: 'Bench 80x8' }]);
    expect(r.workouts).toHaveLength(1);
  });

  it('handles Windows line endings and blank input', () => {
    expect(parseNotes('2026-10-20\r\nSquat 100x5\r\n', today).workouts[0]!.exercises[0]!.name).toBe(
      'Squat',
    );
    expect(parseNotes('', today)).toEqual({ workouts: [], unparsed: [] });
  });

  it('a date with no exercises makes no workout', () => {
    expect(parseNotes('2026-10-20\nrest day', today).workouts).toEqual([]);
  });
});

describe('parseDate', () => {
  it.each([
    ['2026-10-22', '2026-10-22'],
    ['Mon 20 Oct', '2026-10-20'],
    ['20 October', '2026-10-20'],
    ['Oct 20', '2026-10-20'],
    ['October 20, 2025', '2025-10-20'],
    ['21/10', '2026-10-21'],
    ['21/10/2026', '2026-10-21'],
    ['21.10.26', '2026-10-21'],
    ['10/21', '2026-10-21'], // the second number cannot be a month, so it's month/day
    ['5/10', '2026-10-05'], // ambiguous: day first
    ['15 Dec', '2025-12-15'], // no year: the latest such date not after today
  ])('%s -> %s', (text, date) => {
    expect(parseDate(text, today)?.date).toBe(date);
  });

  it('returns the rest of the line as the title', () => {
    expect(parseDate('2026-10-22 legs', today)).toEqual({ date: '2026-10-22', rest: 'legs' });
    expect(parseDate('Mon 20 Oct - push day', today)).toEqual({
      date: '2026-10-20',
      rest: 'push day',
    });
  });

  it('is undefined for lines that do not start with a date', () => {
    expect(parseDate('Bench 80x8', today)).toBeUndefined();
    expect(parseDate('3x10 @ 30kg', today)).toBeUndefined();
    expect(parseDate('31/02', today)).toBeUndefined();
  });
});

describe('parseLine', () => {
  it.each([
    ['Bench 100kg x 5', [{ weightKg: 100, reps: 5 }]],
    ['Bench 100 x 5', [{ weightKg: 100, reps: 5 }]], // first number > 10: weight x reps
    ['Dips 3x12', sets(3, { reps: 12 })], // first number <= 10 and no weight: sets x reps
    ['Squat 3 x 5 @ 102.5', sets(3, { weightKg: 102.5, reps: 5 })],
    ['Squat 3x5 at 102,5kg', sets(3, { weightKg: 102.5, reps: 5 })],
    [
      'OHP 45kg 5,5,4',
      [
        { weightKg: 45, reps: 5 },
        { weightKg: 45, reps: 5 },
        { weightKg: 45, reps: 4 },
      ],
    ],
    ['Curl 25lbs 3x10', sets(3, { weightKg: 11.3, reps: 10 })],
    ['Deadlift - 140x3', [{ weightKg: 140, reps: 3 }]],
  ])('%s', (text, expected) => {
    const r = parseLine(text);
    expect(r?.kind).toBe('lift');
    expect(r?.kind === 'lift' && r.sets).toEqual(expected);
  });

  it('keeps the exercise name as written, minus trailing punctuation', () => {
    expect(parseLine('Deadlift - 140x3')).toMatchObject({ kind: 'lift', name: 'Deadlift' });
    expect(parseLine('Tricep pushdown: 25kg 12, 10')).toMatchObject({ name: 'Tricep pushdown' });
  });

  it.each([
    ['Run 5k 27:30', 5000, 1650],
    ['Ran 5 km in 27:30', 5000, 1650],
    ['Run 3.2 miles 30 min', 5150, 1800],
    ['jog 800m 4:10', 800, 250],
    ['Run 10k 1:02:30', 10000, 3750],
  ])('%s', (text, distanceM, durationS) => {
    expect(parseLine(text)).toEqual({ kind: 'run', distanceM, durationS });
  });

  it('a run may have no time', () => {
    expect(parseLine('Run 5k')).toEqual({ kind: 'run', distanceM: 5000 });
  });

  it('is undefined for lines it cannot read', () => {
    expect(parseLine('Calves ??? 4 sets maybe')).toBeUndefined();
    expect(parseLine('felt good')).toBeUndefined();
    expect(parseLine('80x8')).toBeUndefined(); // no exercise name
  });
});

describe("the owner's own notes", () => {
  // pasted from the owner's phone, unchanged
  const OWNER = `chest and back day
3x8 flat barbell bench press 185 pounds 
3x until failure pullups
3x8 incline dumbbell press 60 pounds
3x8 cable rows 165 pounds`;

  it('reads notes without a date as one workout on the chosen day', () => {
    const r = parseNotes(OWNER, today, '2026-10-25');
    expect(r.unparsed).toEqual([]);
    expect(r.workouts).toHaveLength(1);
    const w = r.workouts[0]!;
    expect(WorkoutSchema.parse(w)).toEqual(w);
    expect(w).toMatchObject({ date: '2026-10-25', title: 'chest and back day', kind: 'strength' });
    expect(w.exercises).toEqual([
      { name: 'flat barbell bench press', sets: sets(3, { reps: 8, weightKg: 83.9 }) },
      { name: 'pullups', sets: sets(3, { toFailure: true }) },
      { name: 'incline dumbbell press', sets: sets(3, { reps: 8, weightKg: 27.2 }) },
      { name: 'cable rows', sets: sets(3, { reps: 8, weightKg: 74.8 }) },
    ]);
  });

  it('without a chosen day, undated lines are reported', () => {
    expect(parseNotes(OWNER, today).unparsed.map((u) => u.line)).toEqual([2, 3, 4, 5]);
  });

  it('reads sets-first lines with or without a weight', () => {
    expect(parseLine('3x10 push ups')).toEqual({
      kind: 'lift',
      name: 'push ups',
      sets: sets(3, { reps: 10 }),
    });
    expect(parseLine('4x6 squat 225 lbs')).toEqual({
      kind: 'lift',
      name: 'squat',
      sets: sets(4, { reps: 6, weightKg: 102.1 }),
    });
    expect(parseLine('pullups 3x until failure')).toEqual({
      kind: 'lift',
      name: 'pullups',
      sets: sets(3, { toFailure: true }),
    });
  });
});
