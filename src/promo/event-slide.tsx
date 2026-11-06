// One upcoming event as a TV slide (spec S7.4): the artwork, the title, when
// it is, and a QR code to its page.
//
// From Cash Bingo (src/components/display/event-slide.tsx). What changed: a
// plain <img> through Next's optimiser instead of next/image (event-image.ts
// says why), and the kit's Qr, so an empty or localhost link draws no code.
//   - The artwork is the hero, shown whole, never cropped: a landscape image
//     takes the height the slide has, with the words under it; a square one
//     stands full height beside them.
//   - An image that fails to load turns the slide into a text-only card.
//   - "Tonight" and "7pm" are worked out at render time from the screen's
//     clock in London time, never sent by the server.
'use client';

import * as React from 'react';
import { preload } from 'react-dom';
import { formatEventWhenAndTime } from '../dates';
import type { ScreenEvent, ScreenEventImage } from '../events/types';
import { Qr } from '../qr/qr';
import { TV_KICKER_CLASS, tvText } from '../tv/tv-text';
import { cn } from '../ui/cn';
import { eventImageSizes, eventImageSrcSet, nextImageSrc, MAX_EVENT_IMAGE_WIDTH, type EventImageSrc } from './event-image';

// At least 40% of the screen height: 432px at 1080p, 288px at 720p.
const EVENT_QR_SIZE = 'max(40vh, 288px)';

// Images that failed on this screen, by URL, with when (the screen's clock).
// Each pass of the loop draws a slide afresh, so without this a missing image
// would flash an empty box on every pass. Tried again after half an hour.
const failedImages = new Map<string, number>();
const IMAGE_RETRY_MS = 30 * 60_000;

function isKnownFailed(url: string, nowMs: number): boolean {
  const failedAt = failedImages.get(url);
  return failedAt !== undefined && nowMs - failedAt < IMAGE_RETRY_MS;
}

export interface EventSlideProps {
  event: ScreenEvent;
  /** The QR target, chosen by the playlist for its channel. */
  qrUrl: string;
  /** The screen's clock (epoch milliseconds), for "Tonight" and the like. */
  nowMs: number;
  /** The line above the title. Defaults to "Coming up at The Anchor". */
  eyebrow?: string;
  /** Defaults to Next's image optimiser. */
  imageSrc?: EventImageSrc;
}

export function EventSlide({
  event,
  qrUrl,
  nowMs,
  eyebrow = 'Coming up at The Anchor',
  imageSrc = nextImageSrc,
}: EventSlideProps): React.ReactElement {
  // Remembered by URL, so a failure never carries over to another event's image.
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  const image =
    event.image && event.image.url !== failedUrl && !isKnownFailed(event.image.url, nowMs) ? event.image : null;
  const whenLine = formatEventWhenAndTime(event.startsAt, nowMs);

  const renderImage = (img: ScreenEventImage, boxClass: string): React.ReactElement => (
    <div className={cn('overflow-hidden rounded-card border border-line-gold bg-anchor-green-raised shadow-lift', boxClass)}>
      <img
        src={imageSrc(img.url, MAX_EVENT_IMAGE_WIDTH)}
        srcSet={eventImageSrcSet(img.url, imageSrc)}
        sizes={eventImageSizes(img)}
        alt={img.alt}
        // The slide is on screen whenever it is drawn: no lazy loading.
        loading="eager"
        decoding="async"
        className="absolute inset-0 h-full w-full object-contain"
        onError={() => {
          failedImages.set(img.url, nowMs);
          setFailedUrl(img.url);
        }}
      />
    </div>
  );

  const renderText = (titleClampClass: string): React.ReactElement => (
    <div className="flex shrink-0 flex-col gap-[0.8vh]">
      <p className={TV_KICKER_CLASS}>{eyebrow}</p>
      {/* leading-[1.15]: the clamp hides overflow, and a tighter line shaves descenders. */}
      <h2 className={tvText('lg', titleClampClass, 'leading-[1.15]')}>{event.title}</h2>
      {whenLine && <p className={tvText('base', 'font-semibold text-anchor-gold-bright')}>{whenLine}</p>}
    </div>
  );

  return (
    <section
      aria-label={event.title}
      className="mx-auto flex h-full w-full max-w-[1800px] items-stretch gap-[3vw] overflow-hidden text-anchor-cream-text"
    >
      {image?.square ? (
        <>
          <div className="flex shrink-0 items-center">{renderImage(image, 'relative aspect-square h-full max-h-[36vw]')}</div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-[1.6vh] text-left">{renderText('line-clamp-4')}</div>
        </>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-[1.6vh] text-left">
          {/* The largest 16:9 box that fits the stretch (cqh and cqw are its own height and width). */}
          {image && (
            <div className="flex min-h-0 flex-1 items-end [container-type:size]">
              {renderImage(image, 'relative aspect-video h-[min(100cqh,56.25cqw)]')}
            </div>
          )}
          {renderText('line-clamp-2')}
        </div>
      )}

      <div className="flex shrink-0 flex-col items-center justify-center gap-[1.5vh] pr-[3vw]">
        <div className="rounded-card border border-line-gold bg-white p-[clamp(13px,1.85vh,20px)]">
          <Qr
            value={qrUrl}
            size={432}
            title={`QR code: details of ${event.title}`}
            style={{ width: EVENT_QR_SIZE, height: EVENT_QR_SIZE }}
          />
        </div>
        <p className={tvText('xs', 'font-semibold')}>Scan for details</p>
      </div>
    </section>
  );
}

export interface PreloadEventImageProps {
  image: ScreenEventImage | null | undefined;
  nowMs: number;
  imageSrc?: EventImageSrc;
}

/**
 * Starts loading an image the loop is about to show, at the sizes the slide
 * will ask for, so the next slide does not appear with an empty box. Renders
 * nothing.
 */
export function PreloadEventImage({ image, nowMs, imageSrc = nextImageSrc }: PreloadEventImageProps): null {
  if (!image || isKnownFailed(image.url, nowMs)) return null;
  preload(imageSrc(image.url, MAX_EVENT_IMAGE_WIDTH), {
    as: 'image',
    imageSrcSet: eventImageSrcSet(image.url, imageSrc),
    imageSizes: eventImageSizes(image),
    fetchPriority: 'low',
  });
  return null;
}
