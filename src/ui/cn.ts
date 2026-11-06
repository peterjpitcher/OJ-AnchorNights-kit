import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The pub TV text sizes, `--text-tv-*` in tokens.css. Keep the two lists in
 * step: a size missing here is read by tailwind-merge as a text colour, so
 * cn('text-tv-base', 'text-white') would silently drop the size (Cash Bingo
 * found this the hard way).
 */
export const TV_FONT_SIZES = ['tv-xs', 'tv-sm', 'tv-base', 'tv-lg', 'tv-xl', 'tv-2xl', 'tv-3xl', 'tv-4xl'] as const;

/**
 * The kit's own radius and shadow names (tokens.css). Unregistered,
 * tailwind-merge does not see `rounded-card` as a radius or `shadow-gold` as
 * a shadow, so cn('rounded-card', 'rounded-full') would keep both and leave
 * the winner to stylesheet order.
 */
export const BRAND_RADII = ['card', 'input'] as const;
export const BRAND_SHADOWS = ['gold', 'lift', 'sheet', 'card', 'field-focus'] as const;

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: [...BRAND_RADII],
      shadow: [...BRAND_SHADOWS],
    },
    classGroups: {
      'font-size': [{ text: [...TV_FONT_SIZES] }],
    },
  },
});

/**
 * Joins class names and resolves Tailwind conflicts, the later class winning.
 * From Cash Bingo's src/lib/utils.ts, with the kit's extra shadow names.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type { ClassValue };
