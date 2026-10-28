import { useCallback, useEffect, useState } from 'react';
import { encode } from 'uqr';
import {
  cancelInvite,
  createInvite,
  inviteLink,
  listInvites,
  type Invite,
} from '../../sync/social.ts';
import { getClient } from '../../sync/supabase.ts';

/** A QR code drawn as one SVG path from uqr's matrix (no HTML strings). */
function QrCode({ text, label }: { text: string; label: string }) {
  const { data, size } = encode(text, { border: 2, ecc: 'M' });
  let d = '';
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg
      className="qr"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

const until = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** Invite friends with a link or a QR code; lists the live links so they can be cancelled. */
export function Invites() {
  const [invites, setInvites] = useState<Invite[] | undefined>();
  const [shown, setShown] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setInvites(await listInvites(await getClient()));
    } catch {
      setInvites([]);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function make() {
    setBusy(true);
    setMessage(undefined);
    try {
      const token = await createInvite(await getClient());
      if (!token) setMessage('You have 5 invite links already. Cancel one to make another.');
      else setShown(token);
      await load();
    } catch {
      setMessage(
        navigator.onLine ? "Couldn't make a link. Try again." : "You're offline. Try again later.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function share(token: string) {
    const url = inviteLink(token);
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Fitness Quest',
          text: 'Be my friend on Fitness Quest',
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setMessage('Link copied.');
      }
    } catch {
      // the person closed the share sheet
    }
  }

  async function cancel(token: string) {
    await cancelInvite(await getClient(), token);
    if (shown === token) setShown(undefined);
    await load();
  }

  return (
    <section className="panel invites" aria-label="Invite with a link">
      <h2>Invite with a link</h2>
      <p className="muted">
        Anyone who opens your link in the next 7 days becomes your friend, so share it only with
        people you know. Or let them scan the code with their phone's camera.
      </p>
      {shown && (
        <div className="invite-shown">
          <QrCode text={inviteLink(shown)} label="QR code of your invite link" />
          <p className="invite-link">{inviteLink(shown)}</p>
          <button type="button" className="btn btn-primary" onClick={() => void share(shown)}>
            {typeof navigator.share === 'function' ? 'Share link' : 'Copy link'}
          </button>
        </div>
      )}
      {!shown && (
        <button type="button" className="btn" disabled={busy} onClick={() => void make()}>
          Make an invite link
        </button>
      )}
      {message && (
        <p className="muted" role="status">
          {message}
        </p>
      )}
      {invites && invites.length > 0 && (
        <ul className="entry-list invite-list" aria-label="Your live invite links">
          {invites.map((i) => (
            <li key={i.token} className="entry">
              <button type="button" className="link-btn" onClick={() => setShown(i.token)}>
                Link …{i.token.slice(-4)}
              </button>
              <span className="muted">until {until(i.expiresAt)}</span>
              <button type="button" className="link-btn" onClick={() => void cancel(i.token)}>
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
