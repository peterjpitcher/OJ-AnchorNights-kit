import { contrastRatio, hexToOklch, isHexColour, oklchToHex, rgbTriple, type Oklch } from './colour';

/** The owner's four colours, as #RRGGBB. Everything else is derived from them. */
export interface BrandingPalette {
  /** The main screen background (The Anchor green). Must be dark. */
  background: string;
  /** Text on every screen (The Anchor cream). Must be light. */
  text: string;
  /** The main colour: welcome, half time, thanks and highlights. */
  accent: string;
  /** The prize colour: winners, prizes and the guests' main button. */
  prize: string;
}

/** A stored special-night look. Quiz Night keeps this on the quiz as `branding`. */
export interface Branding {
  /** Absent means The Anchor colours. */
  palette?: BrandingPalette;
  /** Logo for dark screens (TV and phones), in the app's own picture store. Absent means The Anchor logo. */
  logo_url?: string;
  /** Logo for white paper (answer sheets), in the app's own picture store. Absent means The Anchor print logo. */
  print_logo_url?: string;
}

/**
 * Where a look's logos may come from. Logos are only accepted from the app's
 * own Supabase public bucket, so a look can never pull an image from
 * somewhere unknown onto the pub TV.
 */
export interface BrandingOptions {
  /** The app's Supabase URL. Defaults to NEXT_PUBLIC_SUPABASE_URL. With none, no logo passes. */
  supabaseUrl?: string;
  /** The public bucket logos live in (Quiz Night: 'quiz-images'). With none, no logo passes. */
  logoBucket?: string;
}

