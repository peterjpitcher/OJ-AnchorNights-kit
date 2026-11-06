# @anchor-nights/kit

The shared kit for The Anchor's game nights (Quiz Night, Cash Bingo, Music Bingo, Tasting Night): the look, the TV plumbing and the small engineering pieces every app needs. TypeScript source, no build step, installed from a git tag.

This is the scaffold release (`v0.1.0`). The modules arrive in `v1.0.0` (tokens, ui, branding, dates, env, errors, qr) and `v1.1.0` (tv).

## Release rule

A release is a git tag. Each app moves to a new tag in its own PR, one app at a time, never all at once.

## Development

```bash
nvm use            # Node 24
npm ci
npm run verify     # lint, typecheck, tests under Europe/London and under UTC
```
