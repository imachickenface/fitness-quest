import { describe, expect, it } from "vitest";
import {
  TITLE_IDS,
  type FoodEntry,
  type TitleId,
  type Workout,
} from "../../contract.ts";
import * as fx from "../../test/fixtures.ts";
import { addDays } from "../dates.ts";
import type { Records } from "../records.ts";
import { bestRun, TITLES, unlockedTitles, type TitleInput } from "./titles.ts";

const TODAY = "2026-10-27";
const none: Records = { foodEntries: [], workouts: [], weighIns: [] };
const food = (date: string, id = `f-${date}`): FoodEntry => ({
  ...fx.foodEntry,
  id,
  date,
});
const lift = (date: string, id = `w-${date}`): Workout => ({
  ...fx.strengthWorkout,
  id,
  date,
});
const run = (date: string, id = `r-${date}`): Workout => ({
  ...fx.runWorkout,
  id,
  date,
});
/** `n` days in a row ending on `end` */
const days = (n: number, end: string) =>
  Array.from({ length: n }, (_, i) => addDays(end, -i));

const base: TitleInput = {
  level: 1,
  records: none,
  questsDone: 0,
  today: TODAY,
};
const titles = (over: Partial<TitleInput>) =>
  unlockedTitles({ ...base, ...over });

describe("TITLES", () => {
  it("names and explains every title", () => {
    expect(Object.keys(TITLES).sort()).toEqual([...TITLE_IDS].sort());
    for (const id of TITLE_IDS) {
      expect(TITLES[id].name.length, id).toBeGreaterThan(0);
      expect(TITLES[id].how.length, id).toBeGreaterThan(0);
    }
    expect(TITLES.hero_of_the_realm.name).toBe("Hero of the Realm");
    expect(TITLES.apprentice.how).toBe("Reach level 5");
  });
});

describe("bestRun", () => {
  it("is 0 with no records", () => {
    expect(bestRun(none, TODAY)).toBe(0);
  });

  it("finds the longest run of active days, from any kind of record", () => {
    const r: Records = {
      // 3 days of food, a gap, then 4 days mixing food, a workout and a weigh-in
      foodEntries: [
        ...days(3, "2026-10-10").map((d) => food(d)),
        food("2026-10-20"),
      ],
      workouts: [lift("2026-10-21")],
      weighIns: [
        { date: "2026-10-22", kg: 80 },
        { date: "2026-10-23", kg: 80 },
      ],
    };
    expect(bestRun(r, TODAY)).toBe(4);
  });

  it("counts a day once however many records it has", () => {
    const r: Records = {
      ...none,
      foodEntries: [
        food("2026-10-26", "a"),
        food("2026-10-26", "b"),
        food("2026-10-27", "c"),
      ],
      workouts: [lift("2026-10-26")],
    };
    expect(bestRun(r, TODAY)).toBe(2);
  });

  it("ignores records dated after today", () => {
    const r: Records = {
      ...none,
      foodEntries: days(5, "2026-10-29").map((d) => food(d)),
    };
    expect(bestRun(r, TODAY)).toBe(3); // 25, 26, 27
  });

  it("runs across month and year ends, and gives no freezes", () => {
    const r: Records = {
      ...none,
      foodEntries: [
        ...days(4, "2026-01-02").map((d) => food(d)),
        food("2026-01-04"),
      ],
    };
    expect(bestRun(r, TODAY)).toBe(4); // Dec 30 - Jan 2; Jan 3 is a gap
  });
});

