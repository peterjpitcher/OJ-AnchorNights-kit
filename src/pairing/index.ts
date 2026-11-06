// @anchor-nights/kit/pairing: the server half of TV pairing (spec S3.1, S3.2, K5).
//
// Server only: it handles device tokens and the service-role client, and
// imports server-only. The screens are in @anchor-nights/kit/pairing/screens,
// browser-safe helpers and types in @anchor-nights/kit/pairing/shared (all
// re-exported here), and the migration templates in
// @anchor-nights/kit/pairing/sql.
import 'server-only';

export * from './shared';
export {
  createTvPairing,
  cookieFromRequest,
  drawPairingCode,
  type CookieReader,
  type TvDeviceState,
  type TvPairing,
  type TvPairingDeps,
} from './server/pairing';
export { TvPageShell, TV_RETRY_RELOAD_MS, type TvPageShellProps } from './page-shell';
