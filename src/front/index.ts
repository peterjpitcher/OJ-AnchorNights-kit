// @anchor-nights/kit/front: the shared front page (spec S2.3), from Cash
// Bingo's src/app/page.tsx. No hostnames: the app passes its own links and
// its sister nights' URLs.
export { FrontPage, FRONT_DEFAULTS, copyrightText, type FrontPageProps, type FrontTile } from './front-page';
export { buildOtherNights, NIGHT_KEYS, NIGHT_LABELS, safeNightUrl, type NightKey, type OtherNight } from './nights';
