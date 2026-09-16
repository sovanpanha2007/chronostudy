# Hosted deployment and Google sign-in

Target: the existing Supabase project `chronostudy` (`fhjafmnprbtggqrjotih`)
and the existing Vercel project `chronostudy`. Its stable production origin is
`https://chronostudy-tan.vercel.app`.

Verified against hosted Supabase on 2026-09-16: Google and email sign-in are
enabled, email confirmation is required, and the Google authorization endpoint
returns a redirect to `accounts.google.com` with the expected Supabase callback.
Vercel authentication succeeded and the Production/Preview public Supabase
variables now point to this hosted project. The current workspace built
successfully. The latest deployment, including the 2026-09-17 security review and
folder organization, is `dpl_GVRWEjSB6b2qBW5NDBEeD8tGjXB3`:
https://chronostudy-19w6p1obz-sovanpanha2007s-projects.vercel.app

The stable `chronostudy-tan.vercel.app` alias now serves this deployment.
Supabase Site URL is `https://chronostudy-tan.vercel.app`, and its redirect
allowlist contains `https://chronostudy-tan.vercel.app/auth/callback`.
The user confirmed Google account sign-in works on production. The user's live
study-session walkthrough remains a recommended acceptance check. Custom SMTP
is not configured; public email signup is not yet ready for general use.

Deployment file review verified all 34 app source files are included and local
environment/database files are excluded. The database exclusion is anchored at
`/supabase/` so it does not accidentally exclude `src/lib/supabase/`.

Public production checks passed without a deployment bypass: `/login` returned
HTTP 200, signed-out `/app` redirected to `/login`, and Chromium found no page
errors. Clicking Google used the production app callback and reached Google's
sign-in page. The user separately confirmed actual Google account sign-in works.

All five hosted migration versions match the repository. The first two were
already installed manually; their tables, columns, policies, constraints, view,
trigger, indexes and badge seeds were inspected before repairing migration
history. The initial deployment applied only `20260912000000_session_lifecycle.sql` and
`20260916000000_hosted_privileges.sql` were applied. The latter removes broad
inherited API table privileges and fixes the signup trigger's search path.
The security review then applied `20260917000000_trigger_permissions.sql`,
removing unnecessary API execution of that trigger function. Hosted password
minimum is now eight characters, matching the signup form and local config.

A hosted SQL transaction verified onboarding, finalized saves, badge awards,
idempotent retry, deletion, badge retention, and API permissions. All synthetic
account and session data was rolled back. The 62 automated tests pass,
including auth cache/redirect boundaries, cross-account mutations, and hosted
default grants. Lint, TypeScript, and production build pass. Public browser
checks verify the deployed security headers and Google redirect.
See `SECURITY.md` for the findings and remaining advisor warnings.

## 1. Hosted database

Once authenticated, inspect the linked project's migration history first:

```sh
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Apply only the missing reviewed migrations with `npx supabase db push --linked`.
Do not reset the hosted database. Confirm all five migration versions are
present, eight badges are seeded, and `get_study_summary`, `save_study_session`,
`delete_study_session`, and `update_study_profile` exist.

## 2. Vercel

Use the Next.js framework preset and the existing `npm run build` script.
Set these variables before the first build:

| Variable | Production value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fhjafmnprbtggqrjotih.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | This hosted project's publishable key from Supabase Settings → API Keys |

The app does not need a Supabase secret/service-role key or a Google client
secret in Vercel. Keep `.env.local` pointed at local Supabase; `.vercelignore`
excludes local environment and database files from deployment uploads.

Deploy the current workspace, including its uncommitted app files. A deployment
of the existing GitHub branch alone may omit these changes. After a successful
build, record the assigned stable production URL and use it below. Changing a
`NEXT_PUBLIC_` value requires rebuilding the deployment.

## 3. Google OAuth

In [Google Auth Platform](https://console.cloud.google.com/auth/overview), create
or select the app's project. Configure its branding and audience, then create an
OAuth client with application type **Web application**. Use only the basic
`openid`, email, and profile scopes. If the app is in testing mode, add the
Google accounts that will test it to the audience's test users.

- Authorized JavaScript origin: `https://chronostudy-tan.vercel.app` (no path).
- Authorized redirect URI: **`https://fhjafmnprbtggqrjotih.supabase.co/auth/v1/callback`**.
- Enter the resulting client ID and secret in this project's Supabase
  **Authentication → Sign In / Providers → Google** settings and enable Google.

Google returns to Supabase's `/auth/v1/callback`. Supabase then returns to the
app's `/auth/callback`; these are different URLs. Follow the
[Supabase Google setup guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

## 4. Supabase Auth URLs

Set **Site URL** to the stable Vercel production origin. Add its exact
`/auth/callback` URL to the redirect allowlist, preserving any existing valid
entries. Enable email confirmations. The default confirmation email flow uses
the app's signup `emailRedirectTo`; a custom token-hash template can instead use
the implemented `/auth/confirm` route.

For public email/password signup, configure a mail provider in Supabase's SMTP
settings: the default sender is restricted to project team addresses. Google
OAuth does not require SMTP. See [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

## 5. Live verification

1. Open `/app` signed out: it redirects to login.
2. Complete Google sign-in: the callback stays on the production host and opens
   onboarding for a new account.
3. Finish onboarding, save a five-minute session, reload, and verify its total.
4. Sign out and back in: the same profile and study history return.
5. Verify email signup and Google sign-in with the same verified email reach one
   account. Check in an ordinary browser without any deployment bypass token.

Deployment and Google sign-in are confirmed. Complete the live session and
sign-out/sign-in checks above for final user acceptance. Email-account linking
verification additionally requires working email delivery.
