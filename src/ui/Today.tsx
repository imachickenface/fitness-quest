import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo, useState } from 'react';
import type { Food, FoodEntry, MealSlot, Profile, SavedMeal } from '../contract.ts';
import {
  dayTotals,
  defaultMealSlot,
  entryFromFood,
  expandSavedMeal,
  localDate,
  quickAddEntry,
  recentFoods,
  totalsByMeal,
} from '../core/diary.ts';
import { calorieTarget } from '../core/targets.ts';
import {
  addFoodEntries,
  addFoodEntry,
  deleteFoodEntry,
  listEntriesForDate,
  listFavouriteFoods,
  listRecentEntries,
  listSavedMeals,
  listWeighIns,
  upsertFood,
  upsertSavedMeal,
} from '../db/db.ts';
import { useDb } from './dbContext.ts';
import {
  MEAL_LABELS,
  MEAL_SLOTS,
  addDays,
  dayTitle,
  grams as fmtGrams,
  kcal,
  newId,
  nowStamp,
} from './format.ts';
import { LabelSheet } from './LabelSheet.tsx';
import { PortionSheet } from './PortionSheet.tsx';
import { ProfileForm } from './ProfileForm.tsx';
import { QuickAddSheet } from './QuickAddSheet.tsx';
import { SaveMealSheet } from './SaveMealSheet.tsx';
import { ScanSheet, type Missing } from './ScanSheet.tsx';
import { SearchSheet } from './SearchSheet.tsx';
import { Sheet } from './Sheet.tsx';
import { Toast, type ToastMessage } from './Toast.tsx';
import { useFoodCatalog } from './useFoodCatalog.ts';

type Open =
  | { kind: 'none' }
  | { kind: 'search' }
  | { kind: 'portion'; food: Food; grams?: number }
  | { kind: 'quick' }
  | { kind: 'scan' }
  | { kind: 'label'; missing: Partial<Missing> }
  | { kind: 'save-meal'; meal: MealSlot }
  | { kind: 'profile' };

/** Stable empty default while a live query loads, so memos don't recompute every render. */
const NONE: never[] = [];

type QuickItem = { key: string; label: string; detail: string; log: () => void };

