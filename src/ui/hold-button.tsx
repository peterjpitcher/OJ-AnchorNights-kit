'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { cn } from './cn';
import { HOLD_DONE_MS, HOLD_MS, holdDoneLabel, holdProgress, holdSucceeded } from './hold';

export interface HoldButtonProps {
  /** What the hold does, as the host reads it: "Hold to end the night". */
  label: string;
  /**
   * Runs once the hold is full. Return false (or a promise of false, or
   * throw) when it was refused: the button goes back to its hold face and
   * never shows the check mark, so a refused action never looks done.
   * Returning nothing counts as done.
   */
  onDone: () => void | boolean | Promise<boolean | void>;
  /** Red ring and fill, for steps that cannot be taken back. */
  danger?: boolean;
  /** Height in pixels. 44 sits in a row beside other pills; 64 is the dock's main action. */
  size?: 44 | 56 | 64;
  disabled?: boolean;
  /** How long the hold takes to fill. */
  holdMs?: number;
  className?: string;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Press and hold, for anything the room cannot take back (spec S4.2), from
 * Tasting Night's console. A fill grows left to right over 1.2 seconds, and
 * a second copy of the words in the fill's ink is revealed with it. Let go
 * early and it drains back over 300ms. Reduced motion: it fills in fifths.
 * Once full it waits for onDone, and shows the check mark only when that did
 * not refuse.
 *
 * Keyboard: hold Space or Enter. Letting go early cancels, as with a finger.
 */
export function HoldButton({
  label,
  onDone,
  danger = false,
  size = 64,
  disabled = false,
  holdMs = HOLD_MS,
  className,
}: HoldButtonProps): React.ReactElement {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [draining, setDraining] = useState(false);
  const frame = useRef<number | null>(null);
  const started = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const stop = (): void => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    };
  }, []);

  const start = (): void => {
    if (disabled || done || pending || frame.current !== null) return;
    setDraining(false);
    started.current = performance.now();
    const inFifths = prefersReducedMotion();
    const tick = (time: number): void => {
      const elapsed = time - started.current;
      setProgress(holdProgress(elapsed, holdMs, inFifths));
      if (elapsed >= holdMs) {
        frame.current = null;
        setPending(true);
        void holdSucceeded(onDone).then((ok) => {
          if (!mounted.current) return;
          setPending(false);
          // Refused: back to the hold face. The caller says why.
          if (!ok) {
            setProgress(0);
            return;
          }
          setDone(true);
          // Ready again after a moment, in case the same step comes round.
          resetTimer.current = setTimeout(() => {
            if (!mounted.current) return;
            setDone(false);
            setProgress(0);
          }, HOLD_DONE_MS);
        });
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const cancel = (): void => {
    if (done || pending || frame.current === null) return;
    stop();
    setDraining(true);
    setProgress(0);
  };

  const tone = danger ? 'border-anchor-danger' : 'border-accent';
  const fill = danger ? 'bg-anchor-danger text-white' : 'bg-accent text-on-accent';
  const text = size === 44 ? 'px-3 text-base' : 'px-6 text-lg';
  const face = `absolute inset-0 flex items-center justify-center gap-2 text-center font-semibold leading-tight ${text}`;

  if (done || pending) {
    return (
      <button
        type="button"
        disabled
        aria-busy={pending}
        className={cn('flex w-full items-center justify-center gap-2 rounded-full font-semibold', text, fill, className)}
        style={{ minHeight: size }}
      >
        {pending ? <LoaderCircle size={20} className="motion-safe:animate-spin" aria-hidden /> : <Check size={20} aria-hidden />}{' '}
        {holdDoneLabel(label)}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${label}. Press and hold.`}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') cancel();
      }}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className={cn('relative w-full select-none overflow-hidden rounded-full border-2 disabled:opacity-50', tone, className)}
      style={{ minHeight: size, touchAction: 'none' }}
    >
      <span className={`${face} text-fg`}>{label}</span>
      <span
        aria-hidden
        className={cn(face, fill, draining && 'transition-[clip-path] duration-300')}
        style={{ clipPath: `inset(0 ${100 - progress * 100}% 0 0)` }}
      >
        {label}
      </span>
    </button>
  );
}
