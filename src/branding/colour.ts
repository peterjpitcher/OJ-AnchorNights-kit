/*
 * From Quiz Night (src/lib/colour.ts), unchanged.
 *
 * Colour maths for the special-night look: hex parsing, OKLCH (the perceptual
 * space the look is derived in) and WCAG 2 contrast.
 *
 * Kept free of dependencies because it runs on the TV and guests' phones as
 * well as in the builder. OKLab formulas are Björn Ottosson's reference ones.
 */

export type Rgb = readonly [number, number, number]; // 0 to 1 per channel, sRGB
export interface Oklch { l: number; c: number; h: number }

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/** True for a six-digit #RRGGBB colour, the only form the look accepts. */
export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOUR.test(value);
}

export function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Rgb;
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) => Math.round(clamp01(channel) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** "224 87 59": the space-separated triple the stylesheet's rgb(var(--x-rgb) / a) reads. */
export function rgbTriple(hex: string): string {
  return hexToRgb(hex).map((channel) => Math.round(channel * 255)).join(' ');
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function rgbToOklab(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function hexToOklch(hex: string): Oklch {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  return { l: L, c: Math.hypot(a, b), h: (hue + 360) % 360 };
}

const GAMUT_EPSILON = 1e-4;

function inGamut(rgb: readonly number[]): boolean {
  return rgb.every((channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON);
}

/**
 * The hex for an OKLCH colour. Lightness is clamped to 0..1 and chroma is
 * reduced until the colour fits sRGB, so hue and lightness are kept and only
 * saturation gives way.
 */
export function oklchToHex({ l, c, h }: Oklch): string {
  const lightness = clamp01(l);
  const hueRad = (((h % 360) + 360) % 360) * (Math.PI / 180);
  const at = (chroma: number) =>
    oklabToRgb(lightness, chroma * Math.cos(hueRad), chroma * Math.sin(hueRad));

  let chroma = Math.max(0, c);
  let rgb = at(chroma);
  if (!inGamut(rgb)) {
    // Binary search for the largest chroma that fits.
    let low = 0;
    let high = chroma;
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2;
      if (inGamut(at(mid))) low = mid;
      else high = mid;
    }
    chroma = low;
    rgb = at(chroma);
  }
  return rgbToHex(rgb as unknown as Rgb);
}

/** WCAG 2 relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
