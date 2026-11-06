import { useEffect, useState } from 'react';
import { CharacterId, type CharacterId as Id } from '../../contract.ts';
import type { CharacterEntry } from '../../scene/character.ts';
import { Sheet } from '../Sheet.tsx';
import { CHARACTER_BASE, characterList } from './characters.ts';

type Props = { current: Id; onPick: (id: Id) => void; onClose: () => void };

/** How big each character is drawn in the picker: whole art pixels, so it stays crisp. */
const ZOOM = 3;
/** Width shown of each frame: the standing figure, without the room the walk cycle needs either side. */
const SHOWN = 34;

export function CharacterPicker({ current, onPick, onClose }: Props) {
  const [chars, setChars] = useState<CharacterEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    characterList().then(
      (list) => !cancelled && setChars(list),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Sheet title="Choose your character" onClose={onClose}>
      <ul className="character-grid">
        {chars.map((c) => {
          const parsed = CharacterId.safeParse(c.id);
          if (!parsed.success) return null;
          const id = parsed.data;
          return (
            <li key={id}>
              <button
                type="button"
                className="character-option"
                aria-pressed={id === current}
                onClick={() => onPick(id)}
              >
                {/* the standing frame of the character's strip */}
                <span
                  className="character-sprite"
                  aria-hidden="true"
                  style={{
                    width: Math.min(SHOWN, c.frameWidth) * ZOOM,
                    height: c.frameHeight * ZOOM,
                    backgroundImage: `url(${CHARACTER_BASE}${c.src})`,
                    backgroundSize: `auto ${c.frameHeight * ZOOM}px`,
                    backgroundPosition: `-${(c.stand * c.frameWidth + Math.max(0, (c.frameWidth - SHOWN) / 2)) * ZOOM}px 0`,
                  }}
                />
                <span>{c.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
