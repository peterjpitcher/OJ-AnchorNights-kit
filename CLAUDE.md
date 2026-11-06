# CLAUDE.md, @anchor-nights/kit

The shared kit for The Anchor's game nights: Quiz Night, Cash Bingo, Music Bingo and Tasting Night. It holds the look (tokens and UI primitives), the TV plumbing, and small engineering pieces (dates, env checks, error reporting, QR origin guard). The spec is `tasks/2026-11-06-anchor-nights-standard-spec.md` in the workspace (sections 4 and 6.1).

Workspace rules in `/Users/peterpitcher/Cursor/CLAUDE.md` apply. This file adds:

## Rules

- **Public repository.** No secrets, no keys, no tokens, no `.env` files, no customer data. A test guards against key-shaped strings.
- **No game logic.** Nothing about questions, bingo numbers, pours, scores or prizes. If it only makes sense in one app, it stays in that app.
- **No direct database access.** Anything that needs Supabase takes the app's own client as an argument.
- **TypeScript source, no build step.** Apps list the kit in `transpilePackages`. Relative imports only (no `@/` aliases), because the kit is compiled inside each app.
- **`src/env/index.js` stays plain JavaScript with no imports**, so an app's `next.config.ts` can load it at build time. Its types live beside it in `index.d.ts`; keep the two in step.
- **Behaviour is extracted, not reinvented.** Code here came from an app where it ran on live nights. Change behaviour only with a reason written in the PR.
- **Colours come from the apps' existing palettes.** Never add a new hex value to `tokens.css`.
- **Dates:** Europe/London explicitly, never `getDay`, `getHours` or `toLocale*` without a time zone.
- British English, no em dashes anywhere (a test checks).

## Releases

A release is a git tag (`v1.0.0`, `v1.1.0`, ...). Bump `version` in `package.json` in the PR that a tag will point at. Apps move to a new tag one at a time, each in its own PR, never all at once. Breaking changes need a major version.

## Commands

`npm run lint` (zero warnings), `npm run typecheck`, `npm test` (Vitest under `TZ=Europe/London`), `npm run test:utc` (the same suite under UTC), `npm run verify` (all four). CI runs all four on Node 24 for every PR and every push to `main`.
