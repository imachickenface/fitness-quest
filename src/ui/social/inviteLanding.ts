/** Keeping an invite link's token until the person is signed in and can use it. */
import { inviteInUrl } from '../../sync/social.ts';

const KEY = 'pendingInvite';

/**
 * Keep an invite from the address bar until it can be used: signing in with Google leaves the page, and
 * the way back has no `#invite=`. Called once when the app starts.
 */
export function keepInviteFromUrl(): void {
  const token = inviteInUrl();
  if (!token) return;
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // private mode: the invite still works if the person is already signed in
    pending = token;
  }
  history.replaceState(null, '', location.pathname + location.search);
}

let pending: string | undefined;

export function readPending(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? pending;
  } catch {
    return pending;
  }
}

export function dropPending() {
  pending = undefined;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing kept
  }
}
