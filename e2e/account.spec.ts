import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEST } from '../src/syncConfig.ts';

/** Test user A of the fitness-quest-test project, from .env.test.local (skipped without it). */
function testUser(): { email: string; password: string } | null {
  try {
    const env = Object.fromEntries(
      readFileSync('.env.test.local', 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    );
    const email = env.SUPABASE_TEST_USER_A_EMAIL;
    const password = env.SUPABASE_TEST_USER_A_PASSWORD;
    return email && password && password !== 'replace-me' ? { email, password } : null;
  } catch {
    return null;
  }
}

const user = testUser();
test.skip(!user, 'needs .env.test.local with the test users');
// these tests share the test accounts, so they run one after another
test.describe.configure({ mode: 'serial' });

async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...test.info().project.use });
  const page = await context.newPage();
  await page.goto('./');
  return page;
}

async function signIn(page: Page) {
  const form = page.getByRole('form', { name: 'Test sign-in' });
  await form.getByLabel('Test email').fill(user!.email);
  await form.getByLabel('Test password').fill(user!.password);
  await form.getByRole('button', { name: 'Test sign-in' }).click();
}

async function syncNow(page: Page) {
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText(/^Synced (just now|\d+ min ago)\.$/)).toBeVisible({
    timeout: 20_000,
  });
}

test('sign in on two phones: data moves between them, deletes too', async ({ browser }) => {
  test.setTimeout(120_000);

  // Phone 1: set up, add a food, sign in; this phone's data becomes the account's
  const one = await newPhone(browser);
  await one.getByLabel('Birth year').fill('1990');
  await one.getByLabel('Height (cm)').fill('175');
  await one.getByLabel('Weight (kg)').fill('70');
  await one.getByRole('button', { name: 'Start the adventure' }).click();
  await one.getByRole('button', { name: 'Food', exact: true }).click();
  await one.getByRole('button', { name: '+ kcal' }).click();
  await one.getByLabel('Calories (kcal)').fill('431');
  await one.getByRole('button', { name: 'Log it' }).click();
  await one.getByRole('button', { name: 'Profile and targets' }).click();
  await signIn(one);
  // the account may hold data from earlier runs: replace it with this phone's
  const choose = one.getByRole('dialog', { name: 'This phone and your account both have data' });
  const synced = one.getByText(/^Synced just now\.$/);
  await expect(choose.or(synced)).toBeVisible({ timeout: 20_000 });
  if (await choose.isVisible())
    await choose.getByRole('button', { name: "Use this phone's data" }).click();
  await expect(synced).toBeVisible({ timeout: 20_000 });

  // Phone 2: a new phone signs in on the welcome screen and gets everything
  const two = await newPhone(browser);
  await signIn(two);
  await two.getByRole('button', { name: 'Food', exact: true }).click({ timeout: 20_000 });
  await expect(two.locator('.entry', { hasText: '431' })).toBeVisible();

  // delete on phone 2, and phone 1 loses it too
  await two
    .locator('.entry', { hasText: '431' })
    .getByRole('button', { name: /^Remove / })
    .click();
  await two.getByRole('button', { name: 'Profile and targets' }).click();
  await syncNow(two);
  await syncNow(one);
  await one.getByRole('button', { name: 'Close' }).click();
  await expect(one.locator('.entry', { hasText: '431' })).toHaveCount(0);
});

/** Test users A and B of the fitness-quest-test project, from .env.test.local (skipped without it). */
function env(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync('.env.test.local', 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    );
  } catch {
    return {};
  }
}
const e = env();
const users = {
  A: { email: e.SUPABASE_TEST_USER_A_EMAIL ?? '', password: e.SUPABASE_TEST_USER_A_PASSWORD ?? '' },
  B: { email: e.SUPABASE_TEST_USER_B_EMAIL ?? '', password: e.SUPABASE_TEST_USER_B_PASSWORD ?? '' },
};
const ready = [users.A, users.B].every((u) => u.email && u.password && u.password !== 'replace-me');

