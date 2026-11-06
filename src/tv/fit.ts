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
  /** Space left for something that needs a minimum (a picture), with that minimum. */
  reserved?: ReadonlyArray<{ height: number; min: number }>;
}

/**
 * Whether a laid-out screen fits: its lowest content clears the bottom
 * padding (with a pixel of rounding), and everything that needs a minimum
 * height has it. Nothing laid out (a test, a hidden tab) counts as fitting.
 */
export function layoutFits({ containerHeight, paddingBottom, contentBottom, reserved = [] }: LayoutMetrics): boolean {
  if (containerHeight <= 0) return true;
  if (contentBottom > containerHeight - paddingBottom + 1) return false;
  return reserved.every(({ height, min }) => height >= min);
}

/**
 * Reads LayoutMetrics off an element: its height and bottom padding, and
 * the lowest bottom edge of its descendants. For a `fits` callback:
 *
 *   useFitStep(ref, steps.length, (el) => layoutFits(measureLayout(el)), key)
 */
export function measureLayout(element: HTMLElement): LayoutMetrics {
  const box = element.getBoundingClientRect();
  const paddingBottom = Number.parseFloat(getComputedStyle(element).paddingBottom) || 0;
  let contentBottom = 0;
  for (const child of Array.from(element.querySelectorAll<HTMLElement>('*'))) {
    const bottom = child.getBoundingClientRect().bottom - box.top;
    if (bottom > contentBottom) contentBottom = bottom;
  }
  return { containerHeight: element.clientHeight, paddingBottom, contentBottom };
}
