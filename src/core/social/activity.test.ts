import { describe, expect, it } from "vitest";
import {
  PublicActivity,
  type Quest,
  type QuestProgress,
  type Workout,
} from "../../contract.ts";
import * as fx from "../../test/fixtures.ts";
import type { Records } from "../records.ts";
import { exerciseRanks } from "../ranks.ts";
import {
  ACTIVITY_DAYS,
  activityItems,
  type ActivityInput,
} from "./activity.ts";

const TODAY = "2026-10-29";
const none: Records = { foodEntries: [], workouts: [], weighIns: [] };
const lift = (
  id: string,
  date: string,
  over: Partial<Workout> = {},
): Workout => ({
  ...fx.strengthWorkout,
  id,
  date,
  ...over,
});
const run = (
  id: string,
  date: string,
  sets: Workout["exercises"][number]["sets"],
  title?: string,
) =>
  ({
    ...fx.runWorkout,
    id,
    date,
    exercises: [{ name: "Run", sets }],
    ...(title ? { title } : {}),
  }) as Workout;
const done = (id: string, title: string, xp: number, completedOn?: string) => ({
  quest: { ...fx.dailyQuest, id, title, xp } as Quest,
  progress: {
    questId: id,
    fraction: 1,
    label: "done",
    complete: true,
    ...(completedOn ? { completedOn } : {}),
  } as QuestProgress,
});

const input = (over: Partial<ActivityInput> = {}): ActivityInput => ({
  records: none,
  quests: [],
  bodyweightKg: 80,
  sex: "male",
  units: "metric",
  shareLifts: true,
  today: TODAY,
  ...over,
});

