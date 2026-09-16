# Security review — 2026-09-17

Scope: application source, installed dependencies, public response headers,
Supabase authentication settings, database migrations/permissions, and deployment
file selection. This is a code/configuration review with regression checks, not
a penetration test or a guarantee that every vulnerability has been found.

## Findings fixed

| Finding | Change | Verification |
| --- | --- | --- |
| Supabase SSR adapter discarded cache-prevention headers supplied during token refresh. Redirects preserved cookies but not cache headers. | Preserve SDK headers; explicitly prevent caching on proxy responses and both auth callbacks, including errors. | Tests cover refreshed cookies, signed-in/out redirects, successful and failed callbacks. Existing live login HTML was already private; no cross-user cache leak was observed. |
| Production auth cookies did not explicitly require HTTPS. | Set `secure` consistently in browser, server, and proxy adapters for production. Keep Supabase's browser-compatible cookie model. | Production build and auth response regression checks pass. |
| Missing browser protection headers. | Deny framing, disable MIME sniffing, suppress referrers, restrict camera/microphone/geolocation, and restrict plugin objects, form actions and base URLs through CSP. Remove `X-Powered-By`. | Chromium checks headers and verifies login hydration and invalid auth callbacks. Vercel already supplies HSTS. |
| Signup trigger function inherited public execution permissions. | New migration revokes `EXECUTE` from PUBLIC, anon, and authenticated. | Hosted advisor warnings for this function disappeared; signup trigger and study RPC transaction checks pass. |
| Hosted/local password minimum was six characters while signup UI required eight. | Enforce eight on the hosted Auth server and in local Supabase config. | Management API readback confirms eight; browser signup input matches. |

No applied migration was edited. The permission change is
`20260917000000_trigger_permissions.sql`.

## Confirmed boundaries

- Server account loading verifies identity with Supabase `getUser()` and is
  marked `server-only`. Protected server pages also enforce authentication;
  proxy redirects are not the database security boundary.
- App tables use RLS. API roles cannot write tables directly or truncate them.
  Study writes use authenticated RPCs, fixed search paths, input validation and
  ownership checks. Regression tests cover cross-account reads, saves, deletion,
  profile changes, and direct-write denial.
- OAuth exchanges use the SDK's PKCE flow. Callback destinations are fixed
  same-origin paths; a user-supplied `next` URL is not used. Confirmation types
  are restricted. Callback redirects discard codes and token hashes.
- Google sign-in and email confirmation remain enabled. Production redirects
  use the exact production callback; no wildcard was added.
- Rendering uses React text interpolation; no raw HTML injection or dynamic
  evaluation was found in application source.
- Only the Supabase URL and public publishable/anon key are consumed by the app.
  Environment files are Git-ignored and excluded from Vercel uploads. The new
  tracked `.env.example` contains placeholders only. A source pattern scan found
  no private keys, Supabase personal/secret keys or Google client secrets in the
  reviewed non-environment files; this was not a full Git-history secret audit.
- `npm audit` reported **0 known vulnerabilities** in the installed dependency
  tree. Lockfile-based installation is documented with `npm ci`.

## Remaining decisions and limits

- Hosted security advisor retains three warnings for the authenticated
  `SECURITY DEFINER` RPCs: save session, delete session, and update profile. These
  are intentional entry points: each validates `auth.uid()`, limits writes to
  that user, and has a fixed empty search path. Removing their execution grants
  would prevent the app from saving. Keep reviewing these checks when editing RPCs.
- Leaked-password protection is disabled. Supabase documents it as a
  [Pro-plan feature](https://supabase.com/docs/guides/auth/password-security).
  No paid plan change was made.
- Custom SMTP and CAPTCHA are not configured. Configure SMTP before opening
  email signup to the public; consider CAPTCHA if signup abuse warrants it.
  Provider rate limits remain in place; no application CAPTCHA flow was added.
- CSP currently restricts framing, objects, forms and base URLs; it does **not**
  enforce a script allowlist. A stricter policy needs per-request nonces and
  compatibility tests for Next hydration and Motion styling.
- Auth cookies remain readable by the browser SDK, as required by this
  browser-to-Supabase architecture. Switching to HttpOnly cookies would require
  moving authenticated browser operations behind a server API.
- Recovery data stays in account-scoped localStorage across sign-out so unsynced
  study time is recoverable. It is not encrypted against other people using the
  same browser profile. Do not treat a shared browser profile as private storage.
- Study duration is self-reported. Account isolation is enforced, but this is
  not an anti-cheat system for a future competitive leaderboard.

## Verification

62 automated tests, lint, TypeScript and production build pass. Chromium checks
cover login, the signup minimum, response headers, and rejected auth redirects.
Hosted checks run in a transaction and roll back synthetic account/study data.
See [testing](TESTING.md) for the short session walkthrough and
[deployment](DEPLOYMENT.md) for the deployed version.
