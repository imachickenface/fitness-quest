import { useEffect, useState } from 'react';
import {
  inviteOwnerName,
  redeemInvite,
  redeemMessage,
  type RedeemResult,
} from '../../sync/social.ts';
import { getClient } from '../../sync/supabase.ts';
import { useAccount } from '../accountContext.ts';
import { Sheet } from '../Sheet.tsx';
import { dropPending, keepInviteFromUrl, readPending } from './inviteLanding.ts';

/** "<name> invited you": shown after opening someone's invite link, once signed in with a username. */
export function InviteSheet() {
  const account = useAccount();
  const [token, setToken] = useState(readPending);
  const [owner, setOwner] = useState<string | null | undefined>();
  const [result, setResult] = useState<RedeemResult | undefined>();
  const [busy, setBusy] = useState(false);
  const ready =
    account.status === 'signed-in' &&
    typeof account.username === 'string' &&
    !account.firstSyncChoice;

  // an invite link opened while the app is already open only changes the address after `#`
  useEffect(() => {
    const onHash = () => {
      keepInviteFromUrl();
      const next = readPending();
      if (next) {
        setOwner(undefined);
        setResult(undefined);
        setToken(next);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!ready || !token) return;
    let live = true;
    void getClient()
      .then((c) => inviteOwnerName(c, token))
      .then((name) => live && setOwner(name))
      .catch(() => live && setOwner(null));
    return () => {
      live = false;
    };
  }, [ready, token]);

  if (!token) return null;

  const close = () => {
    dropPending();
    setToken(undefined);
  };

  if (account.status === 'signed-out') {
    return (
      <Sheet title="You're invited" onClose={close}>
        <p>Someone invited you to be friends on Fitness Quest. Sign in to accept.</p>
        <button type="button" className="btn btn-primary" onClick={() => void account.signIn()}>
          Sign in with Google
        </button>
      </Sheet>
    );
  }
  if (!ready || owner === undefined) return null;

  async function accept() {
    setBusy(true);
    try {
      setResult(await redeemInvite(await getClient(), token!));
      dropPending();
    } catch {
      setResult(undefined);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Sheet title="Friend invite" onClose={close}>
        <p role="status">{redeemMessage(result, owner ?? 'your friend')}</p>
        <button type="button" className="btn btn-primary" onClick={close}>
          OK
        </button>
      </Sheet>
    );
  }
  if (owner === null) {
    return (
      <Sheet title="Friend invite" onClose={close}>
        <p>{redeemMessage('expired', '')}</p>
        <button type="button" className="btn" onClick={close}>
          OK
        </button>
      </Sheet>
    );
  }
  return (
    <Sheet title={`${owner} invited you`} onClose={close}>
      <p>
        Become friends with <b>{owner}</b>? You'll see each other's profiles, levels and workouts.
        Never your weight or food.
      </p>
      <div className="backup-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void accept()}
        >
          Add friend
        </button>
        <button type="button" className="link-btn" onClick={close}>
          Not now
        </button>
      </div>
    </Sheet>
  );
}