/** A server-side helper: signed in as one test user, to set the scene before the phones open. */
async function api(who: 'A' | 'B'): Promise<{ c: SupabaseClient; id: string; name: string }> {
  const c = createClient(TEST.url, TEST.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword(users[who]);
  if (error) throw error;
  const id = data.user.id;
  let name = (await c.from('usernames').select('username').eq('user_id', id)).data?.[0]
    ?.username as string | undefined;
  if (!name) {
    name = `q${who.toLowerCase()}_${Date.now().toString(36)}`;
    await c.from('usernames').insert({ user_id: id, username: name });
  }
  return { c, id, name };
}

async function friendPhone(browser: Browser, who: 'A' | 'B'): Promise<Page> {
  const context = await browser.newContext({ ...test.info().project.use });
  const page = await context.newPage();
  await page.goto('./');
  const form = page.getByRole('form', { name: 'Test sign-in' });
  await form.getByLabel('Test email').fill(users[who].email);
  await form.getByLabel('Test password').fill(users[who].password);
  await form.getByRole('button', { name: 'Test sign-in' }).click();
  // an account with data brings its profile here; an empty one needs the welcome form, filled only once
  // the first sync has said so (filling it sooner would make this phone's data clash with the account's)
  const tabs = page.getByRole('navigation', { name: 'Sections' });
  const start = page.getByRole('button', { name: 'Start the adventure' });
  const empty = page.getByText('No profile in your account yet');
  await expect(tabs.or(empty)).toBeVisible({ timeout: 30_000 });
  if (!(await tabs.isVisible())) {
    await page.getByLabel('Birth year').fill('1992');
    await page.getByLabel('Height (cm)').fill('170');
    await page.getByLabel('Weight (kg)').fill('65');
    await start.click();
  }
  await tabs.getByRole('button', { name: 'Friends' }).click();
  return page;
}

test("two friends: a request by username, an accept, and each other's profile", async ({
  browser,
}) => {
  test.skip(!ready, 'needs test user B too');
  test.setTimeout(180_000);
  const a = await api('A');
  const b = await api('B');
  // a clean slate between A and B
  for (const [me, other] of [
    [a, b],
    [b, a],
  ] as const) {
    await me.c.rpc('unblock_user', { other: other.id });
    await me.c.rpc('remove_friend', { other: other.id });
    await me.c.rpc('answer_friend_request', { other: other.id, accept: false });
  }

  const pa = await friendPhone(browser, 'A');
  const pb = await friendPhone(browser, 'B');

  // A writes a bio; it reaches friends after A's next publish
  const bio = `Leg day enjoyer ${Date.now().toString(36)}`;
  await pa.getByRole('button', { name: 'Edit profile' }).click();
  const editor = pa.getByRole('dialog', { name: 'Edit profile' });
  await editor.getByLabel('Bio').fill(bio);
  await editor.getByRole('button', { name: 'Save profile' }).click();
  await expect(pa.getByText(bio)).toBeVisible();

  // badges: tapping one says what it is and how it's earned
  const mine = pa.getByRole('region', { name: 'Your profile' });
  await mine.getByText(/badges? earned$/).click();
  await mine.getByRole('button', { name: 'Novice: show what it is' }).click();
  const badge = pa.getByRole('dialog', { name: 'Novice' });
  await expect(badge).toContainText('Start your adventure');
  await expect(badge).toContainText("You've earned this badge.");
  await badge.getByRole('button', { name: 'Close' }).click();

  // B asks A, by A's username in other capitals
  const add = pb.getByRole('form', { name: 'Add a friend' });
  await add.getByLabel('Their username').fill(a.name.toUpperCase());
  await add.getByRole('button', { name: 'Send request' }).click();
  await expect(add.getByText(`Request sent to ${a.name.toUpperCase()}.`)).toBeVisible();
  await expect(pb.getByRole('region', { name: 'Requests you sent' })).toContainText(a.name);

  // A sees the request and accepts
  await pa.reload();
  await pa
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: 'Friends' })
    .click();
  const requests = pa.getByRole('region', { name: 'Friend requests' });
  await expect(requests).toContainText(b.name, { timeout: 20_000 });
  await requests.getByRole('button', { name: 'Accept' }).click();
  await expect(pa.getByRole('region', { name: 'Your friends' })).toContainText(b.name);

  // B now sees A as a friend, with A's published bio
  await expect
    .poll(
      async () => {
        await pb.reload();
        await pb
          .getByRole('navigation', { name: 'Sections' })
          .getByRole('button', { name: 'Friends' })
          .click();
        const row = pb.getByRole('region', { name: 'Your friends' }).getByRole('button', {
          name: new RegExp(a.name),
        });
        // the list loads after the screen does
        await expect(pb.getByRole('heading', { name: /^Your friends \(\d+\)$/ })).toBeVisible();
        if (!(await row.isVisible())) return 'not a friend yet';
        await row.click();
        const card = pb.getByRole('dialog', { name: a.name });
        const text = (await card.textContent()) ?? '';
        await card.getByRole('button', { name: 'Close' }).click();
        return text.includes(bio) ? 'bio shown' : 'no bio yet';
      },
      { timeout: 60_000, intervals: [3_000] },
    )
    .toBe('bio shown');

  // B removes A, and A's list empties
  await pb
    .getByRole('region', { name: 'Your friends' })
    .getByRole('button', { name: new RegExp(a.name) })
    .click();
  const sheet = pb.getByRole('dialog', { name: a.name });
  await sheet.getByRole('button', { name: 'Remove friend' }).click();
  await sheet.getByRole('button', { name: 'Remove friend' }).click();
  await expect(pb.getByRole('region', { name: 'Your friends' })).not.toContainText(a.name);
});

