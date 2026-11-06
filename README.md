# @anchor-nights/kit

The shared kit for The Anchor's game nights (Quiz Night, Cash Bingo, Music Bingo, Tasting Night): the look, the TV plumbing and the small engineering pieces every app needs. TypeScript source, no build step, installed from a git tag. Public repository: no secrets and no game logic live here.

## Adopting it in an app

Next.js 16, React 19, Tailwind CSS 4, Node 24.

**1. `package.json`**

```json
"@anchor-nights/kit": "github:peterjpitcher/OJ-AnchorNights-kit#v2.0.0"
```

The kit expects `react` and `react-dom` 19, `lucide-react` 1.49 or later, and (optionally) `next` 16 in the app. It brings `clsx`, `tailwind-merge`, `qrcode.react`, `zod` and `server-only` itself.

**2. `next.config.ts`**

```ts
import type { NextConfig } from 'next';
import { ANCHOR_API_ENV, SITE_URL_ENV, SUPABASE_PUBLIC_ENV, buildIdFromEnv, validateBuildEnv } from '@anchor-nights/kit/env';

// Fails the build (and `next dev` start-up) naming every missing or malformed variable.
validateBuildEnv([
  ...SUPABASE_PUBLIC_ENV,
  ...SITE_URL_ENV,
  ...ANCHOR_API_ENV,
  // the app's own: { name: 'SPOTIFY_CLIENT_ID', required: true },
]);

const nextConfig: NextConfig = {
  transpilePackages: ['@anchor-nights/kit'],
  env: { NEXT_PUBLIC_BUILD_ID: buildIdFromEnv() },
};

export default nextConfig;
```

**3. `globals.css`** (paths below suit `src/app/globals.css`; the `@source` path is relative to the CSS file)

```css
@import "tailwindcss";
@import "@anchor-nights/kit/tokens.css";
@source "../../node_modules/@anchor-nights/kit/src";
```

Remove the app's own copies of the palette, `.kicker`, the reduced-motion rule and the keyframes once the kit's are in. A Tailwind v3 `tailwind.config.ts` that defines the same colour names must go: the kit's names come from `@theme inline` in `tokens.css`.

**4. Root layout fonts** (the variable names are fixed; `FONT_VARIABLES` in `@anchor-nights/kit/tokens` lists them)

```tsx
import { Clicker_Script, DM_Serif_Display, Outfit } from 'next/font/google';

const display = DM_Serif_Display({ variable: '--font-dm-serif', weight: '400', subsets: ['latin'], display: 'swap' });
const body = Outfit({ variable: '--font-outfit', weight: ['400', '500', '600', '700'], subsets: ['latin'], display: 'swap' });
const script = Clicker_Script({ variable: '--font-clicker', weight: '400', subsets: ['latin'], display: 'swap' });

<html lang="en-GB" className={`${display.variable} ${body.variable} ${script.variable}`}>
```

**5. The logo.** `AnchorLogo` reads `/the-anchor-pub-logo-white-transparent.png` from the app's `public/` folder (or pass `src`).

## Registers

Night (dark green, cream, bright gold) is the default: the TV, guests' phones, the host console. Put `className="theme-desk"` (or `data-theme="desk"`) on the root of a desk surface: prep, builders, admin. `theme-night` switches a surface inside a desk page back. Every kit component follows the register it sits in.

Tailwind names: `bg-bg`, `bg-surface`, `bg-surface-raised`, `bg-surface-sunk`, `text-fg`, `text-fg-strong`, `text-fg-muted`, `text-accent`, `bg-accent`, `text-on-accent`, `text-accent-text`, `border-line`, `border-line-strong`, `border-line-gold`, `bg-success-fill`, `text-success-text`, `bg-danger-fill`, `text-danger-text`, plus the fixed brand colours `anchor-green`, `anchor-green-deep`, `anchor-green-card`, `anchor-gold`, `anchor-gold-bright`, `anchor-cream`, `anchor-cream-text`, `anchor-sage`, `anchor-danger` and the rest. Fonts `font-display`, `font-sans`, `font-script`; radii `rounded-card`, `rounded-input`; shadows `shadow-gold`, `shadow-lift`, `shadow-sheet`, `shadow-card`; easing `ease-anchor`; animations `animate-fade-up`, `animate-fade-in`, `animate-sheet-up`; TV text `text-tv-xs` to `text-tv-4xl`.

