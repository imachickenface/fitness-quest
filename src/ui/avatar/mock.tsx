import { Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { Avatar, DEFAULT_LOOK, type Look } from './Avatar.tsx';

const looks: [string, Look][] = [
  [
    'Cap + track jacket',
    { skin: 1, hair: 'short', hairColour: 1, outfit: 'track', outfitColour: 1, headgear: 'cap' },
  ],
  [
    'Knight (level 10)',
    { skin: 2, hair: 'short', hairColour: 0, outfit: 'armor', outfitColour: 0, headgear: 'helmet' },
  ],
  [
    'Tank + bun',
    { skin: 4, hair: 'bun', hairColour: 5, outfit: 'tank', outfitColour: 2, headgear: 'none' },
  ],
  [
    'Long hair + headband',
    { skin: 0, hair: 'long', hairColour: 3, outfit: 'tee', outfitColour: 3, headgear: 'headband' },
  ],
  [
    'Spiky + crown',
    { skin: 3, hair: 'spiky', hairColour: 4, outfit: 'tee', outfitColour: 4, headgear: 'crown' },
  ],
  [
    'Buzz',
    { skin: 5, hair: 'buzz', hairColour: 5, outfit: 'tank', outfitColour: 5, headgear: 'none' },
  ],
];

function Mock() {
  const cell = {
    display: 'grid',
    justifyItems: 'center',
    fontSize: 12,
    color: 'var(--muted)',
  } as const;
  return (
    <div style={{ display: 'flex', gap: 40, padding: 24, alignItems: 'flex-start' }}>
      <div>
        <h2>Body: muscle across, build down</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '60px repeat(5, 110px)',
            gap: 4,
            marginTop: 8,
          }}
        >
          <span />
          {[0, 1, 2, 3, 4].map((m) => (
            <span key={m} style={cell}>
              muscle {m}
            </span>
          ))}
          {[2, 1, 0, -1, -2].map((b) => (
            <Fragment key={b}>
              <span style={{ ...cell, alignSelf: 'center' }}>build {b > 0 ? `+${b}` : b}</span>
              {[0, 1, 2, 3, 4].map((m) => (
                <Avatar
                  key={`${b}${m}`}
                  look={DEFAULT_LOOK}
                  body={{ muscle: m, build: b }}
                  size={104}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
      <div>
        <h2>Looks (muscle 2)</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 150px)',
            gap: 12,
            marginTop: 8,
          }}
        >
          {looks.map(([name, look]) => (
            <div key={name} style={cell}>
              <Avatar look={look} body={{ muscle: 2, build: 0 }} size={140} />
              {name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('mock')!).render(<Mock />);
