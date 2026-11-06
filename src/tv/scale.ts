// From Quiz Night (src/lib/display/scale.ts).

/** The TV canvas every screen is designed on. */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/**
 * The CSS scale factor that fits a 1920x1080 canvas inside the viewport.
 * Takes the minimum of the width ratio and the height ratio so the whole
 * screen is always visible. On a 16:9 TV, the intended target, this fills
 * the display exactly. On any other aspect ratio (a laptop, a browser window
 * with chrome) it letterboxes rather than cropping the edges.
 */
export function computeScale(vw: number, vh: number): number {
  return Math.min(vw / STAGE_WIDTH, vh / STAGE_HEIGHT);
}