## Modules

| Import | What it gives you |
|---|---|
| `@anchor-nights/kit/tokens.css` | The palette, both registers, fonts, radii, shadows, motion, TV text sizes, `.kicker`, `.grain-overlay`, stage classes, reduced motion. |
| `@anchor-nights/kit/tokens` | `FONT_VARIABLES`, `THEME_CLASS`, `ANCHOR_HEX`. |
| `@anchor-nights/kit/ui` | `Button` and `buttonClass`, `Card` (+ `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`) and `cardClass`, `Badge`, `Kicker`, `Input` with `fieldClass`, `fieldLabelClass`, `fieldHintClass`, `Modal`, `Sheet`, `DialogCloseButton`, `useDialog`, `AnchorLogo`, `Grain`, `HoldButton` (+ `holdSucceeded`, `holdProgress`), `Dock`, `UndoSlot`, `Banner`, `Spinner`, `EmptyState`, `cn`. |
| `@anchor-nights/kit/branding` | `resolveBranding(raw, { logoBucket })` with the contrast check, `derivePalette`, `brandingCssVars`, `parseBranding`, `isBrandingLogoUrl`, `BRANDING_PRESETS`, colour maths (`contrastRatio`, `hexToOklch`, ...). |
| `@anchor-nights/kit/dates` | Europe/London only: `getTodayIsoDateInLondon`, `getLondonIsoDate`, `formatDateInLondon`, `formatDateTimeInLondon`, `formatShortDateTimeInLondon`, `formatEventWhen`, `formatEventTime`, `formatEventWhenAndTime`, `nextLondonFourAm`. |
| `@anchor-nights/kit/env` | Plain JavaScript, safe for `next.config.ts`: `validateBuildEnv(rules)`, `checkEnv`, `defineEnv`, presets `SUPABASE_PUBLIC_ENV`, `SITE_URL_ENV`, `ANCHOR_API_ENV`, `ERROR_SINK_ENV`, `buildIdFromEnv`, `getPublicSupabaseEnv`. |
| `@anchor-nights/kit/errors` | `reportError(context, err, options)`, `createErrorReporter({ app })`, `logActionFailure`, `logActionLatency`, `redact`. Redacts uuids, emails, UK phone numbers and pound amounts; 2 second timeout; never throws. Posts to `sinkUrl` or `ERROR_SINK_URL` (optional `ERROR_SINK_TOKEN`, `ERROR_APP_NAME`). |
| `@anchor-nights/kit/qr` | `getSiteOrigin` (a preview never gets a production origin; production never gets localhost), `getRequestOrigin`, `buildQrUrl`, `qrValue`, `isLoopbackHost`, and `Qr`, which draws nothing for an empty or localhost value. |
| `@anchor-nights/kit/tv` | `Stage` (the 1920 by 1080 canvas scaled to the window; pass a special night's `cssVars` as `style`), `computeScale`, `buildFitSteps`, `layoutFits`, `measureLayout` and `useFitStep` (shrink text until a screen fits), `tvText`, `useWakeLock` (keeps the TV awake), `useConnectionHealth` with `ConnectionBanner` (banner after 10 seconds, one reload at 30, never offline or over unsaved work), `useBuildCheck` (picks up a new release when the app says it is safe), `useClockOffset` (server clock offset). |
| `@anchor-nights/kit/events` | **Server only** (`import 'server-only'`): `createEventsFeed({ app, categorySlug })` with `getFeed()`, the management client (`createManagementClient`, `fetchManagementJson`, `getEventsFeedConfig`), the zod parsers, `createStaleIfErrorCache`, and everything in `events/shared`. |
| `@anchor-nights/kit/events/shared` | Safe in the browser: the `ScreenFeed` and `ScreenEvent` types, `NIGHT_CATEGORY_SLUGS`, `selectNextOfFormat`, `dropStarted`, `eventLink` and `eventPageLink`, `isAllowedReviewUrl`, `readScreenFeed`, `chooseScreenFeed`, `WHATS_ON_URL`. |
| `@anchor-nights/kit/events/image-host` | Plain JavaScript, safe for `next.config.ts`: `EVENT_IMAGE_REMOTE_PATTERN`, `isAllowedEventImageUrl`. |
| `@anchor-nights/kit/events/fixtures` | Made-up management API responses for an app's own tests. |
| `@anchor-nights/kit/auth` and `auth/*` | Sign-in, invites, roles, the proxy adapter and the migration templates. See Sign-in adoption below. |
| `@anchor-nights/kit/promo` | `buildIdlePlaylist`, `buildThankYouPlaylist`, `PromoSlide` (draws any slide), `SlideLoop`, `useScreenFeed`, and the slides `EventSlide`, `NextNightSlide`, `WhatsOnSlide`, `ReviewSlide`, `ThankYouSlide`. |

## TV adoption notes

- Each app serves its own `GET /api/build` answering `{ "build": "<NEXT_PUBLIC_BUILD_ID>" }` and `GET /api/time` answering `{ "now": Date.now() }`, both with `Cache-Control: no-store`.
- `useBuildCheck({ mode, clientBuild: process.env.NEXT_PUBLIC_BUILD_ID, isSafeToReload })`: `mode: 'auto'` on the TV and phones, `'prompt'` for the host. `isSafeToReload` is the app's own rule (between games, never mid-reveal). Cash Bingo passes `storageKey: 'anchor-bingo:build-reloaded-for'` so tabs that already reloaded for a release are remembered.
- `ConnectionBanner` takes `hasUnsavedWork` (a boolean or a function) and never auto reloads while it is true; the manual Refresh asks first.
- `Stage` uses the kit's `.anchor-stage` classes; add your own with `className` (Quiz Night passes `"viewport tv"`).

## Events and promo adoption (spec S7)

The TV's idle loop and end-of-night screen come from the management app's events. The key stays on the server: the app's screen route reads the feed, and the TV and phones read that route.

**1. Environment** (server only, never `NEXT_PUBLIC_`)

| Variable | Value |
|---|---|
| `ANCHOR_API_KEY` | The app's own management API key with the `read:events` scope. Required on production builds (`ANCHOR_API_ENV` in `validateBuildEnv` checks it). Without it the feed answers `missing_config` and the screens show their no-events loop. |
| `ANCHOR_API_BASE_URL` | Optional. Defaults to `https://management.orangejelly.co.uk/api`. |

**2. `next.config.ts`**: let the TV load event artwork.

```ts
import { EVENT_IMAGE_REMOTE_PATTERN } from '@anchor-nights/kit/events/image-host';

images: { remotePatterns: [EVENT_IMAGE_REMOTE_PATTERN] },
```

**3. The feed**, once per app (for example `src/lib/events-feed.ts`):

```ts
import { createEventsFeed, NIGHT_CATEGORY_SLUGS } from '@anchor-nights/kit/events';
import { reportError } from './report-error'; // the app's createErrorReporter

export const eventsFeed = createEventsFeed({
  app: 'anchor-quiz',                       // utm_source on fallback links
  categorySlug: NIGHT_CATEGORY_SLUGS.quiz,  // quiz-night-stanwell-moor, bingo-night, music-bingo, tasting-nights
  report: (scope, err) => void reportError({ scope }, err),
});
```

The slug is resolved to its id through `/event-categories` (a display name is refused). The feed holds the answer for 5 minutes in the server's memory (and in Next's data cache where Next applies it), keeps serving the last good answer for up to 24 hours while the management app is down, and drops events that have started at every call. `getFeed()` never throws: its `status` is `ok`, `no_events`, `error` or `missing_config`.

