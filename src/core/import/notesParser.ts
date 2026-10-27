/**
 * Workout notes as people type them on a phone -> workouts. A block starts with a date line; each following line
 * is an exercise ("Bench 80x8, 85x6"), a run ("Run 5k 27:30"), a title or a note. Lines with numbers that can't
 * be read are reported, never guessed. Pure: `today` decides the year of dates written without one.
 */
import type { SetEntry, Workout } from '../../contract.ts';

export type ParsedLine =
  | { kind: 'lift'; name: string; sets: SetEntry[] }
  | { kind: 'run'; distanceM: number; durationS?: number };

const LB = 0.45359237;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAY = '(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\\.?,?\\s+';
const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';

const round1 = (x: number) => Math.round(x * 10) / 10;
const num = (s: string) => Number(s.replace(',', '.'));
const pad = (n: number) => String(n).padStart(2, '0');

function realDate(y: number, m: number, d: number): string | undefined {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d)
    return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Month and day without a year: the latest such date not after today. */
function latest(m: number, d: number, today: string): string | undefined {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year - 1, year - 2]) {
    const date = realDate(y, m, d);
    if (date && date <= today) return date;
  }
  return undefined;
}

function cleanRest(rest: string): string {
  return rest.replace(/^[\s\-–:,]+/, '').trim();
}

