# Setting up accounts (Supabase + Google sign-in)

> **Status (2026-10-27): one fix left.** In both projects the Google **Client secret** box holds the
> client ID by mistake, so Google refuses every sign-in ("Unable to exchange external code" in the auth
> logs). Paste the real secret (`GOCSPX-...`) there (Part 3). Both migrations are applied to both projects. Supabase projects: `FitQuest`
> (`cdwqgtguexebrnggasfr`, real) and `fitness-quest-test` (`cuaaopuywnkbiuanrpun`); Google Cloud project
> `fitquest-512921`, client "Fitness Quest web", published (In production). The public values are in
> [`src/syncConfig.ts`](../src/syncConfig.ts). Checked: signed-out requests are refused on both projects.

What you do once, by hand, so the app can sign people in with Google and sync their data. It takes about
30-45 minutes. Everything here is free. Claude can't create these accounts for you; it builds and tests the
app side once you send the four values at the end.

You will make:

- two **Supabase** projects: `fitness-quest` (the real one) and `fitness-quest-test` (only for automated
  tests and test accounts, so tests never touch real data);
- one **Google sign-in client** that both projects use.

Keep a note open while you go; you will copy a few values between the two sites.

---

## Part 1 - Supabase projects (about 10 minutes)

1. Go to <https://supabase.com> and sign up (signing up with your GitHub account is fine).
2. Click **New project**.
   - **Name:** `fitness-quest`
   - **Database password:** click **Generate a password** and save it in your password manager. Claude
     never needs it; don't send it in chat.
   - **Region:** the one closest to you, for example **West US (North California)**.
   - **Plan:** Free.
   - Click **Create new project** and wait a minute or two until it's ready.
3. Repeat step 2 with the name **`fitness-quest-test`**.
4. In **each** project: open **SQL Editor** (left menu) > **New query**, paste the whole of
   [`supabase/migrations/001_records.sql`](../supabase/migrations/001_records.sql), and click **Run**. It
   should say "Success. No rows returned". This creates the one table the app uses and the rules that keep
   each person's data private. Then do the same with
   [`supabase/migrations/002_usernames.sql`](../supabase/migrations/002_usernames.sql) (unique usernames).
5. In **each** project: open **Authentication** > **Sign In / Providers** > **Google** and copy the
   **Callback URL** it shows (it looks like `https://abcdefgh.supabase.co/auth/v1/callback`). Leave this
   page open; you'll come back in Part 3. Note which callback belongs to which project.

## Part 2 - Google sign-in client (about 15 minutes)

1. Go to <https://console.cloud.google.com> and sign in with your Google account.
2. At the top, click the project picker > **New project**. Name it `Fitness Quest` and click **Create**.
   Make sure it's selected afterwards.
3. Open the menu > **Google Auth Platform** (search for it if you don't see it) > **Get started**.
   - **App name:** `Fitness Quest`
   - **User support email:** your email
   - **Audience:** **External**
   - **Contact information:** your email
   - Agree to the policy and click **Create**.
4. **Data access** > **Add or remove scopes**: tick `openid`, `.../auth/userinfo.email` and
   `.../auth/userinfo.profile`, then **Update** and **Save**. These basic scopes don't need Google's app
   review.
5. **Clients** > **Create client**:
   - **Application type:** Web application
   - **Name:** `Fitness Quest web`
   - **Authorized JavaScript origins** (add all three):
     - `https://imachickenface.github.io`
     - `http://localhost:5173`
     - `http://localhost:4173`
   - **Authorized redirect URIs:** add **both** Callback URLs you copied in Part 1, step 5.
   - Click **Create**, then copy the **Client ID** and **Client secret** into your note. The secret goes
     only into Supabase (next part), never into chat.
6. **Audience** > **Publish app** > **Confirm**, so the status says **In production**. While it says
   "Testing", only Google accounts you list by hand can sign in.

## Part 3 - Connect Google to both Supabase projects (about 5 minutes)

In **each** project:

1. **Authentication** > **Sign In / Providers** > **Google**: switch it **on**, paste the **Client ID** and
   **Client secret**, and click **Save**.
2. **Authentication** > **URL Configuration**:
   - In **fitness-quest** (the real one):
     - **Site URL:** `https://imachickenface.github.io/fitness-quest/`
     - **Redirect URLs:** add `https://imachickenface.github.io/fitness-quest/` and
       `http://localhost:5173/fitness-quest/**`
   - In **fitness-quest-test**:
     - **Site URL:** `http://localhost:4173/fitness-quest/`
     - **Redirect URLs:** add `http://localhost:4173/fitness-quest/**` and
       `http://localhost:5173/fitness-quest/**`
3. **Authentication** > **Sign In / Providers** > **Email**:
   - In **fitness-quest**: switch Email **off**. The real app signs in with Google only.
   - In **fitness-quest-test**: leave Email **on**, and switch **Confirm email** **off**. Automated tests
     sign in with a test email and password here, because they can't click through Google.

## Part 4 - Two test accounts (test project only, about 3 minutes)

1. In **fitness-quest-test**: **Authentication** > **Users** > **Add user** > **Create new user**.
   - Make two users, for example `test-a@example.com` and `test-b@example.com`, each with a password you
     make up (a long random one is fine), and tick **Auto confirm user**.
2. In the project folder (`C:\Users\super\fitness-quest`), create a file named **`.env.test.local`** with:

   ```
   SUPABASE_TEST_USER_A_EMAIL=test-a@example.com
   SUPABASE_TEST_USER_A_PASSWORD=...
   SUPABASE_TEST_USER_B_EMAIL=test-b@example.com
   SUPABASE_TEST_USER_B_PASSWORD=...
   ```

   This file is ignored by git (never committed) and only the automated tests read it. You don't need to
   send these passwords to Claude.

## Part 5 - Send Claude four values

In **each** project: **Settings** > **API Keys**. If there is no publishable key yet, click to create one.
Copy:

| Value | Where | Safe to share? |
|---|---|---|
| Project URL, real | `fitness-quest` > Settings > API Keys (or the **Connect** button) | yes |
| Publishable key, real (`sb_publishable_...`) | same page | yes: it's built into the app and public by design |
| Project URL, test | `fitness-quest-test`, same place | yes |
| Publishable key, test | same page | yes |

Paste those four into chat. **Don't** send the secret key (`sb_secret_...`) or the old `service_role`
key, the database password, the Google client secret or the test passwords: anyone with the secret key can
read every account's data.

---

## Afterwards

- **Free plan limits:** 50,000 monthly users, 500 MB of data, 2 projects. A free project pauses after a
  week with no use; the app will get a weekly GitHub Action that keeps the real project awake.
- **If sign-in fails with "redirect_uri_mismatch":** a Callback URL in Google (Part 2, step 5) doesn't
  exactly match the one Supabase shows (Part 1, step 5).
- **If Google says "Access blocked: app is in testing":** do Part 2, step 6 (Publish app).
