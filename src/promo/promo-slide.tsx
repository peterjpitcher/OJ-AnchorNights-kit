// Draws any playlist slide, so every app's TV draws them the same way. The
// app draws its own `app` slides through `renderApp`. From Cash Bingo
// (src/components/display/promo-slide.tsx).
'use client';

import * as React from 'react';
import type { PromoSlide as PromoSlideData, AppSlide } from './playlist';
import { EventSlide, PreloadEventImage } from './event-slide';
import type { EventImageSrc } from './event-image';
import { NextNightSlide, ReviewSlide, WhatsOnSlide } from './simple-slides';
import { ThankYouSlide, type ThankYouSlideProps } from './thank-you-slide';

export interface PromoSlideProps {
  slide: PromoSlideData;
  /** The screen's clock (epoch milliseconds). */
  nowMs: number;
  /** The next-night heading, for example "Next quiz night". */
  nextNightLabel: string;
  /** Draws the app's own slides; null draws nothing. */
  renderApp?: (slide: AppSlide) => React.ReactNode;
  /** The event heading. Defaults to "Coming up at The Anchor". */
  eventEyebrow?: string;
  /** The what's-on heading. Defaults to "What's on at The Anchor". */
  whatsOnHeadline?: string;
  /** The thank-you wording. */
  thankYou?: Pick<ThankYouSlideProps, 'kicker' | 'headline' | 'tagline'>;
  imageSrc?: EventImageSrc;
}

export function PromoSlide({
  slide,
  nowMs,
  nextNightLabel,
  renderApp,
  eventEyebrow,
  whatsOnHeadline,
  thankYou,
  imageSrc,
}: PromoSlideProps): React.ReactElement | null {
  switch (slide.kind) {
    case 'app':
      return <>{renderApp?.(slide) ?? null}</>;
    case 'event':
      return (
        <EventSlide key={slide.key} event={slide.event} qrUrl={slide.qrUrl} nowMs={nowMs} eyebrow={eventEyebrow} imageSrc={imageSrc} />
      );
    case 'next_night':
      return (
        <NextNightSlide key={slide.key} event={slide.event} qrUrl={slide.qrUrl} nowMs={nowMs} label={nextNightLabel} imageSrc={imageSrc} />
      );
    case 'whats_on':
      return <WhatsOnSlide url={slide.url} headline={whatsOnHeadline} />;
    case 'review':
      return <ReviewSlide url={slide.url} />;
    case 'thank_you':
      return (
        <ThankYouSlide
          reviewUrl={slide.reviewUrl}
          nextNight={slide.nextNight}
          nextNightQr={slide.nextNightQr}
          hideNext={slide.hideNext}
          nowMs={nowMs}
          {...thankYou}
        />
      );
  }
}

/** Preloads the image of the slide after `slide`. Renders nothing. */
export function SlidePreload({ slide, nowMs, imageSrc }: { slide: PromoSlideData; nowMs: number; imageSrc?: EventImageSrc }): React.ReactElement {
  return <PreloadEventImage image={slide.preloadImage} nowMs={nowMs} imageSrc={imageSrc} />;
}
