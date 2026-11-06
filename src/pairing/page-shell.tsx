import * as React from 'react';
import type { TvDevice, TvView } from './shared';
import { TvNotice } from './screens/tv-notice';
import { TvPairingScreen, type TvPairingScreenProps } from './screens/tv-pairing-screen';

export interface TvPageShellProps<Game> {
  /** From createTvPairing(...).resolveTvView(). */
  view: TvView<Game>;
  /** Paired, with a game tonight: the app's display. */
  renderGame: (game: Game, device: TvDevice, rehearsal: boolean) => React.ReactNode;
  /** Paired, nothing tonight: the app's idle loop. */
  renderIdle: (device: TvDevice) => React.ReactNode;
  /** Passed to the pairing code screen. */
  pairing?: TvPairingScreenProps;
  /** Instead of the default "Reconnecting" notice, which reloads after 30 seconds. */
  renderUnavailable?: (reason: 'device_lookup' | 'resolver') => React.ReactNode;
  logoSrc?: string;
}

/** How long the reconnecting notice waits before it reloads. */
export const TV_RETRY_RELOAD_MS = 30_000;

/**
 * The /tv page (spec S3.1, S3.2). Server-renderable: pass it the view and
 * the app's own screens. Unpaired shows the code; an outage shows a notice
 * and retries, never the game and never a pairing code (a paired TV must not
 * look unpaired because the database blinked).
 */
export function TvPageShell<Game>({ view, renderGame, renderIdle, pairing, renderUnavailable, logoSrc }: TvPageShellProps<Game>): React.ReactElement {
  switch (view.kind) {
    case 'game':
      return <>{renderGame(view.game, view.device, view.rehearsal)}</>;
    case 'idle':
      return <>{renderIdle(view.device)}</>;
    case 'unpaired':
      return <TvPairingScreen logoSrc={logoSrc} {...pairing} />;
    case 'unavailable':
      return renderUnavailable ? (
        <>{renderUnavailable(view.reason)}</>
      ) : (
        <TvNotice
          title="Reconnecting"
          message="The screen could not reach the server. It will try again by itself."
          reloadAfterMs={TV_RETRY_RELOAD_MS}
          logoSrc={logoSrc}
        />
      );
  }
}
