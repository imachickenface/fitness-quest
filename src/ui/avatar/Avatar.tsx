import { useId } from 'react';

/**
 * The hero: a rounded, soft-shaded character drawn as SVG. Everything is a parameter, so any look works with
 * any body. Muscle (0-4) and build (-2 under-fuelled .. +2 over-fuelled) reshape the body; the look picks
 * skin, hair, outfit and gear.
 */

export const SKINS = ['#ffdcc2', '#f3c19c', '#d9965f', '#b06d3f', '#8a4f2c', '#5c3420'] as const;
export const HAIR_COLOURS = [
  '#3b2a20',
  '#6e4127',
  '#a8662f',
  '#e8c060',
  '#d4553a',
  '#2b2b33',
] as const;
export const OUTFIT_COLOURS = [
  '#1f8ef1',
  '#e5484d',
  '#46c21b',
  '#8e5cd9',
  '#ff9600',
  '#2b3a42',
] as const;
export const HAIRS = ['short', 'spiky', 'long', 'bun', 'buzz'] as const;
export const OUTFITS = ['tee', 'tank', 'track', 'armor'] as const;
export const HEADGEAR = ['none', 'cap', 'headband', 'helmet', 'crown'] as const;

export type Look = {
  skin: number;
  hair: (typeof HAIRS)[number];
  hairColour: number;
  outfit: (typeof OUTFITS)[number];
  outfitColour: number;
  headgear: (typeof HEADGEAR)[number];
};

export type Body = { muscle: number; build: number };

export const DEFAULT_LOOK: Look = {
  skin: 1,
  hair: 'short',
  hairColour: 1,
  outfit: 'tee',
  outfitColour: 0,
  headgear: 'none',
};

const INK = '#2b2b38';
const SHORTS = '#2f3e75';
const STEEL = '#c9d1dc';

type Props = { look: Look; body: Body; size?: number; label?: string };