**4. The screen route**, `app/api/screen/events/route.ts`, cached for 60 seconds:

```ts
import { NextResponse } from 'next/server';
import type { ScreenFeed } from '@anchor-nights/kit/events';
import { eventsFeed } from '@/lib/events-feed';

// Dynamic so the build never calls the management app; the CDN caches it instead.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<ScreenFeed>> {
  return NextResponse.json(await eventsFeed.getFeed(), {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
```

**5. The TV** (a client component; the server page can pass `await eventsFeed.getFeed()` as the first feed):

```tsx
'use client';
import { buildIdlePlaylist, buildThankYouPlaylist, PromoSlide, SlideLoop, useScreenFeed } from '@anchor-nights/kit/promo';

const feed = useScreenFeed(initialFeed, { refreshKey: phase, onError: (err) => logError('tv:events', err) });
const slides = nightOver
  ? buildThankYouPlaylist({ feed, nowMs, sessionDate, reviewUrl: REVIEW_SHORT_LINK, hideReview, hideNext })
  : buildIdlePlaylist({ feed, nowMs, sessionDate, channel: 'pre_event_screen', lead: { id: 'join' } });

<SlideLoop
  slides={slides}
  renderSlide={(slide) => (
    <PromoSlide slide={slide} nowMs={nowMs} nextNightLabel="Next quiz night" renderApp={() => <JoinSlide />} />
  )}
/>
```

