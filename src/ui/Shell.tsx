import { useCallback, useEffect, useRef, useState } from 'react';
import type { Profile } from '../contract.ts';
import { Quests } from './Quests.tsx';
import { Toast, type ToastMessage } from './Toast.tsx';
import { Today } from './Today.tsx';
import { Train } from './Train.tsx';
import { useGame } from './useGame.ts';

type Tab = 'today' | 'train' | 'quests';

const TABS: [Tab, string][] = [
  ['today', 'Food'],
  ['train', 'Train'],
  ['quests', 'Quests'],
];

export function Shell({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<Tab>('today');
  const game = useGame(profile);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const say = useCallback((text: string, undo?: () => void) => {
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, text, undo }));
  }, []);

  // Celebrate quests completed and levels reached while the app is open (not ones from before).
  const seen = useRef<{ done: Set<string>; level: number } | null>(null);
  useEffect(() => {
    if (!game) return;
    const done = new Set(game.state.completedQuestIds);
    const before = seen.current;
    seen.current = { done, level: game.state.level };
    if (!before) return;
    const fresh = game.active.filter((v) => v.progress.complete && !before.done.has(v.quest.id));
    if (game.state.level > before.level) say(`Level up! You reached level ${game.state.level}`);
    else if (fresh[0]) say(`Quest complete: ${fresh[0].quest.title} +${fresh[0].quest.xp} XP`);
  }, [game, say]);

  const open = game?.active.filter((v) => !v.progress.complete).length ?? 0;

  return (
    <>
      <main className="app-main">
        {tab === 'today' && <Today profile={profile} />}
        {tab === 'train' && <Train say={say} />}
        {tab === 'quests' && game && <Quests game={game} />}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="tab"
            aria-current={tab === value ? 'page' : undefined}
            onClick={() => setTab(value)}
          >
            {label}
            {value === 'quests' && open > 0 && (
              <span className="tab-badge" aria-label={`${open} open`}>
                {open}
              </span>
            )}
          </button>
        ))}
      </nav>
      <Toast toast={toast} onDone={clearToast} className="toast-top" />
    </>
  );
}
