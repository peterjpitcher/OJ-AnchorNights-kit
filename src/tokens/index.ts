// The TypeScript side of tokens.css: the names an app needs in code.

/**
 * The CSS variable each next/font loader must set in the root layout, so
 * tokens.css can find the fonts:
 *
 *   const display = DM_Serif_Display({ variable: FONT_VARIABLES.display, weight: '400', subsets: ['latin'], display: 'swap' });
 *
 * next/font needs the literal string at build time in some setups; the
 * values are spelled out in the README for that case.
 */
export const FONT_VARIABLES = {
  /** DM Serif Display, weight 400 only. Headlines, prize figures, large counts. */
  display: '--font-dm-serif',
  /** Outfit, weights 400 to 700. Body text and every numeral on a ball. */
  body: '--font-outfit',
  /** Clicker Script, weight 400. The brand line and warm asides, sparingly. */
  script: '--font-clicker',
} as const;

/** The two registers (spec S5.2). Put one on a surface's root element. */
export const THEME_CLASS = {
  /** Dark green, cream and bright gold: the TV, guests' phones, the host console. The default. */
  night: 'theme-night',
  /** Light cream: prep, builders and admin. */
  desk: 'theme-desk',
} as const;

export type ThemeName = keyof typeof THEME_CLASS;

/**
 * Brand colours as literals, for things that cannot read a CSS variable (a
 * QR code's ink, a canvas, an email). Everything else uses the Tailwind
 * names from tokens.css. These equal the variables there.
 */
export const ANCHOR_HEX = {
  green: '#005131',
  greenDeep: '#0c1d11',
  greenCard: '#172d1e',
  gold: '#a57626',
  goldBright: '#c9a020',
  cream: '#faf8f3',
  creamText: '#f0e6c6',
  charcoal: '#1a1a1a',
  white: '#ffffff',
} as const;