function defaultSupabaseUrl(): string | undefined {
  // Read by its literal name so Next.js can inline it into a browser bundle.
  return typeof process === 'undefined' ? undefined : process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function readOptions(options: BrandingOptions | undefined): { supabaseUrl: string | undefined; logoBucket: string | undefined } {
  return {
    supabaseUrl: options && 'supabaseUrl' in options ? options.supabaseUrl : defaultSupabaseUrl(),
    logoBucket: options?.logoBucket,
  };
}

/*
 * From Quiz Night (src/lib/branding.ts). Generalised for every app: the logo
 * bucket is a parameter instead of 'quiz-images', the look's type is
 * `Branding`, and brandingCssVars also sets the kit's own token names
 * (tokens.css) so the kit's components follow a special night too.
 *
 * The special-night look: a night's own colours and logo on the audience
 * surfaces (the TV, guests' phones and the printed answer sheets).
 *
 * The owner picks four colours. Everything else the stylesheet uses (glows,
 * deep surfaces, muted text, highlight shades, text on fills) is derived here
 * in OKLCH. The offsets were fitted to The Anchor's palette as it was before
 * the reskin of 7 Oct 2026; they still give a sound family of shades from any
 * four colours, but no longer land on The Anchor's own values, which the
 * stylesheet sets by hand. A look with no palette sets no CSS at all, so a
 * normal night renders exactly as the stylesheet has it.
 *
 * Legibility is guaranteed rather than advised: a palette that cannot give
 * readable text is refused whole (the surface keeps The Anchor colours), and
 * shades that fall short are nudged until they read. Everything here is total
 * and never throws, because it runs above the TV's error boundary.
 */

/** Every colour the audience surfaces read, by stylesheet name. */
export interface DerivedColours {
  green: string;
  greenLight: string;
  ink: string;
  cream: string;
  creamDim: string;
  coral: string;
  coralLight: string;
  gold: string;
  goldLight: string;
  /** Text on a coral-light fill (the correct-answer letter on the TV). */
  onCoral: string;
  /** Text on a gold fill (the guest's Send button). */
  onGold: string;
  /** The pale top of a coral gradient headline. */
  coralTint: string;
  /** The pale top of a gold gradient headline. */
  goldTint: string;
  /** The foot of a coral gradient headline: the main colour, lifted until it shows on the background. */
  coralHeadline: string;
  /** The foot of a gold gradient headline, likewise. */
  goldHeadline: string;
}

/**
 * Today's Anchor palette, as the stylesheet defines it (tokens.css, the reskin
 * of 7 Oct 2026). These are the design system's own values, set by hand: the
 * main accent and the prize colour are now the same gold, and the muted text
 * is a sage rather than a dimmed cream, so derivePalette does not reproduce
 * them from the four colours below and is not expected to.
 */
export const ANCHOR_COLOURS: DerivedColours = {
  green: '#0C1D11',
  greenLight: '#006B45',
  ink: '#081509',
  cream: '#F0E6C6',
  creamDim: '#7A8B7F',
  coral: '#A57626',
  coralLight: '#C9A020',
  gold: '#A57626',
  goldLight: '#C9A020',
  onCoral: '#1A1A1A',
  onGold: '#FFFFFF',
  coralTint: '#F0E6C6',
  goldTint: '#F0E6C6',
  coralHeadline: '#C9A020',
  goldHeadline: '#C9A020',
};

/** The four colours an owner picks, for the Anchor look. */
export const ANCHOR_PALETTE: BrandingPalette = {
  background: ANCHOR_COLOURS.green,
  text: ANCHOR_COLOURS.cream,
  accent: ANCHOR_COLOURS.coral,
  prize: ANCHOR_COLOURS.gold,
};

export interface BrandingPreset {
  id: string;
  name: string;
  /** Absent for The Anchor: choosing it clears the palette. */
  palette?: BrandingPalette;
}

/** Ready-made colour sets. Each one passes the legibility rules below (tested). */
export const BRANDING_PRESETS: readonly BrandingPreset[] = [
  { id: 'anchor', name: 'The Anchor' },
  { id: 'navy', name: 'Navy, red and yellow', palette: { background: '#0D1E3C', text: '#FFF6E0', accent: '#D2372C', prize: '#F2C230' } },
  { id: 'christmas', name: 'Christmas', palette: { background: '#0E3A25', text: '#FFF7EA', accent: '#C8312E', prize: '#D9A93E' } },
  { id: 'halloween', name: 'Halloween', palette: { background: '#1B0F2B', text: '#F6EEDC', accent: '#E0701A', prize: '#8FC23A' } },
  { id: 'pink', name: 'Pink', palette: { background: '#2B0B22', text: '#FFF1F6', accent: '#D83F78', prize: '#F0B446' } },
  { id: 'emerald', name: 'Emerald and orange', palette: { background: '#06301E', text: '#F3F1E3', accent: '#1F9A52', prize: '#E8841F' } },
  { id: 'purple', name: 'Royal purple', palette: { background: '#1E0C3A', text: '#F5EFFF', accent: '#7C4BE0', prize: '#E2B347' } },
];

/** Minimum contrast for text on the background: normal-size text on a TV across a pub. */
export const TEXT_MIN_CONTRAST = 4.5;
/** Contrast worth aiming for; below it the builder says so. */
export const TEXT_GOOD_CONTRAST = 7;
/** Minimum for text on a full-screen accent (display-size headings only). */
const ACCENT_SCREEN_MIN_CONTRAST = 3.2;
/** Minimum for highlight text and small text on the background. */
const HIGHLIGHT_MIN_CONTRAST = 4.5;
/** Minimum for the foot of a display-size headline on the background. */
const HEADLINE_MIN_CONTRAST = 3;

export type PaletteResult =
  | { ok: true; colours: DerivedColours; notes: string[]; warnings: string[] }
  | { ok: false; problems: string[] };

const STEP = 0.005;

function hex(colour: Oklch): string {
  return oklchToHex(colour);
}

/**
 * Move a colour's lightness towards `direction` until `passes` holds, or the
 * limit is reached. Returns the first shade that passes, or the last tried.
 */
function nudgeLightness(
  start: Oklch,
  direction: 'lighter' | 'darker',
  limit: number,
  passes: (candidate: string) => boolean,
): { hex: string; moved: boolean } {
  const first = hex(start);
  if (passes(first)) return { hex: first, moved: false };
  let l = start.l;
  let last = first;
  for (let i = 0; i < 400; i += 1) {
    l = direction === 'lighter' ? Math.min(limit, l + STEP) : Math.max(limit, l - STEP);
    last = hex({ ...start, l });
    if (passes(last)) return { hex: last, moved: true };
    if (l === limit) break;
  }
  return { hex: last, moved: true };
}

function ratio(a: string, b: string): string {
  return `${(Math.floor(contrastRatio(a, b) * 10) / 10).toFixed(1)}:1`;
}

/**
 * How much of a fixed tint to add at a colour's hue: none for a grey, whose hue
 * is only rounding noise, rising to all of it by a lightly tinted colour. So a
 * grey palette derives greys rather than picking up a stray cast.
 */
function tintScale(colour: Oklch): number {
  return Math.min(1, colour.c / 0.02);
}

/** A dark tint at `hue`, or the text colour, whichever reads better on every fill. */
function textOnFills(hue: number, chroma: number, text: string, fills: string[]): string {
  const dark = hex({ l: 0.215, c: chroma, h: hue });
  const score = (candidate: string) => Math.min(...fills.map((fill) => contrastRatio(candidate, fill)));
  return score(dark) >= score(text) ? dark : text;
}

/** Derive every colour the surfaces use from the owner's four, or say why it cannot. */
export function derivePalette(palette: BrandingPalette): PaletteResult {
  const { background, text, accent, prize } = palette;
  if (![background, text, accent, prize].every(isHexColour)) {
    return { ok: false, problems: ['Every colour needs to be a six-digit code such as #1B2A4A.'] };
  }

  const bg = hexToOklch(background);
  const fg = hexToOklch(text);
  const problems: string[] = [];
  if (fg.l <= bg.l) {
    problems.push('The text colour must be lighter than the background: the TV is built for light text on a dark background.');
  } else if (contrastRatio(text, background) < TEXT_MIN_CONTRAST) {
    problems.push(
      `Text on the background is only ${ratio(text, background)}. It needs at least 4.5:1 to read from the back of the room, so darken the background or lighten the text.`,
    );
  }
  if (problems.length > 0) return { ok: false, problems };

  const notes: string[] = [];
  const warnings: string[] = [];
  const green = background.toUpperCase();
  const cream = text.toUpperCase();

  // The glow in each gradient: a lifted background that text must still read on.
  // Its extra chroma can leave even the last shade tried lighter than the
  // background, so the background itself (which passes) is the backstop.
  const glow = nudgeLightness(
    { l: bg.l + 0.134, c: bg.c * 1.33, h: bg.h },
    'darker',
    bg.l,
    (candidate) => contrastRatio(cream, candidate) >= TEXT_MIN_CONTRAST,
  ).hex;
  const greenLight = contrastRatio(cream, glow) >= TEXT_MIN_CONTRAST ? glow : green;
  // The deep end of every gradient: never lighter than the background itself.
  const ink = hex({ l: Math.min(bg.l, Math.max(0.12, bg.l * 0.52)), c: bg.c * 0.37, h: bg.h });
  // Muted text, with the same backstop: the text colour itself passes.
  const dim = nudgeLightness(
    { l: fg.l - 0.145, c: fg.c + 0.02 * tintScale(fg), h: fg.h },
    'lighter',
    fg.l,
    (candidate) => contrastRatio(candidate, green) >= HIGHLIGHT_MIN_CONTRAST,
  ).hex;
  const creamDim = contrastRatio(dim, green) >= HIGHLIGHT_MIN_CONTRAST ? dim : cream;

  const accentLch = hexToOklch(accent);
  const prizeLch = hexToOklch(prize);

  // Fills carry text in the text colour, so a bright pick is deepened until
  // that text reads. Since the reskin of 7 Oct 2026 these are labels and glows
  // on the TV (the type pill, the prize pill, the award-winning team) rather
  // than whole screens; the guest page still fills buttons with them. The
  // notes below keep their wording because the builder shows them.
  const coral = nudgeLightness(accentLch, 'darker', 0, (candidate) => contrastRatio(cream, candidate) >= ACCENT_SCREEN_MIN_CONTRAST);
  if (coral.moved) notes.push('Main colour: full-screen backgrounds use a deeper shade so the text on them reads.');
  const gold = nudgeLightness(prizeLch, 'darker', 0, (candidate) => contrastRatio(cream, candidate) >= ACCENT_SCREEN_MIN_CONTRAST);
  if (gold.moved) notes.push('Prize colour: full-screen backgrounds use a deeper shade so the text on them reads.');

  // Highlight text on the background, from the colour as picked (not the deepened fill).
  const coralLight = nudgeLightness(
    { l: Math.min(accentLch.l + 0.092, 0.95), c: accentLch.c * 0.88, h: accentLch.h + 10 },
    'lighter',
    0.98,
    (candidate) => contrastRatio(candidate, green) >= HIGHLIGHT_MIN_CONTRAST,
  ).hex;
  const goldLight = nudgeLightness(
    { l: prizeLch.l + 0.098, c: prizeLch.c * 1.15, h: prizeLch.h + 6 },
    'lighter',
    0.98,
    (candidate) => contrastRatio(candidate, green) >= HIGHLIGHT_MIN_CONTRAST,
  ).hex;
  if (contrastRatio(coralLight, green) < HIGHLIGHT_MIN_CONTRAST) {
    warnings.push(`Main colour highlights are faint on this background (${ratio(coralLight, green)}). Try a darker background.`);
  }
  if (contrastRatio(goldLight, green) < HIGHLIGHT_MIN_CONTRAST) {
    warnings.push(`Prize colour highlights are faint on this background (${ratio(goldLight, green)}). Try a darker background.`);
  }
  // Gradient headlines on the background end in the main or prize colour. A
  // colour deepened for its full-screen fills, or picked close to the
  // background, would let the foot of every headline fade into it, so the foot
  // is lifted towards the highlight shade until it shows.
  const headlineFoot = (fill: string, highlight: string) => {
    const start = hexToOklch(fill);
    const foot = nudgeLightness(start, 'lighter', Math.max(start.l, hexToOklch(highlight).l), (candidate) =>
      contrastRatio(candidate, green) >= HEADLINE_MIN_CONTRAST,
    ).hex;
    return contrastRatio(foot, green) >= HEADLINE_MIN_CONTRAST ? foot : highlight;
  };

  const textRatio = contrastRatio(cream, green);
  if (textRatio < TEXT_GOOD_CONTRAST) {
    warnings.push(`Text on the background is ${ratio(cream, green)}. It reads, but 7:1 or more is easier from the back of the room.`);
  }

  const colours: DerivedColours = {
    green,
    greenLight,
    ink,
    cream,
    creamDim,
    coral: coral.hex,
    coralLight,
    gold: gold.hex,
    goldLight,
    // Hue offsets fitted to The Anchor's two dark button texts (#2A1208, #2A1206).
    onCoral: textOnFills(accentLch.h + 10, 0.044 * tintScale(accentLch), cream, [coralLight]),
    onGold: textOnFills(prizeLch.h - 30, 0.044 * tintScale(prizeLch), cream, [gold.hex]),
    coralTint: hex({ l: 0.949, c: 0.028 * tintScale(accentLch), h: accentLch.h + 13 }),
    goldTint: hex({ l: 0.974, c: 0.034 * tintScale(prizeLch), h: prizeLch.h + 14 }),
    coralHeadline: headlineFoot(coral.hex, coralLight),
    goldHeadline: headlineFoot(gold.hex, goldLight),
  };
  return { ok: true, colours, notes, warnings };
}

/**
 * The CSS custom properties that re-skin a surface, set as an inline style on
 * its root element. Each core colour is emitted in all three forms the
 * stylesheet reads: the Tailwind token (--color-coral), the alias (--coral,
 * which :root resolves once, so a child cannot inherit an override of the
 * token alone) and the rgb triple (--coral-rgb, for alpha blends).
 */
export function brandingCssVars(colours: DerivedColours): Record<string, string> {
  const core: Array<[string, string, boolean]> = [
    ['green', colours.green, true],
    ['green-light', colours.greenLight, true],
    ['ink', colours.ink, true],
    ['cream', colours.cream, true],
    ['cream-dim', colours.creamDim, false],
    ['coral', colours.coral, true],
    ['coral-light', colours.coralLight, true],
    ['gold', colours.gold, true],
    ['gold-light', colours.goldLight, true],
  ];
  const vars: Record<string, string> = {};
  for (const [name, value, hasTriple] of core) {
    vars[`--color-${name}`] = value;
    vars[`--${name}`] = value;
    if (hasTriple) vars[`--${name}-rgb`] = rgbTriple(value);
  }
  vars['--on-coral'] = colours.onCoral;
  vars['--on-gold'] = colours.onGold;
  vars['--coral-tint'] = colours.coralTint;
  vars['--gold-tint'] = colours.goldTint;
  vars['--coral-headline'] = colours.coralHeadline;
  vars['--gold-headline'] = colours.goldHeadline;
  // The final reveal's winner chip: its own warmer gold on The Anchor, the
  // prize highlight on a special night.
  vars['--winner-chip-rgb'] = rgbTriple(colours.goldLight);
  Object.assign(vars, kitTokenVars(colours));
  return vars;
}

/**
 * The kit's register variables (tokens.css) for a special night, so Button,
 * Card, Badge and the rest take the night's colours on a night surface.
 * Every value is built from the derived colours, which are validated
 * six-digit hex, so nothing here can carry anything but a colour. The
 * surfaces follow Quiz Night's branded TV card: the text colour at 7
 * percent over the background.
 */
function kitTokenVars(colours: DerivedColours): Record<string, string> {
  const accent = rgbTriple(colours.coralLight);
  const surface = `color-mix(in srgb, ${colours.cream} 7%, ${colours.green})`;
  return {
    '--bg': colours.green,
    '--surface': surface,
    '--surface-raised': surface,
    '--surface-sunk': colours.ink,
    '--text': colours.cream,
    '--text-strong': colours.cream,
    '--text-muted': colours.creamDim,
    '--accent': colours.coralLight,
    '--accent-text': colours.coralLight,
    '--on-accent': colours.onCoral,
    '--focus-ring': colours.coralLight,
    '--border': `rgb(${accent} / 0.22)`,
    '--border-strong': `rgb(${accent} / 0.45)`,
    '--border-gold': `rgb(${accent} / 0.55)`,
    '--card-border': `rgb(${accent} / 0.55)`,
    '--card-accent': colours.coralLight,
    '--field-bg': colours.green,
    '--field-text': colours.cream,
    '--field-border': `rgb(${accent} / 0.45)`,
    '--field-placeholder': colours.creamDim,
    '--field-focus': colours.coralLight,
    '--anchor-gold': colours.gold,
    '--anchor-gold-bright': colours.goldLight,
    '--anchor-green-light': colours.greenLight,
  };
}

/**
 * A screen logo smaller than this in both directions is stretched to fill its
 * space on the TV (230 by 115 in the top bar, up to 340 by 170 on Welcome) and
 * looks soft, more so on a 4K screen. Twice the top bar's box is sharp enough.
 */
export const SHARP_SCREEN_LOGO = { width: 460, height: 230 } as const;

/** True when a screen logo is too small in both directions to stay sharp on the TV. */
export function isSmallScreenLogo(width: number, height: number): boolean {
  return width > 0 && height > 0 && width < SHARP_SCREEN_LOGO.width && height < SHARP_SCREEN_LOGO.height;
}

const MAX_URL_LENGTH = 2048;
const BUCKET_NAME = /^[a-z0-9][a-z0-9._-]{0,62}$/;

/**
 * True for a logo in this app's own picture store (its Supabase public
 * bucket). Fails closed: with no Supabase URL or bucket configured nothing
 * passes, so the surface shows The Anchor logo rather than an image from
 * somewhere unknown.
 */
export function isBrandingLogoUrl(value: unknown, options?: BrandingOptions): value is string {
  const { supabaseUrl, logoBucket } = readOptions(options);
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) return false;
  const base = supabaseUrl?.trim();
  if (!base || !logoBucket || !BUCKET_NAME.test(logoBucket)) return false;
  const prefix = `/storage/v1/object/public/${logoBucket}/`;
  try {
    const url = new URL(value);
    const own = new URL(base);
    if (url.origin !== own.origin) return false;
    if (url.username || url.password) return false;
    if (!url.pathname.startsWith(prefix)) return false;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    return path.length > 0 && !path.includes('..');
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePalette(raw: unknown): BrandingPalette | null {
  if (!isPlainObject(raw)) return null;
  const { background, text, accent, prize } = raw;
  if (![background, text, accent, prize].every(isHexColour)) return null;
  return {
    background: (background as string).toUpperCase(),
    text: (text as string).toUpperCase(),
    accent: (accent as string).toUpperCase(),
    prize: (prize as string).toUpperCase(),
  };
}

/**
 * A stored or imported look, keeping only the parts that are valid: a
 * malformed palette or a logo from anywhere but our own store is dropped, not
 * the whole look. Null when nothing valid is left.
 */
export function parseBranding(raw: unknown, options?: BrandingOptions): Branding | null {
  if (!isPlainObject(raw)) return null;
  const branding: Branding = {};
  const palette = parsePalette(raw.palette);
  if (palette) branding.palette = palette;
  if (isBrandingLogoUrl(raw.logo_url, options)) branding.logo_url = raw.logo_url;
  if (isBrandingLogoUrl(raw.print_logo_url, options)) branding.print_logo_url = raw.print_logo_url;
  return Object.keys(branding).length > 0 ? branding : null;
}

/** What a surface needs to show a night's look. */
export interface ResolvedBranding {
  /** Inline style for the surface root; null keeps The Anchor colours (no override at all). */
  cssVars: Record<string, string> | null;
  /** Logo for dark screens (TV and phones); null shows The Anchor logo. */
  logoUrl: string | null;
  /** Logo for white paper (answer sheets); null prints The Anchor logo. */
  printLogoUrl: string | null;
}

export const ANCHOR_BRANDING: ResolvedBranding = Object.freeze({
  cssVars: null,
  logoUrl: null,
  printLogoUrl: null,
}) as ResolvedBranding;

/**
 * Resolve a stored look for a surface. Never throws: anything absent,
 * malformed or unreadable falls back to The Anchor. Put `cssVars` as the
 * inline style of the surface's root (the TV Stage takes it as `style`).
 */
export function resolveBranding(raw: unknown, options?: BrandingOptions): ResolvedBranding {
  try {
    const branding = parseBranding(raw, options);
    if (!branding) return ANCHOR_BRANDING;
    const derived = branding.palette ? derivePalette(branding.palette) : null;
    return {
      cssVars: derived?.ok ? brandingCssVars(derived.colours) : null,
      logoUrl: branding.logo_url ?? null,
      printLogoUrl: branding.print_logo_url ?? null,
    };
  } catch {
    return ANCHOR_BRANDING;
  }
}
