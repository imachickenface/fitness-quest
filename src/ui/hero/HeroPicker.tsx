import { HERO_IDS, type HeroId } from '../../contract.ts';
import { Sheet } from '../Sheet.tsx';
import { HERO_NAMES } from './heroNames.ts';

type Props = { current: HeroId; onPick: (id: HeroId) => void; onClose: () => void };

export function HeroPicker({ current, onPick, onClose }: Props) {
  return (
    <Sheet title="Choose your hero" onClose={onClose}>
      <p className="muted">Your hero's body changes with how you train and eat.</p>
      <ul className="hero-grid">
        {HERO_IDS.map((id) => (
          <li key={id}>
            <button
              type="button"
              className="hero-option"
              aria-pressed={id === current}
              aria-label={HERO_NAMES[id]}
              onClick={() => onPick(id)}
            >
              <img
                src={`${import.meta.env.BASE_URL}hero/${id}.png`}
                alt=""
                width={80}
                height={80}
              />
            </button>
          </li>
        ))}
      </ul>
      <p className="fine-print">Characters: Kenney Mini Characters (CC0).</p>
    </Sheet>
  );
}
