import { useState, type FormEvent } from 'react';
import { IS_TEST_PROJECT } from '../sync/supabase.ts';
import { useAccount } from './accountContext.ts';
import { Sheet } from './Sheet.tsx';

const timeAgo = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

/** "Account" in the profile sheet: sign in with Google, see the sync, sign out or delete the account. */
export function AccountPanel() {
  const account = useAccount();
  const [leaving, setLeaving] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  if (account.status === 'checking') {
    return (
      <section className="account" aria-label="Account">
        <p className="muted">Checking your account…</p>
      </section>
    );
  }

  if (account.status === 'signed-out') {
    return (
      <section className="account" aria-labelledby="account-title">
        <h2 id="account-title">Account</h2>
        <p className="muted">
          Optional: sign in to keep your data on all your phones. The app works fully without it.{' '}
          <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy</a>
        </p>
        <button type="button" className="btn" onClick={() => void account.signIn()}>
          Sign in with Google
        </button>
        {IS_TEST_PROJECT && <TestSignIn />}
        {account.error && <p className="form-error">Couldn't sign in: {account.error}</p>}
      </section>
    );
  }

  const status =
    account.sync === 'syncing'
      ? 'Syncing…'
      : account.sync === 'offline'
        ? "Offline: changes sync when you're back online."
        : account.sync === 'error'
          ? `Couldn't sync: ${account.error ?? 'unknown error'}.`
          : account.firstSyncChoice
            ? 'Waiting for you to choose how to combine this phone and your account.'
            : account.lastSyncedAt
              ? `Synced ${timeAgo(account.lastSyncedAt)}.`
              : 'Not synced yet.';

  async function leave(clearPhone: boolean) {
    setBusy(true);
    await account.signOut(clearPhone);
    setBusy(false);
    setLeaving(false);
  }

  return (
    <section className="account" aria-labelledby="account-title">
      <h2 id="account-title">Account</h2>
      <p>
        Signed in as <b>{account.email}</b>
      </p>
      <p className="muted" aria-live="polite">
        {status}
      </p>
      {!leaving ? (
        <div className="backup-actions">
          <button
            type="button"
            className="btn"
            disabled={account.sync === 'syncing'}
            onClick={account.syncNow}
          >
            Sync now
          </button>
          <button type="button" className="btn" onClick={() => setLeaving(true)}>
            Sign out
          </button>
        </div>
      ) : (
        <div className="restore-confirm" role="group" aria-label="Sign out">
          <p>Keep your data on this phone after signing out? Your account keeps it either way.</p>
          <button type="button" className="btn" disabled={busy} onClick={() => void leave(false)}>
            Sign out, keep data here
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void leave(true)}>
            Sign out and remove it from this phone
          </button>
          <button type="button" className="link-btn" onClick={() => setLeaving(false)}>
            Cancel
          </button>
        </div>
      )}
      <details className="danger-zone">
        <summary>Delete account</summary>
        <p>
          Deletes your account and everything stored in it, for good. This phone keeps its own copy
          until you clear it. Type DELETE to confirm.
        </p>
        <label className="field">
          <span className="visually-hidden">Type DELETE to confirm</span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </label>
        <button
          type="button"
          className="btn btn-danger"
          disabled={confirm !== 'DELETE' || busy}
          onClick={() => {
            setBusy(true);
            void account.deleteAccount().finally(() => setBusy(false));
          }}
        >
          Delete my account
        </button>
      </details>
    </section>
  );
}

/** Test builds only: the test project's email + password users, since automated tests can't use Google. */
function TestSignIn() {
  const account = useAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    void account.signInTest(email, password);
  }
  return (
    <form className="form test-sign-in" onSubmit={submit} aria-label="Test sign-in">
      <label className="field">
        <span>Test email</span>
        <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </label>
      <label className="field">
        <span>Test password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="off"
        />
      </label>
      <button type="submit" className="btn">
        Test sign-in
      </button>
    </form>
  );
}

/** Shown once, when this phone and the account both have data: how to put them together. */
export function FirstSyncSheet() {
  const account = useAccount();
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  if (account.status !== 'signed-in' || !account.firstSyncChoice || later) return null;

  async function pick(choice: 'combine' | 'account' | 'phone') {
    setBusy(true);
    await account.chooseFirstSync(choice);
    setBusy(false);
  }

  return (
    <Sheet title="This phone and your account both have data" onClose={() => setLater(true)}>
      <div className="first-sync">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void pick('combine')}
        >
          Combine both
        </button>
        <p className="muted">
          Keeps everything from both. Where the same entry differs, the newer one wins.
        </p>
        <button type="button" className="btn" disabled={busy} onClick={() => void pick('account')}>
          Use my account's data
        </button>
        <p className="muted">
          Replaces what's on this phone. A backup file of this phone is saved first.
        </p>
        <button type="button" className="btn" disabled={busy} onClick={() => void pick('phone')}>
          Use this phone's data
        </button>
        <p className="muted">
          Replaces what's in your account with this phone's data, on all your phones.
        </p>
      </div>
    </Sheet>
  );
}
