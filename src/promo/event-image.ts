// How a TV loads event artwork. From Cash Bingo
// (src/components/display/event-image.ts): through Next's own image
// optimiser, capped at 1200 pixels wide, so a TV that reports a device pixel
// ratio of 2 never downloads a 4K poster.
//
// What changed: the kit cannot import next/image (next is optional for the
// kit), so the slides draw a plain <img> whose src and srcset point at the
// optimiser directly. The optimiser still checks each URL against the app's
// `images.remotePatterns` (EVENT_IMAGE_REMOTE_PATTERN), so this widens
// nothing. An app without the optimiser passes its own `imageSrc`.

import type { ScreenEventImage } from '../events/types';

/** The widest image the TV asks for. */
export const MAX_EVENT_IMAGE_WIDTH = 1200;

/** The widths offered in srcset; all are in Next's default image sizes. */
export const EVENT_IMAGE_WIDTHS: readonly number[] = Object.freeze([640, 828, 1080, 1200]);

/** Builds an image URL for a width. */
export type EventImageSrc = (url: string, width: number) => string;

/** Next's optimiser at its default path and its only default quality (75). */
export const nextImageSrc: EventImageSrc = (url, width) =>
  `/_next/image?url=${encodeURIComponent(url)}&w=${Math.min(width, MAX_EVENT_IMAGE_WIDTH)}&q=75`;

/** The srcset for an image. */
export function eventImageSrcSet(url: string, imageSrc: EventImageSrc = nextImageSrc): string {
  return EVENT_IMAGE_WIDTHS.map((width) => `${imageSrc(url, width)} ${width}w`).join(', ');
}

/**
 * The `sizes` hint, matching the boxes in event-slide.tsx: a square is up to
 * 36vw wide; a landscape box is 16:9 at up to about 66vh tall, so about 118vh
 * wide.
 */
export function eventImageSizes(image: ScreenEventImage): string {
  return image.square ? '36vw' : '118vh';
}
