// The pure parts of HoldButton, so they are tested without a browser.

/** How long a hold takes to fill (Tasting Night's console). */
export const HOLD_MS = 1200;

/** How long the drained fill takes to run back when the hold is let go early. */
export const HOLD_DRAIN_MS = 300;

/** How long the check mark shows before the button is ready again. */
export const HOLD_DONE_MS = 1500;

/**
 * Runs a hold's action and says whether it worked, so the hold shows its
 * check mark only then. False, a promise of false, or a failure is a
 * refusal. Anything else, nothing returned included, counts as done.
 */
export async function holdSucceeded(onDone: () => unknown): Promise<boolean> {
  try {
    return (await onDone()) !== false;
  } catch {
    return false;
  }
}

/**
 * How full the hold is, 0 to 1, after `elapsedMs`. With reduced motion it
 * moves in fifths rather than smoothly.
 */
export function holdProgress(elapsedMs: number, holdMs: number = HOLD_MS, inFifths = false): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (!(holdMs > 0)) return 1;
  const raw = Math.min(elapsedMs / holdMs, 1);
  return inFifths ? Math.floor(raw * 5) / 5 : raw;
}

/** "Hold to end the night" becomes "End the night" on the done face. */
export function holdDoneLabel(label: string): string {
  return label.replace(/^Hold(?: to|:) /, '').replace(/^./, (c) => c.toUpperCase());
}