describe("unlockedTitles", () => {
  it("everyone starts as a Novice", () => {
    expect(titles({})).toEqual(["novice"]);
  });

  it("unlocks level titles at 5, 10, 20, 35 and 50", () => {
    expect(titles({ level: 4 })).toEqual(["novice"]);
    expect(titles({ level: 5 })).toEqual(["novice", "apprentice"]);
    expect(titles({ level: 34 })).toEqual([
      "novice",
      "apprentice",
      "adventurer",
      "veteran",
    ]);
    expect(titles({ level: 50 })).toEqual([
      "novice",
      "apprentice",
      "adventurer",
      "veteran",
      "champion",
      "legend",
    ]);
  });

  it("unlocks streak titles from the best run, even if the run is over", () => {
    const r: Records = {
      ...none,
      foodEntries: days(7, "2026-09-01").map((d) => food(d)),
    };
    expect(titles({ records: r })).toEqual(["novice", "steady"]);
    const r30: Records = {
      ...none,
      foodEntries: days(30, "2026-09-30").map((d) => food(d)),
    };
    expect(titles({ records: r30 })).toContain("unbreakable");
    expect(titles({ records: r30 })).not.toContain("relentless");
    const r100: Records = {
      ...none,
      foodEntries: days(100, TODAY).map((d) => food(d)),
    };
    expect(titles({ records: r100 })).toEqual([
      "novice",
      "steady",
      "unbreakable",
      "relentless",
    ]);
  });

  it("counts every workout for the workout titles, and runs for Road Runner", () => {
    const at = (n: number, make: (d: string) => Workout) =>
      Array.from({ length: n }, (_, i) => make(addDays("2025-01-01", i * 2)));
    expect(titles({ records: { ...none, workouts: at(1, lift) } })).toEqual([
      "novice",
      "first_sweat",
    ]);
    const mixed = { ...none, workouts: [...at(15, lift), ...at(10, run)] };
    expect(titles({ records: mixed })).toEqual([
      "novice",
      "first_sweat",
      "regular",
      "road_runner",
    ]);
    const many = { ...none, workouts: at(250, lift) };
    expect(titles({ records: many })).toEqual([
      "novice",
      "first_sweat",
      "regular",
      "iron_devotee",
      "gym_rat",
    ]);
    const nine = { ...none, workouts: at(9, run) };
    expect(titles({ records: nine })).not.toContain("road_runner");
  });

  it("doesn't count workouts dated after today", () => {
    expect(
      titles({ records: { ...none, workouts: [lift("2026-10-28")] } }),
    ).toEqual(["novice"]);
  });

  it("unlocks quest titles at 10 and 100 completed quests", () => {
    expect(titles({ questsDone: 9 })).toEqual(["novice"]);
    expect(titles({ questsDone: 10 })).toEqual(["novice", "quester"]);
    expect(titles({ questsDone: 100 })).toEqual([
      "novice",
      "quester",
      "hero_of_the_realm",
    ]);
  });

  it("unlocks lifter titles from the overall tier: Silver 2, Gold 3, Diamond 5, Titan 7", () => {
    expect(titles({ overallTierIndex: 1 })).toEqual(["novice"]);
    expect(titles({ overallTierIndex: 2 })).toEqual([
      "novice",
      "silver_lifter",
    ]);
    expect(titles({ overallTierIndex: 6 })).toEqual([
      "novice",
      "silver_lifter",
      "gold_lifter",
      "diamond_lifter",
    ]);
    expect(titles({ overallTierIndex: 8 })).toEqual([
      "novice",
      "silver_lifter",
      "gold_lifter",
      "diamond_lifter",
      "titan",
    ]);
  });

  it("returns titles in TITLE_IDS order and leaves the input alone", () => {
    const r: Records = {
      ...none,
      workouts: Array.from({ length: 25 }, (_, i) =>
        lift(addDays("2026-01-01", i)),
      ),
    };
    const frozen = JSON.stringify(r);
    const got = titles({
      level: 10,
      records: r,
      questsDone: 10,
      overallTierIndex: 3,
    });
    const order = (t: TitleId) => TITLE_IDS.indexOf(t);
    expect([...got].sort((a, b) => order(a) - order(b))).toEqual(got);
    expect(got).toEqual([
      "novice",
      "apprentice",
      "adventurer",
      "steady",
      "first_sweat",
      "regular",
      "quester",
      "silver_lifter",
      "gold_lifter",
    ]);
    expect(JSON.stringify(r)).toBe(frozen);
  });
});
