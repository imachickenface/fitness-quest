import { useEffect, useState } from 'react';
import type { CharacterId } from '../../contract.ts';
import { loadCharacter } from '../../scene/character.ts';
import { portraitUrl } from '../../scene/portrait.ts';
import { CHARACTER_BASE, characterList } from './characters.ts';

const portraits = new Map<string, Promise<string>>();

/** One portrait per character, drawn once and shared by every avatar on the screen. */
function portraitOf(id: CharacterId): Promise<string> {
  let p = portraits.get(id);
  if (!p) {
    p = characterList()
      .then((list) => {
        const entry = list.find((c) => c.id === id) ?? list[0];
        if (!entry) throw new Error('no characters');
        return loadCharacter(CHARACTER_BASE, entry);
      })
      .then((sprite) => portraitUrl(sprite));
    p.catch(() => portraits.delete(id)); // try again next time
    portraits.set(id, p);
  }
  return p;
}

type Props = {
  /** absent = the first character, as in the scene */
  character: CharacterId | undefined;
  /** CSS px */
  size: number;
  /** who it is, for screen readers; leave out when a name is next to it */
  label?: string;
};

/** A player's pixel character as a round portrait. Shows a plain circle until the picture is drawn. */
export function CharacterAvatar({ character, size, label }: Props) {
  const id = character ?? 'jacket';
  const [src, setSrc] = useState<{ id: string; url: string } | undefined>();

  useEffect(() => {
    let live = true;
    portraitOf(id).then(
      (url) => live && setSrc({ id, url }),
      () => undefined, // no canvas or the sprite didn't load: the circle stays
    );
    return () => {
      live = false;
    };
  }, [id]);

  const url = src?.id === id ? src.url : undefined;
  return (
    <span
      className="character-avatar"
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {url && <img src={url} alt="" width={size} height={size} />}
    </span>
  );
}
