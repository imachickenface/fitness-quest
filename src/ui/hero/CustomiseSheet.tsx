import { useState } from 'react';
import { HERO_IDS, type HeroId } from '../../contract.ts';
import { Sheet } from '../Sheet.tsx';
import { HERO_NAMES } from './heroNames.ts';
import type { Look } from './heroScene.ts';
import { CELL_COLOURS, choicesFor } from './palette.ts';

type Props = {
  hero: HeroId;
  look: Look;
  /** palette cells the hero uses, most used first */
  cells: number[];
  onChange: (look: Look) => void;
  onClose: () => void;
};

const SLOTS = 6;

/** Another character's head, and up to six of the hero's colours swapped for other palette colours. */
export function CustomiseSheet({ hero, look, cells, onChange, onClose }: Props) {
  const [slot, setSlot] = useState<number | null>(null);
  const colours = look.colours ?? {};
  const shown = cells.slice(0, SLOTS);
  const current = (cell: number) => colours[String(cell)] ?? cell;

  return (
    <Sheet title="Customise your hero" onClose={onClose}>
      <fieldset className="custom-group">
        <legend>Head</legend>
        <ul className="head-grid">
          {HERO_IDS.map((id) => (
            <li key={id}>
              <button
                type="button"
                className="hero-option head-option"
                aria-pressed={(look.head ?? hero) === id}
                aria-label={`Head: ${HERO_NAMES[id]}`}
                onClick={() => onChange({ ...look, head: id === hero ? undefined : id })}
              >
                <img
                  src={`${import.meta.env.BASE_URL}hero/${id}.png`}
                  alt=""
                  width={56}
                  height={56}
                />
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="custom-group">
        <legend>Colours</legend>
        {shown.length === 0 ? (
          <p className="muted">Loading your hero's colours...</p>
        ) : (
          <ul className="swatch-row">
            {shown.map((cell, i) => (
              <li key={cell}>
                <button
                  type="button"
                  className="swatch"
                  aria-pressed={slot === cell}
                  aria-label={`Colour ${i + 1}`}
                  style={{ background: CELL_COLOURS[current(cell)] }}
                  onClick={() => setSlot(slot === cell ? null : cell)}
                />
              </li>
            ))}
          </ul>
        )}
        {slot !== null && (
          <ul className="swatch-row choices" aria-label="Pick a colour">
            {choicesFor(slot).map((c) => (
              <li key={c}>
                <button
                  type="button"
                  className="swatch"
                  aria-pressed={current(slot) === c}
                  aria-label={`Use colour ${c}`}
                  style={{ background: CELL_COLOURS[c] }}
                  onClick={() => {
                    const next = { ...colours };
                    if (c === slot) delete next[String(slot)];
                    else next[String(slot)] = c;
                    onChange({ ...look, colours: next });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => onChange({})}>
          Reset
        </button>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
