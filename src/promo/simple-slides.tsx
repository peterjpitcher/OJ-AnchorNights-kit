// The NextNight, WhatsOn and Review slides.
//
// From Cash Bingo (next-bingo-slide.tsx, whats-on-slide.tsx and
// review-slide.tsx in src/components/display). What changed: the headings are
// props (Cash Bingo wrote "Next bingo night" and "Bingo nights at The
// Anchor"), the review link is an input checked by isAllowedReviewUrl rather
// than a constant behind an on/off switch, and the kit's Qr draws the codes.
'use client';

import * as React from 'react';
import type { ScreenEvent } from '../events/types';
import { isAllowedReviewUrl, printedAddress, WHATS_ON_URL } from '../events/links';
import { Qr } from '../qr/qr';
import { tvText } from '../tv/tv-text';
import { EventSlide } from './event-slide';
import type { EventImageSrc } from './event-image';

// At least half the screen height: 540px at 1080p, 360px at 720p.
const BIG_QR_SIZE = 'max(50vh, 360px)';
// At least 40% of the screen height, like the event codes.
const WHATS_ON_QR_SIZE = 'max(40vh, 288px)';

export interface NextNightSlideProps {
  event: ScreenEvent;
  qrUrl: string;
  nowMs: number;
  /** The heading, for example "Next quiz night". */
  label: string;
  imageSrc?: EventImageSrc;
}

/** The next night of this format: the event slide under its own heading. */
export function NextNightSlide({ event, qrUrl, nowMs, label, imageSrc }: NextNightSlideProps): React.ReactElement {
  return <EventSlide event={event} qrUrl={qrUrl} nowMs={nowMs} eyebrow={label} imageSrc={imageSrc} />;
}

export interface WhatsOnSlideProps {
  /** Defaults to "What's on at The Anchor". */
  headline?: string;
  /** Defaults to https://www.the-anchor.pub/whats-on. */
  url?: string;
}

/** The website's what's-on page, with its QR and its printed address. */
export function WhatsOnSlide({ headline = "What's on at The Anchor", url = WHATS_ON_URL }: WhatsOnSlideProps): React.ReactElement {
  return (
    <section
      aria-label={headline}
      className="mx-auto flex h-full w-full max-w-[1700px] items-center justify-center gap-[4.6vw] text-anchor-cream-text"
    >
      <div className="shrink-0 rounded-card border border-line-gold bg-white p-[clamp(13px,1.85vh,20px)]">
        <Qr value={url} size={432} title="QR code: what's on at The Anchor" style={{ width: WHATS_ON_QR_SIZE, height: WHATS_ON_QR_SIZE }} />
      </div>
      <div className="flex min-w-0 flex-col gap-[clamp(14px,2.6vh,28px)] text-left">
        <h1 className={tvText('2xl', 'max-w-[13ch] leading-[0.98]')}>{headline}</h1>
        <p className={tvText('base', 'font-medium')}>See what&apos;s on</p>
        <p className={tvText('lg', 'break-all font-bold leading-[1.05] text-anchor-gold-bright')}>{printedAddress(url)}</p>
      </div>
    </section>
  );
}

export interface ReviewSlideProps {
  /** The app's review short link. Anything but an Anchor link draws nothing. */
  url: string | null | undefined;
}

/**
 * The review invitation. The copy is Cash Bingo's approved text: no rating
 * request, no reward, no pressure.
 */
export function ReviewSlide({ url }: ReviewSlideProps): React.ReactElement | null {
  if (!isAllowedReviewUrl(url)) return null;
  return (
    <section
      aria-label="Tell us how we did"
      className="mx-auto flex h-full w-full max-w-[1700px] items-center justify-center gap-[4.6vw] text-anchor-cream-text"
    >
      <div className="shrink-0 rounded-card border border-line-gold bg-white p-[clamp(14px,2.2vh,24px)]">
        <Qr value={url} size={540} title="QR code: leave feedback" style={{ width: BIG_QR_SIZE, height: BIG_QR_SIZE }} />
      </div>
      <div className="flex min-w-0 flex-col gap-[clamp(14px,2.6vh,28px)] text-left">
        <h1 className={tvText('2xl', 'max-w-[14ch] leading-[0.98]')}>Enjoyed tonight? Tell us how we did</h1>
        <p className={tvText('base', 'font-semibold text-anchor-gold-bright')}>Scan to leave feedback</p>
      </div>
    </section>
  );
}
