'use client';
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * From Quiz Night (src/lib/display/useFitStep.ts), unchanged.
 *
 * Picks the first of `stepCount` size steps at which `fits` passes, by
 * advancing one step per layout pass. Layout effects run before the browser
 * paints, so the room only ever sees the final size.
 *
 * `contentKey` restarts the search from step 0 when the content changes. The
 * search also restarts once web fonts finish loading, because the fallback
 * font measures differently. Keep `fits` stable (useCallback or a module
 * function), or the search re-runs every render.
 *
 * Inside a Stage, measure in canvas pixels: measureLayout does (since 2.0.1),
 * and a `fits` of an app's own should use offsetWidth and offsetHeight, or
 * divide getBoundingClientRect by the drawn scale, never mix the two.
 */
export function useFitStep(
  ref: RefObject<HTMLElement | null>,
  stepCount: number,
  fits: (element: HTMLElement) => boolean,
  contentKey: string,
): number {
  const [fontsVersion, setFontsVersion] = useState(0);
  const fitKey = `${contentKey}|${fontsVersion}`;
  const [fit, setFit] = useState({ key: fitKey, step: 0 });
  const step = fit.key === fitKey ? fit.step : 0;

  // Each new step or new content is a new layout to check.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || step >= stepCount - 1 || fits(element)) return;
    setFit({ key: fitKey, step: step + 1 });
  }, [ref, step, stepCount, fits, fitKey]);

  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts || fonts.status === 'loaded') return;
    let live = true;
    void fonts.ready.then(() => {
      if (live) setFontsVersion((version) => version + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  return step;
}
