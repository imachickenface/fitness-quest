import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cheer } from './hero/heroScene.ts';
import type { Profile } from '../contract.ts';
import { Icon, type IconName } from './Icon.tsx';
import { Quests } from './Quests.tsx';
import { Friends } from './social/Friends.tsx';
import {
  useMySummary,
  usePublish,
  usePublishActivity,
  usePublishProgress,
} from './social/useMySummary.ts';
import { QuestBanner, type Finished } from './QuestBanner.tsx';
import { Toast, type ToastMessage } from './Toast.tsx';
import { Today } from './Today.tsx';
import { Train } from './Train.tsx';
import { updateSettings } from '../db/db.ts';
import { useDb } from './dbContext.ts';
import { useGame } from './useGame.ts';

type Tab = 'today' | 'train' | 'quests' | 'friends';

const TABS: [Tab, string, IconName][] = [
  ['today', 'Food', 'apple'],
  ['train', 'Train', 'dumbbell'],
  ['quests', 'Quests', 'shield'],
  ['friends', 'Friends', 'friends'],
];

export function Shell({ profile }: { profile: Profile }) {
  // the app opens on the hero and today's quests
  const [tab, setTab] = useState<Tab>('quests');
  const game = useGame(profile);
  const db = useDb();
  const { me, liftChoices } = useMySummary(profile, game);
  usePublish(me);
  usePublishProgress(game);
  usePublishActivity(profile, game);

  // Ask the browser not to clear our storage when space runs low (Chrome decides without a prompt).
  useEffect(() => {
    const storage = navigator.storage as StorageManager | undefined;
    if (!storage?.persist) return;
    void storage
      .persisted()
      .then((already) => already || storage.persist())
      .then((storagePersisted) => updateSettings(db, { storagePersisted }))
      .catch(() => undefined);
  }, [db]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const say = useCallback((text: string, undo?: () => void) => {
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, text, undo }));
  }, []);

  // Celebrate quests completed and levels reached while the app is open (not ones from before).
  const seen = useRef<{ open: Set<string>; level: number } | null>(null);
  const [cheer, setCheer] = useState<{ n: number; clip: Cheer } | undefined>(undefined);
  const [finished, setFinished] = useState<Finished[]>([]);
  const nextBanner = useCallback(() => setFinished((queue) => queue.slice(1)), []);
  useEffect(() => {
    if (!game) return;
    const unfinished = game.active.filter((v) => !v.progress.complete).map((v) => v.quest.id);
    const before = seen.current;
    seen.current = { open: new Set(unfinished), level: game.state.level };
    if (!before) return;
    // each quest seen open that is now finished gets the banner in turn (one that arrives already
    // finished, like "Step on the scale" after the first weigh-in, does not); the hero walks on and cheers
    const fresh = game.active.filter((v) => v.progress.complete && before.open.has(v.quest.id));
    if (fresh.length > 0) {
      setFinished((queue) => [
        ...queue,
        ...fresh.map((v, i) => ({
          key: Date.now() + i,
          title: v.quest.title,
          xp: v.quest.xp,
        })),
      ]);
    }
    // the level only rises when XP is claimed, on the Quests tab
    if (game.state.level > before.level) {
      say(`Level up! You reached level ${game.state.level}`);
      setCheer((c) => ({ n: (c?.n ?? 0) + 1, clip: 'jump' }));
    }
  }, [game, say]);

  const open = game?.active.filter((v) => !v.progress.complete).length ?? 0;

  return (
    <>
      <main className="app-main">
        {tab === 'today' && <Today profile={profile} streakDays={game?.state.streakDays} />}
        {tab === 'train' && <Train profile={profile} say={say} />}
        {tab === 'quests' && game && <Quests game={game} profile={profile} cheer={cheer} />}
        {tab === 'friends' && (
          <Friends profile={profile} me={me} liftChoices={liftChoices} records={game?.records} />
        )}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            className="tab"
            aria-current={tab === value ? 'page' : undefined}
            onClick={() => setTab(value)}
          >
            <Icon name={icon} size={26} />
            {label}
            {value === 'quests' && open > 0 && (
              <span className="tab-badge" aria-label={`${open} open`}>
                {open}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="top-stack">
        <QuestBanner item={finished[0]} onDone={nextBanner} onOpen={() => setTab('quests')} />
        <Toast toast={toast} onDone={clearToast} className="toast-top toast-stacked" />
      </div>
    </>
  );
}
