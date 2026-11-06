'use client';
import React, { useEffect, useState } from 'react';
import { Check, Undo2 } from 'lucide-react';
import { cn } from './cn';

/** How long Undo stays offered after a reversible tap (Tasting Night). */
export const UNDO_MS = 10_000;

export interface UndoSlotProps {
  /** What just happened: "Revealed wine 3". Shown with a tick. */
  done: string;
  /** The button's words: "Undo". */
  label: string;
  /** When the offer ends, as a Date.now() timestamp. */
  until: number;
  onUndo: () => void;
  /** Called once the time is up, so the caller can clear the slot. */
  onGone: () => void;
  /** The whole window, for the draining line. Defaults to UNDO_MS. */
  durationMs?: number;
  className?: string;
}

/**
 * Undo, for a short time after a reversible tap (spec S4.2), from Tasting
 * Night's console. A gold line along its foot drains with the countdown.
 * The "done" line is announced politely to screen readers.
 */
export function UndoSlot({ done, label, until, onUndo, onGone, durationMs = UNDO_MS, className }: UndoSlotProps): React.ReactElement | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(until - now, 0);
  useEffect(() => {
    if (left > 0) return;
    const gone = setTimeout(onGone, 0);
    return () => clearTimeout(gone);
  }, [left, onGone]);
  if (left <= 0) return null;
  const share = durationMs > 0 ? Math.min(left / durationMs, 1) : 0;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <p role="status" className="flex items-center gap-1.5 text-base text-success-text">
        <Check size={16} aria-hidden /> {done}
      </p>
      <button
        type="button"
        onClick={onUndo}
        className="relative flex min-h-11 items-center justify-center gap-2 overflow-hidden rounded-full border-2 border-accent font-semibold text-accent"
      >
        <Undo2 size={20} aria-hidden /> {label} · {Math.ceil(left / 1000)}
        <span aria-hidden className="absolute bottom-0 left-0 h-1 bg-accent" style={{ width: `${share * 100}%` }} />
      </button>
    </div>
  );
}
