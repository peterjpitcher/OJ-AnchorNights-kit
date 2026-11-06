import * as React from 'react';
import { cn } from './cn';

export interface DockProps {
  /**
   * What to do now: one primary action (a Button size="xl" or a
   * HoldButton), with an UndoSlot or a row of secondary pills above it.
   */
  children: React.ReactNode;
  /** Tabs under the actions, if the console has them. Rendered inside a <nav>. */
  nav?: React.ReactNode;
  /** Names the nav for screen readers. */
  navLabel?: string;
  /** The column's width: phone first (max-w-md) by default; Music Bingo's laptop console passes a wider one. */
  widthClassName?: string;
  className?: string;
}

/**
 * The host console's thumb zone (spec S4.1), from Tasting Night: the action
 * for the moment, then the tabs, pinned to the foot of the screen so they
 * never move. It clears the phone's home bar. The page under it needs
 * bottom padding at least as tall as the dock (DOCK_PAGE_PADDING is a
 * starting point for one action and a tab row).
 */
export function Dock({ children, nav, navLabel = 'Console', widthClassName = 'max-w-md', className }: DockProps): React.ReactElement {
  return (
    <div className={cn('fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg', className)}>
      <div className={cn('mx-auto flex w-full flex-col gap-3 px-5 pt-3', widthClassName, !nav && 'pb-[max(20px,env(safe-area-inset-bottom))]')}>
        <div className="flex flex-col gap-3">{children}</div>
        {nav ? (
          <nav aria-label={navLabel} className="border-t border-line pt-2 pb-[max(20px,env(safe-area-inset-bottom))]">
            {nav}
          </nav>
        ) : null}
      </div>
    </div>
  );
}

/** Bottom padding for the page under a Dock with one action and a tab row. */
export const DOCK_PAGE_PADDING = 'pb-[calc(220px+env(safe-area-inset-bottom))]';