export function Avatar({ look, body, size = 160, label }: Props) {
  const id = useId().replace(/:/g, '');
  const m = clamp(Math.round(body.muscle), 0, 4);
  const b = clamp(Math.round(body.build), -2, 2);

  const pale = b < 0 ? (b === -1 ? 0.2 : 0.38) : 0;
  const skin = mix(SKINS[look.skin] ?? SKINS[1], '#a7adb5', pale);
  const skinShade = mix(skin, '#7a3b1e', 0.22);
  const hair = HAIR_COLOURS[look.hairColour] ?? HAIR_COLOURS[0];
  const cloth = OUTFIT_COLOURS[look.outfitColour] ?? OUTFIT_COLOURS[0];
  const clothShade = mix(cloth, '#000000', 0.22);

  const cx = 100;
  const hy = 86 + (b <= -2 ? 6 : 0); // a slump when badly under-fuelled
  const hrx = 56 + (b === 2 ? 4 : 0);
  const hry = 52;
  const T = 146; // shoulders
  const W = 222; // waist
  const sh = 34 + m * 5 + (b > 0 ? b * 2 : 0) + (b < 0 ? b * 3 : 0);
  const wa = 30 - (m >= 3 ? 3 : 0) - (m >= 4 ? 2 : 0) + (b > 0 ? b * 9 : 0) + (b < 0 ? b * 4 : 0);
  const belly = b > 0 ? b * 9 : 0;
  const arm = 16 + m * 3 + (b > 0 ? b * 3 : 0) + (b < 0 ? b * 3 : 0);
  const leg = 10 + (m >= 2 ? 2 : 0) + (b > 0 ? b * 3 : 0) + (b < 0 ? -2 : 0);
  const legX = Math.max(wa * 0.55, 15);

  const g = (name: string) => `url(#${id}-${name})`;
  const torso = `M ${cx - sh + 12} ${T} L ${cx + sh - 12} ${T} Q ${cx + sh} ${T} ${cx + sh} ${T + 14}
    C ${cx + sh} ${T + 40} ${cx + wa + belly} ${T + 52} ${cx + wa} ${W} L ${cx - wa} ${W}
    C ${cx - wa - belly} ${T + 52} ${cx - sh} ${T + 40} ${cx - sh} ${T + 14} Q ${cx - sh} ${T} ${cx - sh + 12} ${T} Z`;
  const longSleeves = look.outfit === 'track';
  const sleeves = look.outfit === 'tee' || look.outfit === 'armor';
  const legColour = longSleeves ? cloth : skin;

  return (
    <svg
      viewBox="-15 0 230 300"
      width={size}
      height={(size * 300) / 230}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="avatar"
    >
      <defs>
        <radialGradient id={`${id}-skin`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor={mix(skin, '#ffffff', 0.35)} />
          <stop offset="0.55" stopColor={skin} />
          <stop offset="1" stopColor={skinShade} />
        </radialGradient>
        <linearGradient id={`${id}-cloth`} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor={mix(cloth, '#ffffff', 0.25)} />
          <stop offset="0.6" stopColor={cloth} />
          <stop offset="1" stopColor={clothShade} />
        </linearGradient>
        <linearGradient id={`${id}-hair`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={mix(hair, '#ffffff', 0.25)} />
          <stop offset="1" stopColor={mix(hair, '#000000', 0.2)} />
        </linearGradient>
        <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor={STEEL} />
          <stop offset="1" stopColor="#7f8a99" />
        </linearGradient>
        <radialGradient id={`${id}-shadow`}>
          <stop offset="0" stopColor="#000000" stopOpacity="0.18" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx={cx} cy={288} rx={58} ry={9} fill={g('shadow')} />

      {/* long hair falls behind the body */}
      {look.hair === 'long' && look.headgear !== 'helmet' && (
        <path
          d={`M ${cx - hrx + 2} ${hy} Q ${cx - hrx - 6} ${hy + 70} ${cx - 38} ${hy + 92} L ${cx + 38} ${hy + 92} Q ${cx + hrx + 6} ${hy + 70} ${cx + hrx - 2} ${hy} Z`}
          fill={g('hair')}
        />
      )}

      {/* legs, then shoes */}
      {[-1, 1].map((s) => (
        <g key={s}>
          <rect
            x={cx + s * legX - leg}
            y={W + 10}
            width={leg * 2}
            height={52}
            rx={leg}
            fill={legColour === skin ? g('skin') : g('cloth')}
          />
          <rect
            x={cx + s * legX - leg - 7}
            y={262}
            width={leg * 2 + 14}
            height={22}
            rx={11}
            fill="#f4f6f8"
          />
          <rect
            x={cx + s * legX - leg - 7}
            y={276}
            width={leg * 2 + 14}
            height={8}
            rx={4}
            fill="#c5ccd6"
          />
          <rect x={cx + s * legX - leg} y={268} width={leg * 2} height={4} rx={2} fill={cloth} />
        </g>
      ))}

      {/* shorts (or the track trousers' top) */}
      <rect
        x={cx - wa - 3}
        y={W - 6}
        width={(wa + 3) * 2}
        height={34}
        rx={12}
        fill={longSleeves ? g('cloth') : SHORTS}
      />
      <rect
        x={cx - 1.5}
        y={W + 12}
        width={3}
        height={16}
        fill={longSleeves ? clothShade : '#24305c'}
      />

      {/* arms behind the torso edge */}
      {[-1, 1].map((s) => {
        const ax = cx + s * (sh + arm / 2 - 7); // hang just outside the shoulder
        const rot = s * (-4 - (b > 0 ? b * 4 : 0) - m * 1.5); // hands out over a belly or big lats
        return (
          <g key={s} transform={`rotate(${rot} ${ax} ${T + 8})`}>
            <rect x={ax - arm / 2} y={T} width={arm} height={64} rx={arm / 2} fill={g('skin')} />
            {m >= 2 && !longSleeves && (
              <ellipse
                cx={ax}
                cy={T + 34}
                rx={arm / 2 + 1.5}
                ry={9 + m}
                fill={mix(skin, '#ffffff', 0.12)}
              />
            )}
            {(sleeves || longSleeves) && (
              <rect
                x={ax - arm / 2 - 2}
                y={T - 2}
                width={arm + 4}
                height={longSleeves ? 58 : 28}
                rx={(arm + 4) / 2}
                fill={g('cloth')}
              />
            )}
            {longSleeves && (
              <rect
                x={ax + s * (arm / 2 - 3) - 1.5}
                y={T + 4}
                width={3}
                height={50}
                fill="#ffffff"
                opacity={0.9}
              />
            )}
            <circle cx={ax} cy={T + 64} r={arm / 2 + 3} fill={g('skin')} />
          </g>
        );
      })}

      {/* torso */}
      <path d={torso} fill={g('cloth')} />
      {look.outfit === 'tank' && (
        <path d={`M ${cx - 16} ${T} Q ${cx} ${T + 22} ${cx + 16} ${T} Z`} fill={g('skin')} />
      )}
      {look.outfit === 'tee' && (
        <path
          d={`M ${cx - 14} ${T} Q ${cx} ${T + 14} ${cx + 14} ${T}`}
          fill="none"
          stroke={clothShade}
          strokeWidth={4}
        />
      )}
      {look.outfit === 'track' && (
        <>
          <path
            d={`M ${cx - 16} ${T} L ${cx} ${T + 12} L ${cx + 16} ${T}`}
            fill="none"
            stroke="#ffffff"
            strokeWidth={5}
            strokeLinejoin="round"
          />
          <rect
            x={cx - 1.5}
            y={T + 10}
            width={3}
            height={W - T - 12}
            fill="#ffffff"
            opacity={0.85}
          />
          <rect x={cx - wa} y={W - 14} width={wa * 2} height={8} rx={4} fill={clothShade} />
        </>
      )}
      {m >= 3 && look.outfit !== 'armor' && (
        <path
          d={`M ${cx - sh + 16} ${T + 30} Q ${cx - 8} ${T + 40} ${cx} ${T + 32} Q ${cx + 8} ${T + 40} ${cx + sh - 16} ${T + 30}`}
          fill="none"
          stroke={clothShade}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.6}
        />
      )}
      {b > 0 && look.outfit !== 'armor' && (
        <ellipse
          cx={cx - 6}
          cy={T + 52}
          rx={wa * 0.5}
          ry={10 + b * 3}
          fill="#ffffff"
          opacity={0.12}
        />
      )}
      {look.outfit === 'armor' && (
        <>
          <path
            d={`M ${cx - sh + 8} ${T + 4} L ${cx + sh - 8} ${T + 4} C ${cx + sh - 4} ${T + 40} ${cx + wa + belly - 4} ${T + 52} ${cx + wa - 4} ${W - 8} L ${cx - wa + 4} ${W - 8} C ${cx - wa - belly + 4} ${T + 52} ${cx - sh + 4} ${T + 40} ${cx - sh + 8} ${T + 4} Z`}
            fill={g('steel')}
            stroke="#6d7787"
            strokeWidth={2}
          />
          <path d={`M ${cx} ${T + 8} L ${cx} ${W - 12}`} stroke="#9aa4b2" strokeWidth={3} />
          {[-1, 1].map((s) => (
            <g key={s}>
              <ellipse
                cx={cx + s * (sh - 4)}
                cy={T + 8}
                rx={arm / 2 + 9}
                ry={15}
                fill={g('steel')}
                stroke="#6d7787"
                strokeWidth={2}
              />
              <circle cx={cx + s * (sh - 4)} cy={T + 8} r={3} fill="#c9a227" />
            </g>
          ))}
        </>
      )}

      {/* neck and head */}
      <rect
        x={cx - 11}
        y={hy + hry - 14}
        width={22}
        height={T - hy - hry + 18}
        rx={8}
        fill={skinShade}
      />
      {[-1, 1].map((s) => (
        <ellipse key={s} cx={cx + s * (hrx - 2)} cy={hy + 8} rx={10} ry={13} fill={g('skin')} />
      ))}
      <ellipse cx={cx} cy={hy} rx={hrx} ry={hry} fill={g('skin')} />
      {b === 2 && (
        <path
          d={`M ${cx - 24} ${hy + hry - 6} Q ${cx} ${hy + hry + 8} ${cx + 24} ${hy + hry - 6}`}
          fill="none"
          stroke={skinShade}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.6}
        />
      )}

      <Face cx={cx} hy={hy} b={b} hair={hair} skin={skin} skinShade={skinShade} />

      {look.headgear !== 'helmet' && (
        <Hair style={look.hair} cx={cx} hy={hy} rx={hrx} ry={hry} fill={g('hair')} shade={hair} />
      )}

      {look.headgear === 'cap' && (
        <>
          <path
            d={`M ${cx - hrx + 2} ${hy - 8} C ${cx - hrx + 2} ${hy - hry - 18} ${cx + hrx - 2} ${hy - hry - 18} ${cx + hrx - 2} ${hy - 8} Z`}
            fill={g('cloth')}
          />
          <ellipse cx={cx} cy={hy - 8} rx={hrx - 2} ry={10} fill={clothShade} />
          <ellipse cx={cx} cy={hy - hry - 4} rx={6} ry={4} fill={clothShade} />
        </>
      )}
      {look.headgear === 'headband' && (
        <rect
          x={cx - hrx + 2}
          y={hy - 26}
          width={(hrx - 2) * 2}
          height={12}
          rx={6}
          fill={g('cloth')}
        />
      )}
      {look.headgear === 'crown' && (
        <path
          d={`M ${cx - 30} ${hy - hry + 2} L ${cx - 34} ${hy - hry - 24} L ${cx - 15} ${hy - hry - 8} L ${cx} ${hy - hry - 30} L ${cx + 15} ${hy - hry - 8} L ${cx + 34} ${hy - hry - 24} L ${cx + 30} ${hy - hry + 2} Z`}
          fill="#ffc800"
          stroke="#d9a900"
          strokeWidth={3}
          strokeLinejoin="round"
        />
      )}
      {look.headgear === 'helmet' && (
        <>
          <path
            d={`M ${cx} ${hy - hry - 46} C ${cx + 26} ${hy - hry - 50} ${cx + 30} ${hy - hry - 20} ${cx + 8} ${hy - hry - 4} L ${cx - 6} ${hy - hry - 6} Z`}
            fill="#e5484d"
          />
          <ellipse
            cx={cx}
            cy={hy - 2}
            rx={hrx + 6}
            ry={hry + 6}
            fill={g('steel')}
            stroke="#6d7787"
            strokeWidth={2}
          />
          <rect x={cx - hrx + 6} y={hy + 1} width={(hrx - 6) * 2} height={16} rx={8} fill={INK} />
          {[-1, 1].map((s) => (
            <circle key={s} cx={cx + s * 22} cy={hy + 9} r={4} fill="#ffffff" opacity={0.9} />
          ))}
          <path d={`M ${cx} ${hy - hry - 4} L ${cx} ${hy}`} stroke="#9aa4b2" strokeWidth={4} />
        </>
      )}
    </svg>
  );
}

