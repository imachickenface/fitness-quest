/**
 * The exercises the app knows: names people write, the muscle group (for the split), and the strength standard
 * used for ranks. `top` is the estimated one-rep max, as a multiple of bodyweight, that scores 1000 (Olympian)
 * for men; women's standards are `top * FEMALE_UPPER` or `* FEMALE_LOWER`. The numbers are our own, rounded
 * from widely published bodyweight-ratio standards. `perHand` lifts are logged per dumbbell; `bodyweight`
 * lifts add the lifter's weight to any weight logged.
 */
import { exerciseKey } from '../contract.ts';

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs';

export type Exercise = {
  id: string;
  name: string;
  group: MuscleGroup;
  aliases: string[];
  /** e1RM / bodyweight that scores 1000 for men; undefined = not ranked */
  top?: number;
  lower?: boolean;
  perHand?: boolean;
  bodyweight?: boolean;
};

export const FEMALE_UPPER = 0.62;
export const FEMALE_LOWER = 0.72;

export const EXERCISES: Exercise[] = [
  // chest
  {
    id: 'bench-press',
    name: 'Bench press',
    group: 'chest',
    top: 2.0,
    aliases: [
      'bench',
      'flat bench',
      'bb bench',
      'barbell bench press',
      'flat bench press',
      'flat barbell bench press',
      'flat barbell bench',
    ],
  },
  {
    id: 'incline-bench-press',
    name: 'Incline bench press',
    group: 'chest',
    top: 1.7,
    aliases: ['incline bench', 'incline press', 'incline barbell press'],
  },
  {
    id: 'dumbbell-bench-press',
    name: 'Dumbbell bench press',
    group: 'chest',
    top: 0.8,
    perHand: true,
    aliases: ['db bench', 'dumbbell press', 'db press', 'db bench press'],
  },
  {
    id: 'incline-dumbbell-press',
    name: 'Incline dumbbell press',
    group: 'chest',
    top: 0.7,
    perHand: true,
    aliases: ['incline db press', 'incline dumbbell bench'],
  },
  {
    id: 'chest-fly',
    name: 'Chest fly',
    group: 'chest',
    top: 0.45,
    perHand: true,
    aliases: ['dumbbell fly', 'db fly', 'flyes', 'flys', 'cable fly', 'pec fly'],
  },
  {
    id: 'dips',
    name: 'Dips',
    group: 'chest',
    top: 2.1,
    bodyweight: true,
    aliases: ['dip', 'chest dips', 'weighted dips'],
  },
  // back
  {
    id: 'deadlift',
    name: 'Deadlift',
    group: 'back',
    top: 3.0,
    lower: true,
    aliases: ['deads', 'conventional deadlift', 'dl'],
  },
  {
    id: 'barbell-row',
    name: 'Barbell row',
    group: 'back',
    top: 1.7,
    aliases: ['bent over row', 'bb row', 'row', 'pendlay row'],
  },
  {
    id: 'dumbbell-row',
    name: 'Dumbbell row',
    group: 'back',
    top: 0.95,
    perHand: true,
    aliases: ['db row', 'one arm row', 'single arm row'],
  },
  {
    id: 'pull-up',
    name: 'Pull-up',
    group: 'back',
    top: 1.9,
    bodyweight: true,
    aliases: ['pullup', 'pull ups', 'pullups', 'weighted pull up'],
  },
  {
    id: 'chin-up',
    name: 'Chin-up',
    group: 'back',
    top: 1.95,
    bodyweight: true,
    aliases: ['chinup', 'chin ups', 'chinups'],
  },
  {
    id: 'lat-pulldown',
    name: 'Lat pulldown',
    group: 'back',
    top: 1.5,
    aliases: ['pulldown', 'lat pull down', 'pull down'],
  },
  {
    id: 'seated-cable-row',
    name: 'Seated cable row',
    group: 'back',
    top: 1.6,
    aliases: ['cable row', 'seated row'],
  },
  // shoulders
  {
    id: 'overhead-press',
    name: 'Overhead press',
    group: 'shoulders',
    top: 1.35,
    aliases: ['ohp', 'military press', 'shoulder press', 'standing press', 'press'],
  },
  {
    id: 'dumbbell-shoulder-press',
    name: 'Dumbbell shoulder press',
    group: 'shoulders',
    top: 0.6,
    perHand: true,
    aliases: ['db shoulder press', 'seated db press', 'arnold press'],
  },
  {
    id: 'lateral-raise',
    name: 'Lateral raise',
    group: 'shoulders',
    top: 0.33,
    perHand: true,
    aliases: ['lateral raises', 'side raise', 'lat raise', 'side lateral raise'],
  },
  {
    id: 'rear-delt-fly',
    name: 'Rear delt fly',
    group: 'shoulders',
    top: 0.3,
    perHand: true,
    aliases: ['reverse fly', 'rear delt raise', 'face pull'],
  },
  // arms
  {
    id: 'barbell-curl',
    name: 'Barbell curl',
    group: 'arms',
    top: 0.95,
    aliases: ['bb curl', 'ez bar curl', 'curl', 'curls'],
  },
  {
    id: 'dumbbell-curl',
    name: 'Dumbbell curl',
    group: 'arms',
    top: 0.5,
    perHand: true,
    aliases: ['db curl', 'bicep curl', 'biceps curl'],
  },
  {
    id: 'hammer-curl',
    name: 'Hammer curl',
    group: 'arms',
    top: 0.52,
    perHand: true,
    aliases: ['hammer curls', 'db hammer curl'],
  },
  {
    id: 'tricep-pushdown',
    name: 'Tricep pushdown',
    group: 'arms',
    top: 0.9,
    aliases: ['pushdown', 'triceps pushdown', 'rope pushdown', 'cable pushdown'],
  },
  {
    id: 'skull-crusher',
    name: 'Skull crusher',
    group: 'arms',
    top: 0.8,
    aliases: ['skullcrusher', 'skull crushers', 'lying tricep extension'],
  },
  {
    id: 'overhead-tricep-extension',
    name: 'Overhead tricep extension',
    group: 'arms',
    top: 0.55,
    aliases: ['overhead extension', 'tricep extension'],
  },
  // legs
  {
    id: 'squat',
    name: 'Squat',
    group: 'legs',
    top: 2.6,
    lower: true,
    aliases: ['back squat', 'squats', 'bb squat', 'barbell squat'],
  },
  {
    id: 'front-squat',
    name: 'Front squat',
    group: 'legs',
    top: 2.1,
    lower: true,
    aliases: ['front squats'],
  },
  {
    id: 'leg-press',
    name: 'Leg press',
    group: 'legs',
    top: 4.5,
    lower: true,
    aliases: ['legpress'],
  },
  {
    id: 'romanian-deadlift',
    name: 'Romanian deadlift',
    group: 'legs',
    top: 2.4,
    lower: true,
    aliases: ['rdl', 'rdls', 'stiff leg deadlift'],
  },
  {
    id: 'hip-thrust',
    name: 'Hip thrust',
    group: 'legs',
    top: 3.2,
    lower: true,
    aliases: ['hip thrusts', 'barbell hip thrust'],
  },
  {
    id: 'lunge',
    name: 'Lunge',
    group: 'legs',
    top: 1.6,
    lower: true,
    aliases: ['lunges', 'walking lunge', 'bulgarian split squat', 'split squat'],
  },
  {
    id: 'leg-curl',
    name: 'Leg curl',
    group: 'legs',
    top: 1.2,
    lower: true,
    aliases: ['hamstring curl', 'lying leg curl', 'seated leg curl'],
  },
  {
    id: 'leg-extension',
    name: 'Leg extension',
    group: 'legs',
    top: 1.5,
    lower: true,
    aliases: ['leg extensions', 'quad extension'],
  },
  {
    id: 'calf-raise',
    name: 'Calf raise',
    group: 'legs',
    top: 2.5,
    lower: true,
    aliases: ['calf raises', 'standing calf raise', 'seated calf raise'],
  },
];

/** Lowercase words separated by single spaces: "Pull-up", "pull  ups!" and "PULL UPS" all compare alike. */
export function nameKey(name: string): string {
  return exerciseKey(name.replace(/[^\p{L}\p{N}]+/gu, ' '));
}

const BY_KEY = new Map<string, Exercise>();
for (const e of EXERCISES) {
  BY_KEY.set(nameKey(e.name), e);
  for (const a of e.aliases) BY_KEY.set(nameKey(a), e);
}

/** The catalogue entry for a name as people write it ("Bench", "flat bench press", "DB curl"), if known. */
export function findExercise(name: string): Exercise | undefined {
  const key = nameKey(name);
  return BY_KEY.get(key) ?? BY_KEY.get(key.replace(/s$/, ''));
}
