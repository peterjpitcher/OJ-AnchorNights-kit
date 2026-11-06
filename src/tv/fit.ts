// Fitting rules for TV text, generalised from Quiz Night's
// src/lib/display/tvText.ts (buildTvFitSteps and questionLayoutFits). The
// question types and their sizes stay in Quiz Night; what is shared is the
// method: a screen starts at its target sizes and steps down one notch at a
// time, least important text first, only when its content does not fit, and
// never below the floors.

/** A size, in canvas pixels, for each kind of text on a screen. */
export type FitSizes<K extends string> = Record<K, number>;

export interface FitStepsInput<K extends string> {
  /** Where every kind of text starts. */
  start: FitSizes<K>;
  /** The smallest each may go. A floor above its start is treated as the start. */
  floor: FitSizes<K>;
  /** How far each steps down per notch. */
  step: FitSizes<K>;
  /**
   * Which text gives way first, in groups. Within a group the kinds take
   * turns a notch at a time, so a crowded screen never ends with one kind
   * huge and another at its floor. Kinds not listed never shrink.
   */
  shrinkOrder: ReadonlyArray<ReadonlyArray<K>>;
}

/**
 * Every size set a screen may try, largest first. Step 0 is the starts and
 * each later step is one notch smaller on one kind of text. Keep the result
 * well under React's 50 nested updates: useFitStep advances one step per
 * layout pass.
 */
export function buildFitSteps<K extends string>({ start, floor, step, shrinkOrder }: FitStepsInput<K>): Array<FitSizes<K>> {
  const floors = { ...floor };
  for (const key of Object.keys(start) as K[]) floors[key] = Math.min(start[key], floor[key]);

  const steps: Array<FitSizes<K>> = [{ ...start }];
  let current: FitSizes<K> = { ...start };
  for (const group of shrinkOrder) {
    let shrinking = group.filter((key) => step[key] > 0 && current[key] > floors[key]);
    while (shrinking.length > 0) {
      for (const key of shrinking) {
        current = { ...current, [key]: Math.max(floors[key], current[key] - step[key]) };
        steps.push(current);
      }
      shrinking = shrinking.filter((key) => current[key] > floors[key]);
    }
  }
  return steps;
}

export interface LayoutMetrics {
  /** Inner height of the content area, padding included. 0 when not laid out. */
  containerHeight: number;
  paddingBottom: number;
  /** Bottom edge of the lowest content, measured from the top of the content area. */
  contentBottom: number;
  /**
   * Top edge of the highest content, measured the same way. Negative when
   * content spills above the area (a centred column that has grown too
   * tall). Optional: left out, only the bottom is checked.
   */
  contentTop?: number;
  /** Space left for something that needs a minimum (a picture), with that minimum. */
  reserved?: ReadonlyArray<{ height: number; min: number }>;
}

/**
 * Whether a laid-out screen fits: its content stays inside the area (with a
 * pixel of rounding at each edge), its lowest content clears the bottom
 * padding, and everything that needs a minimum height has it. Nothing laid
 * out (a test, a hidden tab) counts as fitting.
 */
export function layoutFits({ containerHeight, paddingBottom, contentBottom, contentTop = 0, reserved = [] }: LayoutMetrics): boolean {
  if (containerHeight <= 0) return true;
  if (contentTop < -1) return false;
  if (contentBottom > containerHeight - paddingBottom + 1) return false;
  return reserved.every(({ height, min }) => height >= min);
}

/**
 * How much an element is drawn larger or smaller than its own layout size:
 * its on-screen height (getBoundingClientRect, which includes every CSS
 * transform above it, such as the Stage's scale) over its layout height
 * (offsetHeight, which does not). 1 when either is 0, so a hidden element
 * never divides by zero.
 */
export function drawnScale(drawnHeight: number, layoutHeight: number): number {
  if (!(drawnHeight > 0) || !(layoutHeight > 0)) return 1;
  return drawnHeight / layoutHeight;
}

/**
 * Reads LayoutMetrics off an element, in its own layout pixels: its height
 * and bottom padding, and the highest and lowest edges of its descendants.
 * For a `fits` callback:
 *
 *   useFitStep(ref, steps.length, (el) => layoutFits(measureLayout(el)), key)
 *
 * Inside a scaled Stage the descendants' on-screen rectangles are divided by
 * the element's drawn scale, so every figure is in canvas pixels whatever
 * the size of the TV. Elements with no size (display: none, an empty span)
 * are skipped.
 */
export function measureLayout(element: HTMLElement): LayoutMetrics {
  const box = element.getBoundingClientRect();
  const scale = drawnScale(box.height, element.offsetHeight);
  const paddingBottom = Number.parseFloat(getComputedStyle(element).paddingBottom) || 0;
  let contentTop = 0;
  let contentBottom = 0;
  for (const child of Array.from(element.querySelectorAll<HTMLElement>('*'))) {
    const rect = child.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const top = (rect.top - box.top) / scale;
    const bottom = (rect.bottom - box.top) / scale;
    if (top < contentTop) contentTop = top;
    if (bottom > contentBottom) contentBottom = bottom;
  }
  return { containerHeight: element.clientHeight, paddingBottom, contentBottom, contentTop };
}
