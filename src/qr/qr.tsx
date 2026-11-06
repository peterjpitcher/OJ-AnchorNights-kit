'use client';
import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { qrValue } from './origin';

/**
 * The QR ink and ground: Anchor green on true white, whatever the night's
 * colours. A code must not take a special night's palette, or a phone may
 * not read it (Cash Bingo's brand.ts; Quiz Night uses charcoal for the same
 * reason, which apps can pass as `foreground`).
 */
export const QR_FOREGROUND = '#005131';
export const QR_BACKGROUND = '#ffffff';

export interface QrProps {
  /** The full link. Empty, malformed or localhost values draw nothing. */
  value: string | null | undefined;
  /** Read out by screen readers and shown as the SVG title: "QR code: follow the numbers on your phone". */
  title: string;
  /** The SVG's own size in pixels. Display size comes from `style` or `className`. */
  size?: number;
  /** Error correction. M (15 percent) reads well across a room. */
  level?: 'L' | 'M' | 'Q' | 'H';
  /** Quiet zone in modules. Two inside a white tile is enough. */
  marginSize?: number;
  foreground?: string;
  background?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A QR code that refuses to draw a link a phone cannot open (spec S3.7):
 * nothing at all for an empty value or a localhost one, rather than a
 * placeholder that looks scannable. Pair it with getSiteOrigin, which never
 * gives a preview a production origin.
 */
export function Qr({
  value,
  title,
  size = 260,
  level = 'M',
  marginSize = 2,
  foreground = QR_FOREGROUND,
  background = QR_BACKGROUND,
  className,
  style,
}: QrProps): React.ReactElement | null {
  const safe = qrValue(value);
  if (!safe) return null;
  return (
    <QRCodeSVG
      value={safe}
      level={level}
      marginSize={marginSize}
      size={size}
      title={title}
      role="img"
      aria-label={title}
      fgColor={foreground}
      bgColor={background}
      className={className}
      style={{ display: 'block', ...style }}
    />
  );
}
