import { useEffect, useState } from 'react';
import type { HeroId, HeroLook } from '../contract.ts';
import { DEFAULT_HERO } from './hero/heroNames.ts';

type Props = {
  hero: HeroId | undefined;
  look: HeroLook | undefined;
  /** CSS px */
  size: number;
  /** who it is, for screen readers; leave out when a name is next to it */
  label?: string;
};

/** A friend's (or your own) hero as a round portrait. Shows a plain circle until the picture is drawn. */
export function HeroAvatar({ hero, look, size, label }: Props) {
  const [src, setSrc] = useState<{ key: string; url: string } | undefined>();
  const key = JSON.stringify([hero ?? DEFAULT_HERO, look ?? {}]);

  useEffect(() => {
    let live = true;
    void import('./hero/portrait.ts')
      .then(({ portrait }) => portrait(hero ?? DEFAULT_HERO, look ?? {}))
      .then((url) => live && setSrc({ key, url }))
      .catch(() => undefined); // no WebGL: the circle stays
    return () => {
      live = false;
    };
    // `key` covers hero and look
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const url = src?.key === key ? src.url : undefined;
  return (
    <span
      className="hero-avatar"
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {url && <img src={url} alt="" width={size} height={size} />}
    </span>
  );
}
