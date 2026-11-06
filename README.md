# @anchor-nights/kit

The shared kit for The Anchor's game nights (Quiz Night, Cash Bingo, Music Bingo, Tasting Night): the look, the TV plumbing and the small engineering pieces every app needs. TypeScript source, no build step, installed from a git tag. Public repository: no secrets and no game logic live here.

## Adopting it in an app

Next.js 16, React 19, Tailwind CSS 4, Node 24.

**1. `package.json`**

```json
"@anchor-nights/kit": "github:peterjpitcher/OJ-AnchorNights-kit#v1.0.0"
```

The kit expects `react` and `react-dom` 19, `lucide-react` 1.49 or later, and (optionally) `next` 16 in the app. It brings `clsx`, `tailwind-merge` and `qrcode.react` itself.

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

## Release rule

A release is a git tag (`v1.0.0`, `v1.1.0`, ...). Each app moves to a new tag in its own PR, one app at a time, never all at once. A breaking change is a new major version.

## Development

```bash
nvm use            # Node 24
npm ci
npm run verify     # lint (zero warnings), typecheck, tests under Europe/London and under UTC
```
