import { useState } from 'react';
import type { TitleId } from '../../contract.ts';
import { TITLES } from '../../core/social/titles.ts';
import { Sheet } from '../Sheet.tsx';

const badgeSrc = (id: TitleId) => `${import.meta.env.BASE_URL}badges/${id}.webp`;

/** A badge picture on its own, for places that handle the tap themselves (the profile editor). */
export function BadgeImage({ id, size, locked }: { id: TitleId; size: number; locked?: boolean }) {
  return (
    <img
      className={locked ? 'badge-img locked' : 'badge-img'}
      src={badgeSrc(id)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  );
}

/** A badge you can tap to see its name and how it's earned. */
export function Badge({
  id,
  size,
  locked,
  owner,
}: {
  id: TitleId;
  size: number;
  /** shown greyed, as one still to earn */
  locked?: boolean;
  /** whose badge it is, for the sheet's wording; leave out for your own */
  owner?: string;
}) {
  const [open, setOpen] = useState(false);
  const t = TITLES[id];
  return (
    <>
      <button
        type="button"
        className="badge-btn"
        aria-label={`${t.name}${locked ? ' (locked)' : ''}: show what it is`}
        onClick={() => setOpen(true)}
      >
        <BadgeImage id={id} size={size} {...(locked ? { locked } : {})} />
      </button>
      {open && (
        <BadgeSheet id={id} locked={locked === true} owner={owner} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function BadgeSheet({
  id,
  locked,
  owner,
  onClose,
}: {
  id: TitleId;
  locked: boolean;
  owner: string | undefined;
  onClose: () => void;
}) {
  const t = TITLES[id];
  return (
    <Sheet title={t.name} onClose={onClose}>
      <div className="badge-info">
        <BadgeImage id={id} size={128} />
        <p className="badge-how">{t.how}</p>
        <p className="muted">
          {locked
            ? 'Not earned yet.'
            : owner
              ? `${owner} has earned this badge.`
              : "You've earned this badge."}
        </p>
      </div>
    </Sheet>
  );
}
