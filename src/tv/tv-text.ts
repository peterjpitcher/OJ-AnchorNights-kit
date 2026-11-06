// Text sizes for the pub TV, from Cash Bingo (src/components/display/tv-text.ts).
// The sizes are the `--text-tv-*` tokens in tokens.css; this is how a screen
// uses them.
//
// Use tvText() rather than writing `text-tv-*` into cn(): it merges the other
// classes and adds the size afterwards, so the size is always present
// whatever else is passed. Whole class names only: Tailwind cannot see a
// class built at runtime.
import { cn, type ClassValue } from '../ui/cn';

export type TvTextSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';

const TV_TEXT_CLASS: Record<TvTextSize, string> = {
  // Any text: 32px at 1920x1080, 22px at 1280x720. The floor.
  xs: 'text-tv-xs',
  // Second lines under a headline or title: 38px and 26px.
  sm: 'text-tv-sm',
  // Key information (prize, stage, verdicts): 44px and 30px.
  base: 'text-tv-base',
  // Slide and card titles: 56px and 37px.
  lg: 'text-tv-lg',
  // Screen headlines: 70px and 47px.
  xl: 'text-tv-xl',
  // A headline that is the whole slide: 86px and 58px.
  '2xl': 'text-tv-2xl',
  // A long headline that is the whole screen: 119px and 79px.
  '3xl': 'text-tv-3xl',
  // The one width-based size: 144px and 128px.
  '4xl': 'text-tv-4xl',
};

/** A TV text size plus any other classes, merged safely. */
export function tvText(size: TvTextSize, ...classes: ClassValue[]): string {
  const rest = cn(...classes);
  return rest ? `${TV_TEXT_CLASS[size]} ${rest}` : TV_TEXT_CLASS[size];
}

/** The kicker (section label) at the TV floor size instead of its 12px. */
export const TV_KICKER_CLASS = tvText('xs', 'kicker');
