// The end-of-night screen (spec S7.5): a thank-you on the left and two QR
// cards on the right, after Music Bingo's ThankYou.tsx layout.
//   - "Review us": the app's own review short link (to
//     https://l.the-anchor.pub/feedback). Only an Anchor link is drawn; a
//     Google URL or a typo shows no card at all.
//   - "What's on next": the next night of this format from the feed, its
//     name, its date in London time and its booking QR.
//   - With nothing from the feed (empty, down or no key), "See what's on"
//     with the what's-on QR instead.
//
// What changed from Music Bingo: nothing on it is typed by the host (spec
// S7.6). Music Bingo's QR links and "Next Event" date came from brand
// settings and the host's typing; here they come only from the feed and the
// app. The host can hide a card for the night, never fill one in. A date is
// only ever the event's own start, formatted in London time; if it cannot be
// formatted the card falls back to "See what's on" rather than show a
// placeholder. The copy under "Review us" is Cash Bingo's approved text, not
// Music Bingo's star-rating line.
'use client';

import * as React from 'react';
import { formatEventWhenAndTime } from '../dates';
import { isAllowedReviewUrl, printedAddress, WHATS_ON_URL } from '../events/links';
import type { ScreenEvent } from '../events/types';
import { Qr, qrValue } from '../qr';
import { TV_KICKER_CLASS, tvText } from '../tv/tv-text';

const CARD_QR_SIZE = 'max(30vh, 240px)';

export interface ThankYouSlideProps {
  /** The app's review short link; null or anything but an Anchor link shows no review card. */
  reviewUrl: string | null | undefined;
  /** The next night of this format, from the feed; null when there is none. */
  nextNight: ScreenEvent | null;
  /** Its QR target (from the playlist's channel). */
  nextNightQr: string | null;
  /** The host has hidden the "What's on next" card for tonight: no card, not the fallback. */
  hideNext?: boolean;
  /** The screen's clock (epoch milliseconds). */
  nowMs: number;
  /** The small line above the headline, for example "Anchor Quiz Night". */
  kicker?: string;
  /** Defaults to "Thanks for coming". */
  headline?: string;
  /** Defaults to "Where everyone's welcome". */
  tagline?: string;
}

interface QrCardProps {
  title: string;
  url: string;
  qrTitle: string;
  lines: string[];
}

function QrCard({ title, url, qrTitle, lines }: QrCardProps): React.ReactElement {
  return (
    <div className="flex w-[max(34vh,280px)] flex-col items-center gap-[1.6vh] text-center" data-card={title}>
      <div className="rounded-card border-2 border-anchor-gold-bright bg-white p-[clamp(10px,1.5vh,16px)] shadow-lift">
        <Qr value={url} size={320} title={qrTitle} style={{ width: CARD_QR_SIZE, height: CARD_QR_SIZE }} />
      </div>
      <p className={tvText('lg', 'font-display uppercase leading-none')}>{title}</p>
      {lines.map((line) => (
        <p key={line} className={tvText('xs', 'font-semibold text-balance text-anchor-cream-text')}>
          {line}
        </p>
      ))}
    </div>
  );
}

export function ThankYouSlide({
  reviewUrl,
  nextNight,
  nextNightQr,
  hideNext = false,
  nowMs,
  kicker,
  headline = 'Thanks for coming',
  tagline = "Where everyone's welcome",
}: ThankYouSlideProps): React.ReactElement {
  const review = isAllowedReviewUrl(reviewUrl) ? reviewUrl.trim() : null;
  const nextWhen = nextNight ? formatEventWhenAndTime(nextNight.startsAt, nowMs) : '';
  const nextQr = qrValue(nextNightQr);
  // Only a real event with a real date and a drawable code; otherwise the fallback.
  const showNext = !hideNext && nextNight !== null && nextWhen !== '' && nextQr !== null;

  return (
    <section
      aria-label={headline}
      className="mx-auto flex h-full w-full max-w-[1800px] items-center gap-[4.6vw] text-anchor-cream-text"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[2.2vh] text-left">
        {kicker && <p className={TV_KICKER_CLASS}>{kicker}</p>}
        <h1 className={tvText('3xl', 'max-w-[12ch] leading-[0.9]')}>{headline}</h1>
        <p className={tvText('xl', 'font-script text-anchor-gold-bright')}>{tagline}</p>
      </div>
      <div className="flex shrink-0 items-start gap-[2.6vw]">
        {review && <QrCard title="Review us" url={review} qrTitle="QR code: leave feedback" lines={['Scan to leave feedback']} />}
        {showNext && nextNight && nextQr ? (
          <QrCard
            title="What's on next"
            url={nextQr}
            qrTitle={`QR code: book ${nextNight.title}`}
            lines={[nextNight.title, nextWhen]}
          />
        ) : (
          !hideNext && (
            <QrCard
              title="See what's on"
              url={WHATS_ON_URL}
              qrTitle="QR code: what's on at The Anchor"
              lines={[printedAddress(WHATS_ON_URL)]}
            />
          )
        )}
      </div>
    </section>
  );
}
