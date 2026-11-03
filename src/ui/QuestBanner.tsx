import { useEffect, useState } from 'react';
import { Icon } from './Icon.tsx';

/** A quest that was just finished, waiting for its turn in the banner. */
export type Finished = { key: number; title: string; xp: number };

const SHOW_MS = 4500;

type Props = { item: Finished | undefined; onDone: () => void; onOpen: () => void };

/**
 * The quest-complete banner at the top of the screen: a bar fills up, the chest gets its tick, and it fades
 * after a few seconds. Tapping it opens the Quests tab.
 */
export function QuestBanner({ item, onDone, onOpen }: Props) {
  return (
    <div className="banner-slot" role="status" aria-live="polite">
      {item && <Banner key={item.key} item={item} onDone={onDone} onOpen={onOpen} />}
    </div>
  );
}

/** One banner; it stays while it has keyboard focus, so it can be read and used without a race. */
function Banner({ item, onDone, onOpen }: Props & { item: Finished }) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held) return;
    const t = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(t);
  }, [held, onDone]);

  return (
    <button
      type="button"
      className={held ? 'quest-banner held' : 'quest-banner'}
      onClick={() => {
        onOpen();
        onDone();
      }}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <span className="banner-chest" aria-hidden="true">
        <Icon name="chest" size={30} />
        <span className="banner-tick">
          <Icon name="check" size={14} />
        </span>
      </span>
      <span className="banner-text">
        <small>Quest complete</small>
        <strong>{item.title}</strong>
        <span className="bar banner-bar" aria-hidden="true">
          <span className="bar-fill" />
        </span>
      </span>
      <span className="banner-xp">
        +{item.xp} XP
        <small>Tap to claim</small>
      </span>
    </button>
  );
}