test('an invite link: A shares it, B opens it and they are friends', async ({ browser }) => {
  test.skip(!ready, 'needs test user B too');
  test.setTimeout(180_000);
  const a = await api('A');
  const b = await api('B');
  for (const [me, other] of [
    [a, b],
    [b, a],
  ] as const) {
    await me.c.rpc('unblock_user', { other: other.id });
    await me.c.rpc('remove_friend', { other: other.id });
    await me.c.rpc('answer_friend_request', { other: other.id, accept: false });
  }
  const { data: left } = await a.c.from('invites').select('token');
  for (const i of left ?? []) await a.c.from('invites').delete().eq('token', i.token);

  const pa = await friendPhone(browser, 'A');
  const invites = pa.getByRole('region', { name: 'Invite with a link' });
  await invites.getByRole('button', { name: 'Make an invite link' }).click();
  await expect(invites.getByRole('img', { name: 'QR code of your invite link' })).toBeVisible();
  const link = (await invites.locator('.invite-link').textContent())!;
  expect(link).toMatch(/#invite=[0-9a-f]{32}$/);

  // B opens the link signed out, signs in, and is asked
  const context = await browser.newContext({ ...test.info().project.use });
  const pb = await context.newPage();
  await pb.goto(link);
  await expect(pb.getByRole('dialog', { name: "You're invited" })).toBeVisible();
  await expect(pb).not.toHaveURL(/invite=/); // the token left the address bar
  await pb
    .getByRole('dialog', { name: "You're invited" })
    .getByRole('button', { name: 'Close' })
    .click();
  const form = pb.getByRole('form', { name: 'Test sign-in' });
  await form.getByLabel('Test email').fill(users.B.email);
  await form.getByLabel('Test password').fill(users.B.password);
  await form.getByRole('button', { name: 'Test sign-in' }).click();
  // closing the signed-out sheet drops the invite, so open the link again now signed in
  await pb.goto(link);
  const ask = pb.getByRole('dialog', { name: `${a.name} invited you` });
  await expect(ask).toBeVisible({ timeout: 30_000 });
  await ask.getByRole('button', { name: 'Add friend' }).click();
  await expect(pb.getByText(`You and ${a.name} are friends now.`)).toBeVisible();
  expect((await b.c.rpc('is_friend', { other: a.id })).data).toBe(true);

  // A sees B in the list after a refresh; A cancels the link
  await pa.reload();
  await pa
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: 'Friends' })
    .click();
  await expect(pa.getByRole('region', { name: 'Your friends' })).toContainText(b.name, {
    timeout: 20_000,
  });
  await pa
    .getByRole('list', { name: 'Your live invite links' })
    .getByRole('button', { name: 'Cancel' })
    .first()
    .click();
  await expect(pa.getByRole('list', { name: 'Your live invite links' })).toHaveCount(0);
  await b.c.rpc('remove_friend', { other: a.id });
});

