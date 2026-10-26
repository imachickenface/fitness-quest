import '../index.css';
import { drawMap, MAP, TILE } from './map.ts';
import { drawGrid, heroGrid, SIZE, type Avatar } from './sprite.ts';

const root = document.getElementById('mock')!;
root.style.cssText =
  'display:flex;gap:40px;padding:24px;align-items:flex-start;font-family:var(--pixel)';

const base: Avatar = { skin: 1, hair: 'short', hairColour: 1, outfit: 1, accessory: 'none' };
const S = 3;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx] as const;
}

// 5 x 5 body grid: muscle across, build down
const cell = SIZE * S + 12;
const [gridC, g] = canvas(cell * 5 + 70, cell * 5 + 40);
g.fillStyle = '#b9b6c9';
g.font = '14px "Pixelify Sans Variable", sans-serif';
for (let m = 0; m < 5; m++) g.fillText(`muscle ${m}`, 70 + m * cell + 12, 20);
for (let b = 2; b >= -2; b--) {
  const r = 2 - b;
  g.fillStyle = '#b9b6c9';
  g.fillText(`build ${b > 0 ? '+' : ''}${b}`, 0, 40 + r * cell + cell / 2);
  for (let m = 0; m < 5; m++)
    drawGrid(g, heroGrid(base, { muscle: m, build: b }), 70 + m * cell, 30 + r * cell, S);
}

// customisation sets at a normal body
const looks: Avatar[] = [
  { skin: 0, hair: 'spiky', hairColour: 3, outfit: 0, accessory: 'headband' },
  { skin: 3, hair: 'long', hairColour: 0, outfit: 3, accessory: 'cape' },
  { skin: 5, hair: 'bun', hairColour: 3, outfit: 2, accessory: 'none' },
  { skin: 2, hair: 'buzz', hairColour: 4, outfit: 4, accessory: 'crown' },
];
const [lookC, l] = canvas(cell * 4, cell + 10);
looks.forEach((a, i) => drawGrid(l, heroGrid(a, { muscle: 2, build: 0 }), i * cell, 5, S));

// the map with the hero on node 3
const MS = 2;
const [mapC, mctx] = canvas(MAP[0]!.length * TILE * MS, MAP.length * TILE * MS);
drawMap(mctx, MS, 2, heroGrid(base, { muscle: 2, build: 0 }));

const left = document.createElement('div');
const h = (t: string) =>
  Object.assign(document.createElement('h2'), { textContent: t, style: 'margin:16px 0 8px' });
left.append(h('Body: muscle x build'), gridC, h('Looks (muscle 2)'), lookC);
const right = document.createElement('div');
right.append(h('Map (hero on quest 3)'), mapC);
root.append(left, right);