function Face(p: {
  cx: number;
  hy: number;
  b: number;
  hair: string;
  skin: string;
  skinShade: string;
}) {
  const { cx, hy, b } = p;
  const tired = b < 0;
  return (
    <g>
      {[-1, 1].map((s) => (
        <g key={s}>
          <ellipse cx={cx + s * 22} cy={hy + 8} rx={7.5} ry={tired ? 7 : 10} fill={INK} />
          <circle cx={cx + s * 22 + 2.5} cy={hy + 4} r={2.6} fill="#ffffff" />
          {tired && (
            <>
              <path
                d={`M ${cx + s * 22 - 9} ${hy + 4} L ${cx + s * 22 + 9} ${hy + 4}`}
                stroke={p.skin}
                strokeWidth={7}
              />
              <path
                d={`M ${cx + s * 22 - 7} ${hy + 18} Q ${cx + s * 22} ${hy + 22} ${cx + s * 22 + 7} ${hy + 18}`}
                fill="none"
                stroke={p.skinShade}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            </>
          )}
          <path
            d={`M ${cx + s * 22 - 8} ${hy - 9 + (tired ? 3 : 0)} Q ${cx + s * 22} ${hy - 14} ${cx + s * 22 + 8} ${hy - 9}`}
            fill="none"
            stroke={p.hair}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <ellipse
            cx={cx + s * 36}
            cy={hy + 24}
            rx={b === 2 ? 11 : 8}
            ry={b === 2 ? 7 : 5}
            fill="#ff7a7a"
            opacity={tired ? 0 : 0.3}
          />
        </g>
      ))}
      <ellipse cx={cx} cy={hy + 19} rx={4} ry={3} fill={p.skinShade} opacity={0.7} />
      {tired ? (
        <path
          d={`M ${cx - 8} ${hy + 32} Q ${cx} ${hy + 29} ${cx + 8} ${hy + 32}`}
          fill="none"
          stroke={INK}
          strokeWidth={3}
          strokeLinecap="round"
        />
      ) : (
        <path
          d={`M ${cx - 10} ${hy + 28} Q ${cx} ${hy + 38} ${cx + 10} ${hy + 28}`}
          fill="none"
          stroke={INK}
          strokeWidth={3}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

function Hair(p: {
  style: Look['hair'];
  cx: number;
  hy: number;
  rx: number;
  ry: number;
  fill: string;
  shade: string;
}) {
  const { cx, hy, rx, ry } = p;
  const top = hy - ry;
  switch (p.style) {
    case 'buzz':
      return (
        <path
          d={`M ${cx - rx + 3} ${hy - 10} C ${cx - rx + 4} ${top - 6} ${cx + rx - 4} ${top - 6} ${cx + rx - 3} ${hy - 10} Q ${cx} ${hy - 30} ${cx - rx + 3} ${hy - 10} Z`}
          fill={p.fill}
        />
      );
    case 'spiky':
      return (
        <path
          d={`M ${cx - rx} ${hy + 6} C ${cx - rx - 4} ${hy - 30} ${cx - rx + 10} ${top - 4} ${cx - 34} ${top - 6} L ${cx - 30} ${top - 22} L ${cx - 14} ${top - 6} L ${cx - 6} ${top - 26} L ${cx + 8} ${top - 6} L ${cx + 22} ${top - 22} L ${cx + 28} ${top - 4} L ${cx + 44} ${top - 12} C ${cx + rx + 4} ${hy - 30} ${cx + rx} ${hy - 4} ${cx + rx} ${hy + 6} L ${cx + rx - 6} ${hy - 12} Q ${cx} ${hy - 24} ${cx - rx + 6} ${hy - 12} Z`}
          fill={p.fill}
        />
      );
    case 'bun':
      return (
        <>
          <circle cx={cx} cy={top - 10} r={18} fill={p.fill} />
          <path
            d={`M ${cx - rx} ${hy + 4} C ${cx - rx - 2} ${top - 10} ${cx + rx + 2} ${top - 10} ${cx + rx} ${hy + 4} L ${cx + rx - 6} ${hy - 14} Q ${cx} ${hy - 28} ${cx - rx + 6} ${hy - 14} Z`}
            fill={p.fill}
          />
        </>
      );
    case 'long':
      return (
        <path
          d={`M ${cx - rx - 2} ${hy + 30} C ${cx - rx - 8} ${top - 12} ${cx + rx + 8} ${top - 12} ${cx + rx + 2} ${hy + 30} L ${cx + rx - 8} ${hy - 6} Q ${cx + 18} ${hy - 30} ${cx} ${hy - 24} Q ${cx - 18} ${hy - 30} ${cx - rx + 8} ${hy - 6} Z`}
          fill={p.fill}
        />
      );
    case 'short':
    default:
      return (
        <path
          d={`M ${cx - rx + 1} ${hy + 4} C ${cx - rx - 4} ${top - 14} ${cx + rx + 4} ${top - 14} ${cx + rx - 1} ${hy + 4} L ${cx + rx - 8} ${hy - 16} Q ${cx + 6} ${hy - 34} ${cx - 22} ${hy - 18} Q ${cx - 36} ${hy - 10} ${cx - rx + 6} ${hy + 2} Z`}
          fill={p.fill}
        />
      );
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function mix(a: string, b: string, t: number): string {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i]! - v) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
