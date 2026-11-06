# @anchor-nights/kit

The shared kit for The Anchor's game nights (Quiz Night, Cash Bingo, Music Bingo, Tasting Night): the look, the TV plumbing and the small engineering pieces every app needs. TypeScript source, no build step, installed from a git tag. Public repository: no secrets and no game logic live here.

## Adopting it in an app

Next.js 16, React 19, Tailwind CSS 4, Node 24.

**1. `package.json`**

```json
"@anchor-nights/kit": "github:peterjpitcher/OJ-AnchorNights-kit#v1.2.0"
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

## Release rule

A release is a git tag (`v1.0.0`, `v1.1.0`, ...). Each app moves to a new tag in its own PR, one app at a time, never all at once. A breaking change is a new major version.

## Development

```bash
nvm use            # Node 24
npm ci
npm run verify     # lint (zero warnings), typecheck, tests under Europe/London and under UTC
```