export function Today({ profile }: { profile: Profile }) {
  const db = useDb();
  const catalog = useFoodCatalog();
  const today = localDate(new Date());
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState<Open>({ kind: 'none' });
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const entries = useLiveQuery(() => listEntriesForDate(db, date), [db, date], NONE);
  const recentEntries = useLiveQuery(() => listRecentEntries(db, 60), [db], NONE);
  const favourites = useLiveQuery(() => listFavouriteFoods(db), [db], NONE);
  const savedMeals = useLiveQuery(() => listSavedMeals(db), [db], NONE);
  const weighIns = useLiveQuery(() => listWeighIns(db), [db], NONE);

  const weightKg = weighIns.at(-1)?.kg;
  const target = weightKg ? calorieTarget(profile, weightKg, today) : null;
  const totals = dayTotals(entries);
  const byMeal = totalsByMeal(entries);
  const recents = useMemo(() => recentFoods(recentEntries, 12), [recentEntries]);
  const recentIds = useMemo(() => recents.map((r) => r.foodId), [recents]);
  const mealNow = defaultMealSlot(new Date().getHours());

  const close = () => setOpen({ kind: 'none' });

  function say(text: string, undo?: () => void) {
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, text, undo }));
  }

  async function logFood(food: Food, grams: number, meal: MealSlot, favourite = food.favourite) {
    const now = nowStamp();
    const stored = favourite === food.favourite ? food : { ...food, favourite, updatedAt: now };
    await upsertFood(db, stored);
    const entry = entryFromFood(stored, grams, { date, meal, now, id: newId() });
    await addFoodEntry(db, entry);
    say(
      `${entry.label}: ${kcal(entry.nutrition.kcal)} kcal`,
      () => void deleteFoodEntry(db, entry.id),
    );
  }

  async function logSavedMeal(meal: SavedMeal) {
    const entries = expandSavedMeal(meal, catalog.byId, {
      date,
      meal: mealNow,
      now: nowStamp(),
      newId,
    });
    await addFoodEntries(db, entries);
    const total = entries.reduce((s, e) => s + e.nutrition.kcal, 0);
    say(`${meal.name}: ${kcal(total)} kcal`, () => {
      for (const e of entries) void deleteFoodEntry(db, e.id);
    });
  }

  async function removeEntry(entry: FoodEntry) {
    await deleteFoodEntry(db, entry.id);
    say(`Removed ${entry.label}`, () => void addFoodEntry(db, entry));
  }

  async function saveMeal(slot: MealSlot, name: string) {
    const items = entries
      .filter((e) => e.meal === slot && e.foodId !== null && e.grams !== undefined)
      .map((e) => ({ foodId: e.foodId as string, grams: e.grams as number }));
    await upsertSavedMeal(db, { id: newId(), name, items, favourite: true, updatedAt: nowStamp() });
    close();
    say(`Saved "${name}" to quick log`);
  }

  // one-tap items: saved meals, then favourite foods, then recent foods not already shown
  const quick: QuickItem[] = [];
  const shown = new Set<string>();
  for (const m of savedMeals) {
    const total = m.items.reduce((s, i) => {
      const f = catalog.byId.get(i.foodId);
      return s + (f ? (f.per100g.kcal * i.grams) / 100 : 0);
    }, 0);
    quick.push({
      key: `meal-${m.id}`,
      label: m.name,
      detail: `meal · ${kcal(total)} kcal`,
      log: () => void logSavedMeal(m),
    });
  }
  const lastGrams = new Map(recents.map((r) => [r.foodId, r.grams]));
  const quickFood = (food: Food, star: boolean) => {
    if (shown.has(food.id)) return;
    shown.add(food.id);
    const g = lastGrams.get(food.id) ?? food.portions[0]?.grams ?? 100;
    quick.push({
      key: `food-${food.id}`,
      label: `${star ? '★ ' : ''}${food.name}`,
      detail: `${fmtGrams(g)} · ${kcal((food.per100g.kcal * g) / 100)} kcal`,
      log: () => void logFood(food, g, mealNow),
    });
  };
  for (const f of favourites) quickFood(f, true);
  for (const r of recents) {
    const f = catalog.byId.get(r.foodId);
    if (f) quickFood(f, f.favourite);
  }

  const remaining = target ? target.kcal - totals.kcal : null;
  const filled = target ? Math.min(1, totals.kcal / target.kcal) : 0;

  return (
    <div className="today">
      <header className="topbar">
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous day"
          onClick={() => setDate((d) => addDays(d, -1))}
        >
          ‹
        </button>
        <h1>{dayTitle(date, today)}</h1>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => setDate((d) => addDays(d, 1))}
        >
          ›
        </button>
        <button
          type="button"
          className="icon-btn topbar-end"
          aria-label="Profile and targets"
          onClick={() => setOpen({ kind: 'profile' })}
        >
          ⚙
        </button>
      </header>

      <section className="panel energy" aria-label="Calories">
        {target && remaining !== null ? (
          <>
            <p className="energy-big">
              <span className="pixel">{kcal(Math.abs(remaining))}</span>
              <span> kcal {remaining >= 0 ? 'left' : 'over'}</span>
            </p>
            <div
              className="bar"
              role="progressbar"
              aria-label="Calories eaten"
              aria-valuemin={0}
              aria-valuemax={target.kcal}
              aria-valuenow={Math.round(totals.kcal)}
            >
              <div
                className={remaining < 0 ? 'bar-fill over' : 'bar-fill'}
                style={{ width: `${filled * 100}%` }}
              />
            </div>
            <p className="energy-sub muted">
              {kcal(totals.kcal)} eaten of {kcal(target.kcal)}
            </p>
            <dl className="macros">
              <Macro name="Protein" eaten={totals.proteinG} goal={target.proteinG} />
              <Macro name="Carbs" eaten={totals.carbsG} goal={target.carbsG} />
              <Macro name="Fat" eaten={totals.fatG} goal={target.fatG} />
            </dl>
          </>
        ) : (
          <p>
            <span className="pixel">{kcal(totals.kcal)}</span> kcal eaten
          </p>
        )}
      </section>

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary btn-big"
          onClick={() => setOpen({ kind: 'search' })}
        >
          Search food
        </button>
        <button type="button" className="btn btn-big" onClick={() => setOpen({ kind: 'scan' })}>
          Scan
        </button>
        <button type="button" className="btn btn-big" onClick={() => setOpen({ kind: 'quick' })}>
          + kcal
        </button>
      </div>

      {quick.length > 0 && (
        <section className="quick" aria-labelledby="quick-title">
          <h2 id="quick-title">Quick log</h2>
          <ul className="quick-list">
            {quick.slice(0, 14).map((q) => (
              <li key={q.key}>
                <button type="button" className="quick-item" onClick={q.log}>
                  <span className="quick-label">{q.label}</span>
                  <span className="quick-detail">{q.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {MEAL_SLOTS.map((slot) => {
        const list = entries.filter((e) => e.meal === slot);
        const savable = list.filter((e) => e.foodId !== null && e.grams !== undefined).length;
        return (
          <section key={slot} className="panel meal" aria-labelledby={`meal-${slot}`}>
            <header className="meal-head">
              <h2 id={`meal-${slot}`}>{MEAL_LABELS[slot]}</h2>
              <span className="pixel">{kcal(byMeal[slot].kcal)}</span>
            </header>
            {list.length === 0 ? (
              <p className="muted meal-empty">Nothing yet</p>
            ) : (
              <ul className="entry-list">
                {list.map((e) => (
                  <li key={e.id} className="entry">
                    <span className="entry-name">
                      {e.label}
                      {e.grams !== undefined && (
                        <span className="muted"> · {fmtGrams(e.grams)}</span>
                      )}
                    </span>
                    <span className="entry-kcal">{kcal(e.nutrition.kcal)}</span>
                    <button
                      type="button"
                      className="icon-btn icon-btn-small"
                      aria-label={`Remove ${e.label}`}
                      onClick={() => void removeEntry(e)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {savable >= 2 && (
              <button
                type="button"
                className="link-btn"
                onClick={() => setOpen({ kind: 'save-meal', meal: slot })}
              >
                Save as a meal
              </button>
            )}
          </section>
        );
      })}

      {open.kind === 'search' && (
        <SearchSheet
          catalog={catalog}
          recentFoodIds={recentIds}
          onClose={close}
          onPick={(food) => setOpen({ kind: 'portion', food, grams: lastGrams.get(food.id) })}
          onAddOwn={() => setOpen({ kind: 'label', missing: {} })}
        />
      )}
      {open.kind === 'scan' && (
        <ScanSheet
          onClose={close}
          onFound={(food) => setOpen({ kind: 'portion', food, grams: lastGrams.get(food.id) })}
          onMissing={(missing) => setOpen({ kind: 'label', missing })}
        />
      )}
      {open.kind === 'label' && (
        <LabelSheet
          {...open.missing}
          onClose={close}
          onSaved={(food) => setOpen({ kind: 'portion', food })}
        />
      )}
      {open.kind === 'portion' && (
        <PortionSheet
          food={open.food}
          defaultGrams={open.grams}
          defaultMeal={mealNow}
          onClose={close}
          onLog={(food, g, meal, fav) => {
            close();
            void logFood(food, g, meal, fav);
          }}
        />
      )}
      {open.kind === 'quick' && (
        <QuickAddSheet
          defaultMeal={mealNow}
          onClose={close}
          onLog={(value, label, meal) => {
            close();
            const entry = quickAddEntry(value, label, { date, meal, now: nowStamp(), id: newId() });
            void addFoodEntry(db, entry).then(() =>
              say(`${entry.label}: ${kcal(value)} kcal`, () => void deleteFoodEntry(db, entry.id)),
            );
          }}
        />
      )}
      {open.kind === 'save-meal' && (
        <SaveMealSheet
          defaultName={MEAL_LABELS[open.meal]}
          itemCount={
            entries.filter((e) => e.meal === open.meal && e.foodId !== null && e.grams).length
          }
          onClose={close}
          onSave={(name) => void saveMeal(open.meal, name)}
        />
      )}
      {open.kind === 'profile' && (
        <Sheet title="Profile and targets" onClose={close}>
          {target && (
            <p className="muted">
              Maintenance about {kcal(target.tdee)} kcal; target {kcal(target.kcal)} kcal
              {target.note === 'floor' && ' (raised to a safe minimum)'}.
            </p>
          )}
          <ProfileForm
            initial={profile}
            initialWeightKg={weightKg}
            onSaved={close}
            onCancel={close}
          />
        </Sheet>
      )}

      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}

function Macro({ name, eaten, goal }: { name: string; eaten: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, (eaten / goal) * 100) : 0;
  return (
    <div className="macro">
      <dt>{name}</dt>
      <dd>
        {Math.round(eaten)} / {goal} g
        <span className="bar bar-thin" aria-hidden="true">
          <span className="bar-fill" style={{ width: `${pct}%` }} />
        </span>
      </dd>
    </div>
  );
}
