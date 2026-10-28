import { describe, expect, it } from "vitest";
import {
  PublicProfile,
  type FoodEntry,
  type Profile,
  type Quest,
  type QuestProgress,
  type Workout,
} from "../../contract.ts";
import * as fx from "../../test/fixtures.ts";
import { gameState, recordXp } from "../game.ts";
import { exerciseRanks, overallRank, TIERS } from "../ranks.ts";
import type { Records } from "../records.ts";
import { publicSummary, weekXp, type SummaryInput } from "./summary.ts";

const TODAY = "2026-10-29"; // a Thursday; the week starts Monday 2026-10-26
const NOW = "2026-10-29T12:00:00.000Z";
const none: Records = { foodEntries: [], workouts: [], weighIns: [] };
const food = (date: string, id = `f-${date}`): FoodEntry => ({
  ...fx.foodEntry,
  id,
  date,
});
const sets = (weightKg: number, reps: number) => [{ weightKg, reps }];
const lift = (
  id: string,
  date: string,
  exercises: Workout["exercises"],
): Workout => ({
  ...fx.strengthWorkout,
  id,
  date,
  exercises,
});
const quest = (id: string, xp: number): Quest => ({ ...fx.dailyQuest, id, xp });
const done = (
  q: Quest,
  completedOn?: string,
): { quest: Quest; progress: QuestProgress } => ({
  quest: q,
  progress: {
    questId: q.id,
    fraction: 1,
    label: "done",
    complete: true,
    ...(completedOn ? { completedOn } : {}),
  },
});
const open = (q: Quest): { quest: Quest; progress: QuestProgress } => ({
  quest: q,
  progress: { questId: q.id, fraction: 0.5, label: "half", complete: false },
});

const lifter: Records = {
  ...none,
  workouts: [
    lift("w1", "2026-10-20", [
      { name: "Bench Press", sets: sets(80, 5) },
      { name: "Squat", sets: sets(120, 5) },
      { name: "Deadlift", sets: sets(150, 3) },
      { name: "Overhead Press", sets: sets(45, 5) },
    ]),
    lift("w2", "2026-10-27", [{ name: "Bench Press", sets: sets(85, 3) }]),
  ],
};

const input = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  profile: fx.profile,
  records: none,
  quests: [],
  bodyweightKg: 80,
  programName: undefined,
  today: TODAY,
  now: NOW,
  ...over,
});
const withSocial = (social: Profile["social"]): Profile => ({
  ...fx.profile,
  social,
});

describe("weekXp", () => {
  it("counts only records from Monday to today, with the daily caps", () => {
    const r: Records = {
      foodEntries: [
        food("2026-10-25"), // Sunday, last week
        ...Array.from({ length: 7 }, (_, i) => food("2026-10-26", `m${i}`)), // capped at 5
        food("2026-10-30"), // tomorrow
      ],
      workouts: [lift("w", "2026-10-28", fx.strengthWorkout.exercises)],
      weighIns: [
        { date: "2026-10-24", kg: 80 },
        { date: "2026-10-29", kg: 80 },
      ],
    };
    expect(weekXp(r, TODAY)).toBe(5 * 2 + 20 + 5);
  });

  it("is 0 on a Monday with nothing logged yet, and resets each week", () => {
    expect(
      weekXp({ ...none, foodEntries: [food("2026-10-25")] }, "2026-10-26"),
    ).toBe(0);
  });
});