describe("activityItems", () => {
  it("covers the last 30 days only, today included", () => {
    expect(ACTIVITY_DAYS).toBe(30);
    const records: Records = {
      ...none,
      workouts: [
        lift("in", "2026-09-30"), // 29 days before today: the first day in
        lift("out", "2026-09-29"),
        lift("future", "2026-10-30"),
      ],
    };
    const ids = activityItems(input({ records, shareLifts: false })).map(
      (i) => i.id,
    );
    expect(ids).toEqual(["workout:in"]);
  });

  it("describes a strength workout by its title, or else its first exercises", () => {
    const records: Records = {
      ...none,
      workouts: [
        lift("a", "2026-10-28", { title: "Push day", durationMin: 52.4 }),
        lift("b", "2026-10-27", {
          exercises: [
            { name: "Squat", sets: [{ reps: 5, weightKg: 100 }] },
            {
              name: "Leg press",
              sets: [
                { reps: 10, weightKg: 150 },
                { reps: 10, weightKg: 150 },
              ],
            },
            { name: "Lunge", sets: [{ reps: 8 }] },
            { name: "Calf raise", sets: [{ reps: 15 }] },
          ],
        }),
      ],
    };
    const items = activityItems(input({ records, shareLifts: false }));
    expect(items.map((i) => i.data)).toEqual([
      {
        v: 1,
        kind: "workout",
        date: "2026-10-28",
        title: "Push day",
        detail: "1 exercise · 3 sets · 52 min",
      },
      {
        v: 1,
        kind: "workout",
        date: "2026-10-27",
        title: "Squat, Leg press, Lunge",
        detail: "4 exercises · 5 sets",
      },
    ]);
  });

  it("describes a run by distance and time, in the player’s units", () => {
    const records: Records = {
      ...none,
      workouts: [
        run(
          "r1",
          "2026-10-28",
          [{ distanceM: 5240, durationS: 1720 }],
          "Easy run",
        ),
        run("r2", "2026-10-27", [
          { distanceM: 10000, durationS: 3000 },
          { distanceM: 2000, durationS: 900 },
        ]),
        run("r3", "2026-10-26", [{ durationS: 600 }]),
      ],
    };
    const metric = activityItems(input({ records, shareLifts: false })).map(
      (i) => i.data,
    );
    expect(metric.map((d) => [d.kind, d.title, d.detail])).toEqual([
      ["run", "Easy run", "5.2 km in 28:40"],
      ["run", "Run", "12 km in 1:05:00"],
      ["run", "Run", "10:00"],
    ]);
    const imperial = activityItems(
      input({ records, shareLifts: false, units: "imperial" }),
    );
    expect(imperial[0]!.data.detail).toBe("3.3 mi in 28:40");
  });

  it("lists quests finished in the window, with their XP", () => {
    const quests = [
      done("q1", "Log 3 meals", 40, "2026-10-29"),
      done("q2", "Old quest", 10, "2026-09-01"),
      done("q3", "No date", 10),
      {
        quest: { ...fx.dailyQuest, id: "q4" } as Quest,
        progress: {
          questId: "q4",
          fraction: 0.5,
          label: "half",
          complete: false,
        } as QuestProgress,
      },
    ];
    const items = activityItems(input({ quests }));
    expect(items).toEqual([
      {
        id: "quest:q1",
        data: {
          v: 1,
          kind: "quest",
          date: "2026-10-29",
          title: "Log 3 meals",
          detail: "+40 XP",
        },
      },
    ]);
  });

  it("lists new best lifts set in the window, only when lifts are shared and ranked", () => {
    const records: Records = {
      ...none,
      workouts: [
        lift("old", "2026-08-01", {
          exercises: [
            { name: "Bench Press", sets: [{ reps: 5, weightKg: 70 }] },
          ],
        }),
        lift("new", "2026-10-20", {
          exercises: [
            { name: "Bench Press", sets: [{ reps: 3, weightKg: 85 }] },
          ],
        }),
        lift("sq", "2026-08-02", {
          exercises: [{ name: "Squat", sets: [{ reps: 5, weightKg: 120 }] }],
        }),
      ],
    };
    const bench = exerciseRanks(records.workouts, 80, "male").find(
      (r) => r.best.date === "2026-10-20",
    );
    expect(bench).toBeDefined();
    const items = activityItems(input({ records }));
    const prs = items.filter((i) => i.data.kind === "pr");
    expect(prs).toEqual([
      {
        id: `pr:${bench!.exercise.id}:2026-10-20`,
        data: {
          v: 1,
          kind: "pr",
          date: "2026-10-20",
          title: `New best: ${bench!.exercise.name}`,
          detail: "85 kg × 3",
        },
      },
    ]);
    const lb = activityItems(input({ records, units: "imperial" })).find(
      (i) => i.data.kind === "pr",
    );
    expect(lb!.data.detail).toBe("187 lb × 3");
    expect(
      activityItems(input({ records, shareLifts: false })).some(
        (i) => i.data.kind === "pr",
      ),
    ).toBe(false);
    expect(
      activityItems(input({ records, bodyweightKg: undefined })).some(
        (i) => i.data.kind === "pr",
      ),
    ).toBe(false);
  });

  it("puts the newest first (on one day: best lifts, quests, then workouts) and every item passes the check", () => {
    const records: Records = {
      ...none,
      workouts: [
        lift("w", "2026-10-28", {
          exercises: [
            { name: "Bench Press", sets: [{ reps: 3, weightKg: 90 }] },
          ],
        }),
        run("r", "2026-10-29", [{ distanceM: 3000, durationS: 1000 }]),
      ],
    };
    const quests = [done("q", "Lift something", 30, "2026-10-28")];
    const items = activityItems(input({ records, quests }));
    expect(items.map((i) => `${i.data.date} ${i.data.kind}`)).toEqual([
      "2026-10-29 run",
      "2026-10-28 pr",
      "2026-10-28 quest",
      "2026-10-28 workout",
    ]);
    for (const i of items) expect(PublicActivity.parse(i.data)).toEqual(i.data);
  });

  it("keeps titles within 100 characters, keeps at most 60 items, and leaves its input alone", () => {
    const long = "x".repeat(150);
    const records: Records = {
      ...none,
      workouts: Array.from({ length: 70 }, (_, i) =>
        lift(`w${String(i).padStart(2, "0")}`, "2026-10-29", { title: long }),
      ),
    };
    const frozen = JSON.stringify(records);
    const items = activityItems(input({ records, shareLifts: false }));
    expect(items).toHaveLength(60);
    expect(items[0]!.data.title).toHaveLength(100);
    // same day and kind: by id
    expect(items[0]!.id).toBe("workout:w00");
    expect(JSON.stringify(records)).toBe(frozen);
  });
});
