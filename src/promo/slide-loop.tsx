// Plays a playlist: each slide for its duration, then the next, round and
// round. From Cash Bingo (src/components/display/slide-loop.tsx and the
// visibility hook from screen-hooks.ts), for any slide with a key and a
// duration.
//   - It pauses while the page is hidden, and the current slide starts its
//     time again when the page comes back.
//   - With prefers-reduced-motion there is no transition; otherwise each
//     slide fades in.
//   - A new playlist (a different signature) starts again from its first
//     slide. The same playlist rebuilt on a re-render keeps its place: a TV
//     re-renders every second, so the timer depends only on primitives.
//   - `onSlideChange` says which slide is up (null once the loop is gone), in
//     a layout effect, so the screen can hide a corner QR before the browser
//     paints: never two codes on screen, not even for a frame.
'use client';

import * as React from 'react';
import { playlistSignature } from './playlist';

export interface LoopSlide {
  key: string;
  kind: string;
  durationMs: number;
}

export interface SlideLoopProps<T extends LoopSlide> {
  slides: ReadonlyArray<T>;
  renderSlide: (slide: T) => React.ReactNode;
  className?: string;
  /** Must be stable between renders (a state setter, or a useCallback). */
  onSlideChange?: (slide: T | null) => void;
}

// The brand's slow fade (400ms on its ease-out curve).
const FADE_MS = 400;
const FADE_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** True while the page is visible. */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = React.useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  React.useEffect(() => {
    const onChange = (): void => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

function SlideLoopRun<T extends LoopSlide>({ slides, renderSlide, className, onSlideChange }: SlideLoopProps<T>): React.ReactElement | null {
  const [index, setIndex] = React.useState(0);
  const visible = useDocumentVisible();
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const count = slides.length;
  const position = count > 0 ? index % count : 0;
  const slide = count > 0 ? slides[position] : null;
  const durationMs = slide?.durationMs ?? 0;

  React.useLayoutEffect(() => {
    onSlideChange?.(slide);
  }, [slide, onSlideChange]);

  React.useLayoutEffect(() => {
    return () => onSlideChange?.(null);
  }, [onSlideChange]);

  React.useEffect(() => {
    if (!visible || count <= 1 || durationMs <= 0) return;
    const timer = setTimeout(() => setIndex((current) => (current + 1) % count), durationMs);
    return () => clearTimeout(timer);
  }, [visible, count, durationMs, position]);

  React.useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof element.animate !== 'function') return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: FADE_EASING });
  }, [position]);

  if (!slide) return null;
  return (
    <div ref={containerRef} className={className} data-slide-kind={slide.kind}>
      {renderSlide(slide)}
    </div>
  );
}

export function SlideLoop<T extends LoopSlide>(props: SlideLoopProps<T>): React.ReactElement {
  // Keyed by the playlist's content, so a new playlist starts from slide one.
  return <SlideLoopRun key={playlistSignature(props.slides)} {...props} />;
}