describe("publicSummary", () => {
  it("passes the PublicProfile check and carries no health data", () => {
    const s = publicSummary(input({ records: lifter }));
    expect(PublicProfile.parse(s)).toEqual(s);
    const text = JSON.stringify(s);
    for (const banned of [
      "birthYear",
      "heightCm",
      "kcal",
      "sex",
      "goal",
      "weighIn",
      '"kg"',
    ]) {
      expect(text).not.toContain(banned);
    }
    expect(s.v).toBe(1);
    expect(s.updatedAt).toBe(NOW);
    expect(s.week).toBe("2026-10-26");
  });

  it("takes level, XP and streak from the game state, and weekly XP from this week", () => {
    const r: Records = {
      ...none,
      foodEntries: [food("2026-10-20"), food("2026-10-28"), food("2026-10-29")],
      workouts: lifter.workouts,
    };
    const quests = [
      done(quest("q1", 30), "2026-10-27"),
      done(quest("q2", 40), "2026-10-19"),
      done(quest("q3", 15)), // complete but no date: not this week
      open(quest("q4", 99)),
    ];
    const s = publicSummary(input({ records: r, quests }));
    const g = gameState(r, quests, TODAY);
    expect(s).toMatchObject({
      level: g.level,
      xp: g.xp,
      streakDays: g.streakDays,
    });
    expect(s.weekXp).toBe(2 + 2 + 20 + 30);
    expect(s.workouts).toBe(2);
    expect(s.questsDone).toBe(3);
    expect(recordXp(r, TODAY)).toBeGreaterThan(0);
  });

  it("doesn't count workouts after today", () => {
    const r: Records = {
      ...none,
      workouts: [lift("later", "2026-10-30", fx.strengthWorkout.exercises)],
    };
    expect(publicSummary(input({ records: r })).workouts).toBe(0);
  });

  it("shows the best 3 ranked lifts by score, with the overall rank", () => {
    const s = publicSummary(input({ records: lifter }));
    const ranks = exerciseRanks(lifter.workouts, 80, "male");
    const top = [...ranks].sort((a, b) => b.score - a.score).slice(0, 3);
    expect(s.lifts.map((l) => l.exerciseId)).toEqual(
      top.map((r) => r.exercise.id),
    );
    const first = s.lifts[0]!;
    const r0 = top[0]!;
    expect(first).toEqual({
      exerciseId: r0.exercise.id,
      name: r0.exercise.name,
      tierIndex: TIERS.indexOf(r0.tier),
      score: Math.round(r0.score),
      e1rmKg: Math.round(r0.e1rmKg * 10) / 10,
      best: r0.best,
    });
    const overall = overallRank(ranks);
    expect(s.overall).toEqual({
      tierIndex: overall.index,
      score: Math.round(overall.score),
    });
  });

  it("shows the chosen showcase lifts in the chosen order, skipping ones never logged", () => {
    const ranks = exerciseRanks(lifter.workouts, 80, "male");
    const ids = ranks.map((r) => r.exercise.id);
    const pick = [ids[2]!, "not-an-exercise", ids[0]!];
    const s = publicSummary(
      input({ records: lifter, profile: withSocial({ showcaseLifts: pick }) }),
    );
    expect(s.lifts.map((l) => l.exerciseId)).toEqual([ids[2], ids[0]]);
  });

  it("shares no lifts, no overall rank and no lifter titles when lifts are hidden", () => {
    const s = publicSummary(
      input({ records: lifter, profile: withSocial({ shareLifts: false }) }),
    );
    expect(s.lifts).toEqual([]);
    expect(s.overall).toBeUndefined();
    expect(s.titles.some((t) => t.endsWith("_lifter") || t === "titan")).toBe(
      false,
    );
  });

  it("ranks nothing without a body weight", () => {
    const s = publicSummary(
      input({ records: lifter, bodyweightKg: undefined }),
    );
    expect(s.lifts).toEqual([]);
    expect(s.overall).toBeUndefined();
  });

  it("publishes only unlocked titles, and trims the bio", () => {
    const s = publicSummary(
      input({
        profile: withSocial({
          bio: "  Leg day enjoyer  ",
          title: "legend", // not unlocked
          showcaseTitles: ["novice", "gym_rat", "novice"],
        }),
      }),
    );
    expect(s.bio).toBe("Leg day enjoyer");
    expect(s.title).toBeUndefined();
    expect(s.titles).toEqual(["novice"]);
    expect(s.showcaseTitles).toEqual(["novice"]);
    const ok = publicSummary(
      input({ profile: withSocial({ title: "novice" }) }),
    );
    expect(ok.title).toBe("novice");
    expect(ok.bio).toBe("");
  });

  it("carries the hero, its look and the program name", () => {
    const profile: Profile = {
      ...fx.profile,
      hero: "female-c",
      heroLook: { head: "male-a", colours: { "3": 12 } },
    };
    const s = publicSummary(input({ profile, programName: "Couch to 5K" }));
    expect(s.hero).toBe("female-c");
    expect(s.heroLook).toEqual({ head: "male-a", colours: { "3": 12 } });
    expect(s.program).toBe("Couch to 5K");
    const bare = publicSummary(input());
    expect("hero" in bare).toBe(false);
    expect("heroLook" in bare).toBe(false);
    expect("program" in bare).toBe(false);
    expect("title" in bare).toBe(false);
  });

  it("leaves its inputs alone", () => {
    const i = input({ records: lifter, profile: withSocial({ bio: " x " }) });
    const frozen = JSON.stringify(i);
    publicSummary(i);
    expect(JSON.stringify(i)).toBe(frozen);
  });
});
