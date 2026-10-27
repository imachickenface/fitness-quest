/**
 * Public Supabase settings for sign-in and sync (docs/ACCOUNTS.md). Publishable keys are public by design:
 * they only identify the project, and the database's access rules decide what anyone can do. Never put a
 * secret key (sb_secret_...) or the old service_role key in this file.
 */
export type SupabaseProject = { url: string; publishableKey: string };

/** The real project, used by the app on GitHub Pages. */
export const LIVE: SupabaseProject = {
  url: 'https://cdwqgtguexebrnggasfr.supabase.co',
  publishableKey: 'sb_publishable_mNhr_n79UuEkxnFRKbu1Qw_AbKHYoh6',
};

/** The test project (fitness-quest-test), used only by automated tests and local test builds. */
export const TEST: SupabaseProject = {
  url: 'https://cuaaopuywnkbiuanrpun.supabase.co',
  publishableKey: 'sb_publishable_lnCfrl85Zrtaz4KfduylYQ_eQOn8R3N',
};
