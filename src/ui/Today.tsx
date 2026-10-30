import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo, useState } from 'react';
import type { AmountUnit, Food, FoodEntry, MealSlot, Profile, SavedMeal } from '../contract.ts';
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
import { adaptiveTdee } from '../core/adaptiveTdee.ts';
import { calorieTarget } from '../core/targets.ts';
import {
  addFoodEntries,
  addFoodEntry,
  deleteFoodEntry,
  getSettings,
  listEntriesForDate,
  listEntriesBetween,
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
  amount,
  kcal,
  newId,
  nowStamp,
} from './format.ts';
import { Icon } from './Icon.tsx';
import { LabelSheet } from './LabelSheet.tsx';
import { PortionSheet } from './PortionSheet.tsx';
import { ProfileForm } from './ProfileForm.tsx';
import { AccountPanel } from './AccountPanel.tsx';
import { BurnCard } from './BurnCard.tsx';
import { BackupPanel } from './BackupPanel.tsx';
import { Credits } from './Credits.tsx';
import { backupDue, saveBackup } from './backupActions.ts';
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

export function Today({ profile, streakDays }: { profile: Profile; streakDays?: number }) {
  const db = useDb();
  const catalog = useFoodCatalog();
  const today = localDate(new Date());
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState<Open>({ kind: 'none' });
  /** set by a meal's own "Add food" button; otherwise the meal for the time of day */
  const [forMeal, setForMeal] = useState<MealSlot | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const entries = useLiveQuery(() => listEntriesForDate(db, date), [db, date], NONE);
  const recentEntries = useLiveQuery(() => listRecentEntries(db, 60), [db], NONE);
  const favourites = useLiveQuery(() => listFavouriteFoods(db), [db], NONE);
  const savedMeals = useLiveQuery(() => listSavedMeals(db), [db], NONE);
  const weighIns = useLiveQuery(() => listWeighIns(db), [db], NONE);

  const weightKg = weighIns.at(-1)?.kg;
  const target = weightKg ? calorieTarget(profile, weightKg, today) : null;
  const defaults = weightKg
    ? calorieTarget(
        { ...profile, kcalTargetOverride: undefined, macroTargets: undefined },
        weightKg,
        today,
      )
    : null;
  const monthEntries = useLiveQuery(
    () => listEntriesBetween(db, addDays(today, -28), addDays(today, -1)),
    [db, today],
    NONE,
  );
  const measured = defaults
    ? adaptiveTdee({ foodEntries: monthEntries, weighIns, formulaTdee: defaults.tdee, today })
    : null;
  const fromLogs =
    measured && defaults
      ? {
          maintenance: measured.kcal,
          kcal: measured.kcal + defaults.kcal - defaults.tdee,
          kgPerWeek: measured.kgPerWeek,
        }
      : undefined;
  const totals = dayTotals(entries);
  const byMeal = totalsByMeal(entries);
  const recents = useMemo(() => recentFoods(recentEntries, 12), [recentEntries]);
  const recentIds = useMemo(() => recents.map((r) => r.foodId), [recents]);
  const mealNow = defaultMealSlot(new Date().getHours());

  const settings = useLiveQuery(() => getSettings(db), [db], undefined);
  const [laterBackup, setLaterBackup] = useState(false);
  const due =
    settings && !laterBackup ? backupDue(settings.lastBackupAt, weighIns[0]?.date, today) : null;

  const close = () => {
    setOpen({ kind: 'none' });
    setForMeal(null);
  };

  function say(text: string, undo?: () => void) {
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, text, undo }));
  }

  async function logFood(
    food: Food,
    grams: number,
    meal: MealSlot,
    favourite = food.favourite,
    unit: AmountUnit = food.unit ?? 'g',
  ) {
    const now = nowStamp();
    const sameUnit = unit === (food.unit ?? 'g');
    const stored =
      favourite === food.favourite && sameUnit
        ? food
        : { ...food, favourite, unit, updatedAt: now };
    await upsertFood(db, stored);
    const made = entryFromFood(stored, grams, { date, meal, now, id: newId() });
    const entry = unit === 'ml' ? { ...made, unit } : made;
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
      detail: `${amount(g, food.unit)} · ${kcal((food.per100g.kcal * g) / 100)} kcal`,
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
          <Icon name="left" />
        </button>
        <h1>{dayTitle(date, today)}</h1>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => setDate((d) => addDays(d, 1))}
        >
          <Icon name="right" />
        </button>
        {streakDays !== undefined && (
          <span
            className={streakDays > 0 ? 'stat-chip' : 'stat-chip cold'}
            aria-label={`${streakDays}-day streak`}
          >
            <Icon name="flame" size={22} />
            {streakDays}
          </span>
        )}
        <button
          type="button"
          className="icon-btn topbar-end"
          aria-label="Profile and targets"
          onClick={() => setOpen({ kind: 'profile' })}
        >
          <Icon name="gear" />
        </button>
      </header>

      {due !== null && (
        <section className="panel backup-due" aria-label="Backup reminder">
          <p>
            {settings?.lastBackupAt
              ? `Your last backup was ${due} days ago.`
              : 'Your data is only on this phone. Save a backup in case it gets lost.'}
          </p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setLaterBackup(true)}>
              Later
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void saveBackup(db).then(() => say('Backup saved'))}
            >
              Save a backup
            </button>
          </div>
        </section>
      )}

      <section className="panel energy" aria-label="Calories">
        <h2>Calories remaining</h2>
        {target && remaining !== null ? (
          <>
            <div className="formula">
              <p>
                <b>{kcal(target.kcal)}</b>
                <span>Goal</span>
              </p>
              <span className="op" aria-hidden="true">
                −
              </span>
              <p>
                <b>{kcal(totals.kcal)}</b>
                <span>Food</span>
              </p>
              <span className="op" aria-hidden="true">
                =
              </span>
              <p className={remaining < 0 ? 'remaining over' : 'remaining'}>
                <b>{kcal(Math.abs(remaining))}</b>
                <span>{remaining < 0 ? 'Over' : 'Remaining'}</span>
              </p>
            </div>
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
            <dl className="macros">
              <Macro name="Protein" eaten={totals.proteinG} goal={target.proteinG} />
              <Macro name="Carbs" eaten={totals.carbsG} goal={target.carbsG} />
              <Macro name="Fat" eaten={totals.fatG} goal={target.fatG} />
            </dl>
          </>
        ) : (
          <p className="formula-plain">
            <b>{kcal(totals.kcal)}</b> kcal eaten
          </p>
        )}
      </section>

      <BurnCard date={date} today={today} />

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary btn-big"
          aria-label="Search food"
          onClick={() => setOpen({ kind: 'search' })}
        >
          <Icon name="search" size={18} />
          Search
        </button>
        <button type="button" className="btn btn-big" onClick={() => setOpen({ kind: 'scan' })}>
          <Icon name="barcode" size={18} />
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
              <span className="kcal">{kcal(byMeal[slot].kcal)}</span>
            </header>
            {list.length > 0 && (
              <ul className="entry-list">
                {list.map((e) => (
                  <li key={e.id} className="entry">
                    <span className="entry-name">
                      {e.label}
                      <span className="muted">
                        {e.grams === undefined ? 'Quick add' : amount(e.grams, e.unit)}
                      </span>
                    </span>
                    <span className="entry-kcal">{kcal(e.nutrition.kcal)}</span>
                    <button
                      type="button"
                      className="icon-btn icon-btn-small"
                      aria-label={`Remove ${e.label}`}
                      onClick={() => void removeEntry(e)}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <footer className="meal-foot">
              <button
                type="button"
                className="link-btn"
                aria-label={`Add food to ${MEAL_LABELS[slot]}`}
                onClick={() => {
                  setForMeal(slot);
                  setOpen({ kind: 'search' });
                }}
              >
                Add food
              </button>
              {savable >= 2 && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setOpen({ kind: 'save-meal', meal: slot })}
                >
                  Save as a meal
                </button>
              )}
            </footer>
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
          defaultMeal={forMeal ?? mealNow}
          onClose={close}
          onLog={(food, g, meal, fav, unit) => {
            close();
            void logFood(food, g, meal, fav, unit);
          }}
        />
      )}
      {open.kind === 'quick' && (
        <QuickAddSheet
          defaultMeal={forMeal ?? mealNow}
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
              {target.note === 'floor' && ' (raised to a safe minimum)'}
              {target.note === 'override' && ' (your own)'}
              {target.note === 'macros' && ' (from your macros)'}.
            </p>
          )}
          <ProfileForm
            initial={profile}
            defaults={defaults ?? undefined}
            initialWeightKg={weightKg}
            {...(fromLogs ? { fromLogs } : {})}
            onSaved={close}
            onCancel={close}
          />
          <AccountPanel />
          <BackupPanel
            onRestored={(text) => {
              close();
              say(text);
            }}
          />
          <Credits />
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