export function parseDate(text: string, today: string): { date: string; rest: string } | undefined {
  const t = text.trim();
  const lower = t.toLowerCase();
  const done = (date: string | undefined, length: number) =>
    date ? { date, rest: cleanRest(t.slice(length)) } : undefined;

  let m = /^(\d{4})-(\d{2})-(\d{2})(?![\d])/.exec(lower);
  if (m) return done(realDate(Number(m[1]), Number(m[2]), Number(m[3])), m[0].length);

  const wd = new RegExp(`^(?:${WEEKDAY})?`).exec(lower);
  const skip = wd ? wd[0].length : 0;
  const body = lower.slice(skip);

  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?(?![\d/.x×])/.exec(body);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    if (b > 12 && a <= 12) [a, b] = [b, a]; // month/day
    const y =
      m[3] === undefined ? undefined : m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const date = y === undefined ? latest(b, a, today) : realDate(y, b, a);
    return done(date, skip + m[0].length);
  }

  m = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}(?:,?\\s+(\\d{4}))?(?![a-z])`).exec(body);
  if (m) {
    const month = MONTHS.indexOf(m[2]!.slice(0, 3)) + 1;
    const date = m[3]
      ? realDate(Number(m[3]), month, Number(m[1]))
      : latest(month, Number(m[1]), today);
    return done(date, skip + m[0].length);
  }

  m = new RegExp(`^${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?![\\d])`).exec(body);
  if (m) {
    const month = MONTHS.indexOf(m[1]!.slice(0, 3)) + 1;
    const date = m[3]
      ? realDate(Number(m[3]), month, Number(m[2]))
      : latest(month, Number(m[2]), today);
    return done(date, skip + m[0].length);
  }
  return undefined;
}

const N = '(\\d+(?:[.,]\\d+)?)';
const X = '\\s*[x×]\\s*';
const UNIT = '\\s*(kgs?|lbs?)?';

function kg(value: string, unit: string | undefined): number {
  const n = num(value);
  return unit && unit.startsWith('lb') ? round1(n * LB) : n;
}

function repeat(sets: number, set: SetEntry): SetEntry[] | undefined {
  if (!Number.isInteger(sets) || sets < 1 || sets > 50) return undefined;
  return Array.from({ length: sets }, () => ({ ...set }));
}

function liftSets(rest: string): SetEntry[] | undefined {
  const r = rest.trim().toLowerCase();
  const full = (re: string) => new RegExp(`^${re}$`).exec(r);
  let m: RegExpExecArray | null;

  // 1. W x R x S
  if ((m = full(`${N}${UNIT}${X}(\\d+)${X}(\\d+)`))) {
    return repeat(Number(m[4]), { weightKg: kg(m[1]!, m[2]), reps: Number(m[3]) });
  }
  // 2. S sets of R (at|@) W
  if ((m = full(`(\\d+)\\s*sets?\\s*of\\s*(\\d+)\\s*(?:reps?\\s*)?(?:at|@)\\s*${N}${UNIT}`))) {
    return repeat(Number(m[1]), { weightKg: kg(m[3]!, m[4]), reps: Number(m[2]) });
  }
  // 3. S x R (at|@) W
  if ((m = full(`(\\d+)${X}(\\d+)\\s*(?:at|@)\\s*${N}${UNIT}`))) {
    return repeat(Number(m[1]), { weightKg: kg(m[3]!, m[4]), reps: Number(m[2]) });
  }
  // 4. W<unit> S x R
  if ((m = full(`${N}\\s*(kgs?|lbs?)\\s+(\\d+)${X}(\\d+)`))) {
    return repeat(Number(m[3]), { weightKg: kg(m[1]!, m[2]), reps: Number(m[4]) });
  }
  // 5. W<unit> R, R, R
  if ((m = full(`${N}\\s*(kgs?|lbs?)\\s+(\\d+(?:\\s*,\\s*\\d+)*)`))) {
    const w = kg(m[1]!, m[2]);
    return m[3]!.split(',').map((reps) => ({ weightKg: w, reps: Number(reps.trim()) }));
  }
  // 6. W x R pairs, comma separated; a lone "S x R" with S <= 10 and no unit means sets x reps
  const pair = `${N}${UNIT}${X}(\\d+)`;
  if (full(`${pair}(?:\\s*,\\s*${pair})*`)) {
    const pairs = [...r.matchAll(new RegExp(pair, 'g'))];
    if (pairs.length === 1) {
      const [, w, unit, reps] = pairs[0]!;
      if (!unit && num(w!) <= 10 && Number.isInteger(num(w!))) {
        return repeat(num(w!), { reps: Number(reps) });
      }
    }
    return pairs.map(([, w, unit, reps]) => ({ weightKg: kg(w!, unit), reps: Number(reps) }));
  }
  return undefined;
}

function seconds(text: string): number | undefined {
  let m = /(\d+):(\d{2}):(\d{2})/.exec(text);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  m = /(\d+):(\d{2})/.exec(text);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /(\d+(?:[.,]\d+)?)\s*min/.exec(text);
  if (m) return Math.round(num(m[1]!) * 60);
  return undefined;
}

export function parseLine(text: string): ParsedLine | undefined {
  const t = text.trim();
  const lower = t.toLowerCase();
  if (/^(run|ran|jog|jogged)\b/.test(lower)) {
    const d = /(\d+(?:[.,]\d+)?)\s*(km|k|miles|mile|mi|m)\b/.exec(lower);
    if (!d) return undefined;
    const factor = d[2] === 'm' ? 1 : d[2]!.startsWith('k') ? 1000 : 1609.344;
    const distanceM = Math.round(num(d[1]!) * factor);
    const durationS = seconds(lower.slice(d.index + d[0].length));
    return durationS === undefined
      ? { kind: 'run', distanceM }
      : { kind: 'run', distanceM, durationS };
  }
  const first = t.search(/\d/);
  if (first <= 0) return undefined;
  const name = t
    .slice(0, first)
    .replace(/[\s\-–:]+$/, '')
    .trim();
  if (!/\p{L}/u.test(name)) return undefined;
  const sets = liftSets(t.slice(first));
  return sets && sets.length > 0 ? { kind: 'lift', name, sets } : undefined;
}

type Block = {
  date: string;
  title?: string;
  expectTitle: boolean;
  notes: string[];
  exercises: { name: string; sets: SetEntry[] }[];
  runs: SetEntry[];
};

export function parseNotes(
  text: string,
  today: string,
): { workouts: Workout[]; unparsed: { line: number; text: string }[] } {
  const blocks: Block[] = [];
  const unparsed: { line: number; text: string }[] = [];
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === '') return;
    const date = parseDate(line, today);
    if (date) {
      blocks.push({
        date: date.date,
        ...(date.rest ? { title: date.rest } : {}),
        expectTitle: !date.rest,
        notes: [],
        exercises: [],
        runs: [],
      });
      return;
    }
    const block = blocks.at(-1);
    const parsed = parseLine(line);
    const hasDigit = /\d/.test(line);
    if (!block) {
      if (parsed || hasDigit) unparsed.push({ line: i + 1, text: line });
      return;
    }
    if (parsed?.kind === 'lift') {
      block.exercises.push({ name: parsed.name, sets: parsed.sets });
    } else if (parsed?.kind === 'run') {
      block.runs.push({
        distanceM: parsed.distanceM,
        ...(parsed.durationS !== undefined ? { durationS: parsed.durationS } : {}),
      });
    } else if (hasDigit) {
      unparsed.push({ line: i + 1, text: line });
    } else if (
      block.expectTitle &&
      block.title === undefined &&
      block.exercises.length === 0 &&
      block.notes.length === 0
    ) {
      block.title = line;
    } else {
      block.notes.push(line);
    }
    block.expectTitle = false;
  });

  const workouts: Workout[] = [];
  const perDate = new Map<string, number>();
  const next = (date: string) => {
    const n = (perDate.get(date) ?? 0) + 1;
    perDate.set(date, n);
    return `import-${date}-${n}`;
  };
  for (const b of blocks) {
    const base = { date: b.date, loggedAt: `${b.date}T12:00:00+00:00`, source: 'import' as const };
    if (b.exercises.length > 0) {
      workouts.push({
        id: next(b.date),
        ...base,
        kind: 'strength',
        ...(b.title ? { title: b.title.slice(0, 100) } : {}),
        exercises: b.exercises,
        ...(b.notes.length > 0 ? { note: b.notes.join('\n').slice(0, 2000) } : {}),
      });
    }
    if (b.runs.length > 0) {
      workouts.push({
        id: next(b.date),
        ...base,
        kind: 'run',
        exercises: [{ name: 'Run', sets: b.runs }],
      });
    }
  }
  return { workouts, unparsed };
}