test('friends: the feed, a cheer, and a shared quest from proposal to running', async ({
  browser,
}) => {
  test.skip(!ready, 'needs test user B too');
  test.setTimeout(180_000);
  const a = await api('A');
  const b = await api('B');
  for (const [me, other] of [
    [a, b],
    [b, a],
  ] as const) {
    await me.c.rpc('unblock_user', { other: other.id });
    await me.c.rpc('remove_friend', { other: other.id });
    await me.c.rpc('answer_friend_request', { other: other.id, accept: false });
    const { data } = await me.c.from('challenges').select('id, status, from_user');
    for (const r of data ?? []) {
      if (r.status === 'accepted') await me.c.rpc('quit_challenge', { challenge: r.id });
      else if (r.status === 'pending' && r.from_user === me.id)
        await me.c.rpc('cancel_challenge', { challenge: r.id });
    }
  }
  await b.c.rpc('send_friend_request', { target_username: a.name });
  await a.c.rpc('answer_friend_request', { other: b.id, accept: true });
  // A's phone publishes its own (empty) activity first; the test item is added after that settles
  const pa = await friendPhone(browser, 'A');
  await pa.waitForTimeout(6_000);
  const today = new Date().toISOString().slice(0, 10);
  const title = `Leg day ${Date.now().toString(36)}`;
  await a.c.from('activity').upsert(
    {
      owner: a.id,
      id: 'workout:e2e',
      data: { v: 1, kind: 'workout', date: today, title, detail: '5 sets' },
    },
    { onConflict: 'owner,id' },
  );

  // B cheers A's workout in the feed
  const pb = await friendPhone(browser, 'B');
  const feed = pb.getByRole('region', { name: 'What friends did lately' });
  await expect(feed).toContainText(title, { timeout: 20_000 });
  const cheerBtn = feed.getByRole('button', { name: `Cheer ${a.name}: ${title}` });
  await cheerBtn.click();
  await expect(cheerBtn).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(
      async () =>
        (await a.c.from('cheers').select('from_user').eq('activity_id', 'workout:e2e')).data,
    )
    .toEqual([{ from_user: b.id }]);

  // B challenges A from A's profile
  await pb
    .getByRole('region', { name: 'Your friends' })
    .getByRole('button', { name: new RegExp(a.name) })
    .click();
  const sheet = pb.getByRole('dialog', { name: a.name });
  await sheet.getByRole('button', { name: `Challenge ${a.name}: 3 workouts each` }).click();
  await expect(sheet.getByText(`Sent to ${a.name}. It starts when they accept.`)).toBeVisible();

  // A sees the cheer and accepts the shared quest
  await pa.reload();
  await pa
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: 'Friends' })
    .click();
  await expect(pa.getByRole('list', { name: 'Cheers for you' })).toContainText(b.name, {
    timeout: 20_000,
  });
  const quest = pa
    .getByRole('region', { name: 'Shared quests' })
    .getByRole('listitem', { name: `3 workouts each with ${b.name}` });
  await quest.getByRole('button', { name: 'Accept' }).click();
  await expect(quest.getByRole('button', { name: 'Give up' })).toBeVisible();
  await expect(quest).toContainText('You: ');

  // tidy up
  await quest.getByRole('button', { name: 'Give up' }).click();
  await a.c.from('activity').delete().eq('id', 'workout:e2e');
  await a.c.rpc('remove_friend', { other: b.id });
});