Playlist options:

| Builder | Options |
|---|---|
| `buildIdlePlaylist` | `feed`, `nowMs` (the screen's clock), `channel` (`pre_event_screen` before the night, `in_game_screen` on a break, `post_event_screen` after it and when idle; the default), `sessionDate` (London `YYYY-MM-DD` of tonight's game, so the next night is never tonight's), `lead` (`{ id, durationMs? }`, the app's join or follow-along slide; without it the what's-on slide leads). Order: lead, next night, two events, lead, what's on, two events, and round. |
| `buildThankYouPlaylist` | `feed`, `nowMs`, `reviewUrl` (the app's own short link to `https://l.the-anchor.pub/feedback`; anything that is not an https the-anchor.pub link, such as a Google URL, shows no review card), `sessionDate`, `channel` (default `post_event_screen`), `hideReview` and `hideNext` (the host may hide a card for the night, never type one). Order: thank you, then the next two events in turn. |

Timings: 12 seconds for an event or the next night, 20 seconds for every other slide.

Slide props (each also available on its own):

| Slide | Props |
|---|---|
| `PromoSlide` | `slide`, `nowMs`, `nextNightLabel` ("Next quiz night"), `renderApp(slide)` for `app` slides, optional `eventEyebrow` (default "Coming up at The Anchor"), `whatsOnHeadline` (default "What's on at The Anchor"), `thankYou` (`kicker`, `headline` default "Thanks for coming", `tagline` default "Where everyone's welcome"), `imageSrc`. |
| `EventSlide` | `event`, `qrUrl`, `nowMs`, `eyebrow?`, `imageSrc?` (defaults to Next's optimiser, capped at 1200 pixels wide). |
| `NextNightSlide` | `event`, `qrUrl`, `nowMs`, `label`, `imageSrc?`. |
| `WhatsOnSlide` | `headline?`, `url?` (default `https://www.the-anchor.pub/whats-on`). |
| `ReviewSlide` | `url` (draws nothing unless it is an Anchor link). |
| `ThankYouSlide` | `reviewUrl`, `nextNight`, `nextNightQr`, `hideNext?`, `nowMs`, `kicker?`, `headline?`, `tagline?`. "What's on next" shows the next night's name, its date in London time and its booking QR; with nothing from the feed (or a date that cannot be formatted) it shows "See what's on" with the what's-on QR. It never prints a typed or placeholder date. |

Event QR codes use the event's management short link for the playlist's channel when there is one, otherwise `https://www.the-anchor.pub/events/<slug>?utm_source=<app>&utm_medium=screen`.

Guest phones (spec S7.7) can use the same pieces: `selectNextOfFormat(feed.nights, feed.categorySlug, Date.now())` and `isAllowedReviewUrl` from `@anchor-nights/kit/events/shared`.

## Sign-in adoption (spec K5, auth standard v2.3)

The `auth` module is the workspace auth standard (`.claude/docs/auth-standard.md` v2.3) for the four game nights: email and password only, invite only, roles `admin`, `host` and `pending` from `profiles.role`. The kit never makes a Supabase client or reads a key: every factory takes the app's own clients.

| Import | Where it runs | What it gives you |
|---|---|---|
| `@anchor-nights/kit/auth` | **Server only** | `defineAuthConfig`, `readAuthEnv`, `createAuthActions` (signIn, signOut, requestPasswordReset, confirmRecovery, resetPassword, changePassword, acceptInvite), `createAdminActions` (issueInvite, cancelInvite, changeRole, deactivateUser, reactivateUser, revokeSessions, changeEmail, listInvites, listStaff), `createAuthMaintenance` (pruneAuthData, reconcileInvites), `createAuthHelpers` (getCurrentUser, getCurrentRole, requireAuth, requireRole, authorise, authoriseRoute), `validatePassword`, `createHibpChecker`, `verifyTurnstile`, `isSameOriginRequest`, the limiter and the auditor, and everything in `auth/shared`. |
| `@anchor-nights/kit/auth/shared` | Anywhere | `toAppRole`, `roleSatisfies`, `safeNextPath`, `AuthFormState`, `AUTH_MESSAGES`, `DEFAULT_AUTH_PATHS`, the password limits, `CAPTCHA_FIELD`, `TURNSTILE_ACTIONS`. |
| `@anchor-nights/kit/auth/screens` | Client components | `SignInScreen`, `PendingScreen`, `ForgotPasswordScreen`, `ConfirmRecoveryScreen`, `ResetPasswordScreen`, `AcceptInviteScreen`, `ChangePasswordForm`, `SignOutButton`, `InvitePanel`, `StaffPanel`, `TurnstileWidget`, `AuthShell`. |
| `@anchor-nights/kit/auth/proxy` | `proxy.ts` | `createAuthProxy({ supabaseUrl, supabaseKey, routes, homeForRole })`. |
| `@anchor-nights/kit/auth/headers` | `next.config.ts` (plain JS) | `securityHeaders`, `buildContentSecurityPolicy`, `TURNSTILE_ORIGIN`. |
| `@anchor-nights/kit/auth/sql` | Node (plain JS) | `renderAuthMigrations`, `renderActiveStaffGate`, `authMigrationFiles`, `ACTIVE_STAFF_GATE_AUDIT_SQL`; the CLI is `src/auth/sql/print.js`. |

The app needs `@supabase/supabase-js` 2.101 or later and `@supabase/ssr` 0.10 or later (Cash Bingo is on `@supabase/ssr` 0.8 and must upgrade first).

### 1. Environment

Add `...AUTH_ENV` to `validateBuildEnv` in `next.config.ts` (beside `SUPABASE_PUBLIC_ENV`), and call `readAuthEnv()` where the server builds its config. Every one is required on every build:

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | As now. |
| `SUPABASE_SERVICE_ROLE_KEY` | The admin client. Server only. |
| `NEXT_PUBLIC_APP_URL` | The app's own origin, per environment. Reset and invite links are built on it. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | The shared Turnstile widget (one widget, all four hostnames). |
| `AUDIT_HMAC_KEY` | `v1:` then `openssl rand -base64 48`. Pseudonymises emails in the audit. One per app, never shared. |

### 2. Migrations, in this order

```bash
node node_modules/@anchor-nights/kit/src/auth/sql/print.js \
  --profile-id user_id \                # Quiz Night: user_id. Cash Bingo: id. A project with no profiles table: id.
  --gate sessions,game_states \         # every public table the authenticated role can reach
  --out supabase/migrations --timestamp 20261110120000
```

That writes six files: `kit_auth_profiles_and_gate`, `kit_auth_audit`, `kit_auth_invites`, `kit_auth_recovery_grants`, `kit_auth_hooks_and_retention`, `kit_auth_active_staff_gate`. Apply them in that order through `prod-migrate`. Each is safe to apply twice. Then run `ACTIVE_STAFF_GATE_AUDIT_SQL` in the app's own replay test and expect no rows: any table it lists is reachable by a deactivated or pending account.

What they add: `deactivated_at` on `profiles` (the table is created only if absent), `is_active_staff()`, `is_active_admin()`, `current_staff_role()`, the `kit_profiles_guard` trigger (nobody signed in can change their own role or access), and the tables `auth_audit`, `invites` and `recovery_grants` with their `kit_*` functions. Every function is `SECURITY DEFINER` with an empty `search_path`; execute is revoked from `public` and `anon` and granted only where needed.

### 3. Server Actions

Next needs `'use server'` in the app, so each app has one small file:

```ts
// src/app/auth/actions.ts
'use server';
import { cookies, headers } from 'next/headers';
import { createAuthActions, defineAuthConfig, readAuthEnv, type AuthFormState } from '@anchor-nights/kit/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reportError } from '@anchor-nights/kit/errors';

const env = readAuthEnv();
const config = defineAuthConfig({
  app: 'anchor-quiz',
  environment: process.env.VERCEL_ENV ?? 'development',
  appUrl: env.NEXT_PUBLIC_APP_URL,
  auditHmacKey: env.AUDIT_HMAC_KEY,
  homeForRole: { admin: '/admin', host: '/host' },
  // Every alert is reported; a 'high' one must also reach a person (the app's own route).
  alert: (a) => reportError({ scope: `auth:${a.kind}` }, new Error(a.message), { app: 'anchor-quiz' }),
});
const auth = createAuthActions({ config, serverClient: createClient, adminClient: createAdminClient, cookies, headers });

export async function signIn(prev: AuthFormState, fd: FormData) { return auth.signIn(prev, fd); }
export async function signOut() { return auth.signOut(); }
// ...and the same one-liner for requestPasswordReset, confirmRecovery, resetPassword, changePassword, acceptInvite.
```

`createAdminActions({ ...sameDeps, profileIdColumn: 'user_id' })` the same way for the admin page, and `createAuthHelpers({ config, serverClient: createClient, redirect })` for pages (`requireRole(['admin'])`) and Route Handlers (`authoriseRoute`).

### 4. Pages

| Route | Page |
|---|---|
| `/login` | `<SignInScreen action={signIn} turnstileSiteKey={...} next={searchParams.next} />` |
| `/pending` | `<PendingScreen signOutAction={signOut} email={user?.email} />` |
| `/forgot-password` | `<ForgotPasswordScreen action={requestPasswordReset} turnstileSiteKey={...} />` |
| `/auth/confirm` | `<ConfirmRecoveryScreen action={confirmRecovery} tokenHash={searchParams.token_hash} type={searchParams.type} />` (opening it does nothing; Continue POSTs) |
| `/auth/reset-password` | `<ResetPasswordScreen action={resetPassword} />` |
| `/invite` | `<AcceptInviteScreen action={acceptInvite} turnstileSiteKey={...} />` (reads `#t=` from the fragment) |
| admin page | `<InvitePanel>` and `<StaffPanel>` with the admin actions and `listInvites()` and `listStaff()` |

Remove any `/register` or sign-up route (it must 404). Put `<ChangePasswordForm>` and `<SignOutButton>` wherever the app's account menu is.

### 5. Proxy and headers

```ts
// src/proxy.ts
import { createAuthProxy } from '@anchor-nights/kit/auth/proxy';
export const proxy = createAuthProxy({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  routes: [{ prefix: '/admin', roles: ['admin'] }, { prefix: '/host', roles: ['admin', 'host'] }, { prefix: '/api/admin', roles: ['admin'] }],
  homeForRole: { admin: '/admin', host: '/host' },
});
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp)$).*)'] };
```

In `next.config.ts`: `headers: async () => [{ source: '/:path*', headers: securityHeaders({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, cspMode: 'report-only' }) }]`. Move to `cspMode: 'enforce'` after two weeks of clean reports.

### 6. Daily cron

One route protected by the app's `CRON_SECRET` (never callable from a browser) calling `createAuthMaintenance({ config, adminClient }).pruneAuthData()` and `.reconcileInvites()`. Retention: sign-in telemetry 12 months, other audit events 6 years, finished invites 12 months.

### 7. Supabase dashboard checklist (per project, per environment)

- **Authentication, Sign In / Providers:** Allow new users to sign up OFF. Anonymous sign-ins OFF. Every provider except Email OFF. Email: Secure password change OFF; minimum password length 12.
- **Authentication, Sessions:** JWT expiry 900 seconds (15 minutes). Inactivity timeout OFF. Time-box user sessions OFF. Single session per user OFF.
- **Authentication, Attack Protection:** CAPTCHA ON, provider Turnstile, with `TURNSTILE_SECRET_KEY`. Break-glass: switch it off only during a verified Turnstile outage and back on within 24 hours (a sign-in with no token raises a high alert).
- **Authentication, Hooks:** Before User Created hook ON, Postgres function `public.kit_before_user_created`. (The Send Email Hook stays OFF; see Decisions.)
- **Authentication, URL Configuration:** Site URL exactly the app origin. Redirect URLs: only the exact `/auth/confirm` URL for each environment, no wildcards in production.
- **Authentication, Emails, SMTP:** custom SMTP ON with the shared sender (SPF, DKIM, DMARC; no click tracking).
- **Authentication, Emails, Templates:** Reset password active, linking to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`, saying the link lasts 60 minutes. Magic link and Confirm signup neutered: plain text with no link and no code. Change email active. Invite unused (the kit's invites are copied links). Email OTP expiry 3600 seconds.

Negative proofs to record per app: a sign-up request creates no user; a magic link request sends nothing usable; `/auth/confirm` refuses `type=magiclink`; a deactivated host's still-valid JWT reads no rows.

### Decisions and limits

- **No Send Email Hook.** The standard's primary passwordless control is a Send Email Hook rejecting magic link and sign-up mail. In Supabase that hook replaces Auth's own sending, so with it on, reset emails would need an email service the apps do not have. The kit uses three layers instead: the Before User Created hook (no account is ever created outside an invite acceptance), neutered magic link and sign-up templates (nothing usable is sent), and a recovery-only `/auth/confirm`. An existing staff member can still be sent a neutered magic link email.
- **Breach check fails open** with a `breach_check_unavailable` audit event, as standard section 12 says. Length rules always apply.
- **Forgot password** answers the same for an unknown address, a cooldown and a Supabase limit, but shows an error when the email could not be sent or a dependency is down (fail closed).
- **Reset limits** (one request per address a minute, 20 per IP in 15 minutes) are the kit's own; the standard fixes only the sign-in limits.
- **Invites are copied links** (`/invite#t=<token>`, 7 days, one use, a resend cancels the old one) sent by text or WhatsApp. The token is in the fragment, so it never reaches a server log.
- **Audit table** is `auth_audit`. An app that wants its main audit table instead passes `auditSink`, and must then pass its own `limiter`, because the default limiter counts failures in `auth_audit`.
- **Alerts** (a sign-in with no CAPTCHA token, an orphaned invite user, a failed ban) go to the app's `alert` handler; reaching a person, and repeating daily, is the app's job.
- **Admin email change** tells both addresses only if the app passes `notifyEmailChange`; otherwise the admin is told to.

## Release rule

A release is a git tag (`v1.0.0`, `v1.1.0`, ...). Each app moves to a new tag in its own PR, one app at a time, never all at once. A breaking change is a new major version.

## Development

```bash
nvm use            # Node 24
npm ci
npm run verify     # lint (zero warnings), typecheck, tests under Europe/London and under UTC
npm run test:db    # replays the auth migration templates on a throwaway Postgres 17 (needs initdb, pg_ctl, psql)
```
