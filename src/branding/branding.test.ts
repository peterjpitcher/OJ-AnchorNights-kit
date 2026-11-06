import { describe, expect, it } from 'vitest';
import {
  ANCHOR_BRANDING,
  ANCHOR_COLOURS,
  ANCHOR_PALETTE,
  BRANDING_PRESETS,
  TEXT_MIN_CONTRAST,
  brandingCssVars,
  derivePalette,
  isBrandingLogoUrl,
  isSmallScreenLogo,
  parseBranding,
  resolveBranding,
} from './branding';
import { contrastRatio, hexToOklch } from './colour';

const SUPABASE = 'https://example-project.supabase.co';
const OPTS = { supabaseUrl: SUPABASE, logoBucket: 'quiz-images' };
const LOGO = `${SUPABASE}/storage/v1/object/public/quiz-images/branding/2026-09-25/abc.png`;
const PRINT_LOGO = `${SUPABASE}/storage/v1/object/public/quiz-images/branding/2026-09-25/def.png`;

/** Distance in OKLab units (x100), the scale on which 1 is about a just-visible difference. */
function distance(a: string, b: string): number {
  const x = hexToOklch(a);
  const y = hexToOklch(b);
  const ax = x.c * Math.cos((x.h * Math.PI) / 180);
  const bx = x.c * Math.sin((x.h * Math.PI) / 180);
  const ay = y.c * Math.cos((y.h * Math.PI) / 180);
  const by = y.c * Math.sin((y.h * Math.PI) / 180);
  return Math.hypot(x.l - y.l, ax - ay, bx - by) * 100;
}

describe('derivePalette', () => {
  // Until the reskin of 7 Oct 2026 the four Anchor colours derived the whole
  // Anchor palette to within a hex digit. The design system's palette is not of
  // that family (one gold for both accents, a sage for muted text, a brighter
  // glow), so the stylesheet sets it by hand and this asserts what still holds.
  it('accepts the four Anchor colours as picked, with nothing to warn about', () => {
    const result = derivePalette(ANCHOR_PALETTE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notes).toEqual([]);
    expect(result.warnings).toEqual([]);
    // The four picked colours come through untouched.
    for (const key of ['green', 'cream', 'coral', 'gold'] as const) {
      expect(result.colours[key], key).toBe(ANCHOR_COLOURS[key]);
    }
    // The shades derived from them are not the stylesheet's hand-set ones.
    expect(distance(result.colours.greenLight, ANCHOR_COLOURS.greenLight)).toBeGreaterThan(6);
    expect(distance(result.colours.creamDim, ANCHOR_COLOURS.creamDim)).toBeGreaterThan(6);
  });

  it('keeps the hand-set Anchor palette to the same legibility rules as a derived one', () => {
    const c = ANCHOR_COLOURS;
    expect(contrastRatio(c.cream, c.green)).toBeGreaterThanOrEqual(TEXT_MIN_CONTRAST);
    expect(contrastRatio(c.cream, c.greenLight)).toBeGreaterThanOrEqual(TEXT_MIN_CONTRAST);
    expect(contrastRatio(c.creamDim, c.green)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.coralLight, c.green)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.goldLight, c.green)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.cream, c.coral)).toBeGreaterThanOrEqual(3.2);
    expect(contrastRatio(c.cream, c.gold)).toBeGreaterThanOrEqual(3.2);
    expect(contrastRatio(c.onCoral, c.coralLight)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(c.onGold, c.gold)).toBeGreaterThanOrEqual(3);
    expect(hexToOklch(c.ink).l).toBeLessThanOrEqual(hexToOklch(c.green).l + 0.001);
  });

  it('refuses dark text on a light background', () => {
    const result = derivePalette({ background: '#F6EFDD', text: '#003F27', accent: '#E0573B', prize: '#A57626' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toMatch(/lighter than the background/);
  });

  it('refuses text too close to the background', () => {
    const result = derivePalette({ background: '#3A3A3A', text: '#8A8A8A', accent: '#E0573B', prize: '#A57626' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toMatch(/4\.5:1/);
  });

  it('refuses anything that is not a six-digit code', () => {
    const result = derivePalette({ background: 'red', text: '#FFFFFF', accent: '#E0573B', prize: '#A57626' });
    expect(result.ok).toBe(false);
  });

  it('deepens a bright main colour so text on its full-screen backgrounds reads, and says so', () => {
    const palette = { background: '#0D1E3C', text: '#FFF6E0', accent: '#F2C230', prize: '#D2372C' };
    const result = derivePalette(palette);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(contrastRatio(result.colours.cream, result.colours.coral)).toBeGreaterThanOrEqual(3.2);
    expect(result.notes.join(' ')).toMatch(/Main colour/);
    // Highlights keep the bright colour as picked, not the deepened fill.
    expect(hexToOklch(result.colours.coralLight).l).toBeGreaterThan(hexToOklch(result.colours.coral).l);
  });

  it('keeps every derived pair readable for any accepted palette', () => {
    const palettes = [
      { background: '#000000', text: '#FFFFFF', accent: '#FFFF00', prize: '#00FFFF' },
      { background: '#101010', text: '#DDDDDD', accent: '#111111', prize: '#222222' },
      { background: '#2B0B22', text: '#FFF1F6', accent: '#FF66AA', prize: '#FFE14D' },
      { background: '#1A1A40', text: '#E8E8FF', accent: '#8080FF', prize: '#40FF80' },
      { background: '#4A2A00', text: '#FFFFFF', accent: '#FF8800', prize: '#FFD000' },
    ];
    for (const palette of palettes) {
      const result = derivePalette(palette);
      expect(result.ok, JSON.stringify(palette)).toBe(true);
      if (!result.ok) continue;
      const c = result.colours;
      expect(contrastRatio(c.cream, c.green)).toBeGreaterThanOrEqual(TEXT_MIN_CONTRAST);
      expect(contrastRatio(c.cream, c.greenLight)).toBeGreaterThanOrEqual(TEXT_MIN_CONTRAST);
      expect(contrastRatio(c.creamDim, c.green)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.cream, c.coral)).toBeGreaterThanOrEqual(3.2);
      expect(contrastRatio(c.cream, c.gold)).toBeGreaterThanOrEqual(3.2);
      expect(contrastRatio(c.onCoral, c.coralLight)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(c.onGold, c.gold)).toBeGreaterThanOrEqual(3);
      expect(hexToOklch(c.ink).l).toBeLessThanOrEqual(hexToOklch(c.green).l + 0.001);
      expect(contrastRatio(c.coralHeadline, c.green)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(c.goldHeadline, c.green)).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the glow and muted text readable where extra chroma would tip them over', () => {
    // Both found by review: the last shade tried had failed 4.5:1 by a hair.
    const glowCase = derivePalette({ background: '#244B3D', text: '#90B9A7', accent: '#E0573B', prize: '#A57626' });
    const dimCase = derivePalette({ background: '#770B5E', text: '#EF8D9E', accent: '#E0573B', prize: '#A57626' });
    if (!glowCase.ok || !dimCase.ok) throw new Error('palette refused');
    expect(contrastRatio(glowCase.colours.cream, glowCase.colours.greenLight)).toBeGreaterThanOrEqual(TEXT_MIN_CONTRAST);
    expect(contrastRatio(dimCase.colours.creamDim, dimCase.colours.green)).toBeGreaterThanOrEqual(4.5);
  });

  it('lifts the foot of the headlines when the main colour is close to the background', () => {
    const result = derivePalette({ background: '#1B0F2B', text: '#F6EEDC', accent: '#3A1450', prize: '#2A2A60' });
    if (!result.ok) throw new Error('palette refused');
    expect(contrastRatio(result.colours.coralHeadline, result.colours.green)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(result.colours.goldHeadline, result.colours.green)).toBeGreaterThanOrEqual(3);
    // The full-screen fill itself stays as picked.
    expect(result.colours.coral).toBe('#3A1450');
  });

  it('derives greys from a grey palette, with no stray cast', () => {
    const result = derivePalette({ background: '#000000', text: '#FFFFFF', accent: '#808080', prize: '#C0C0C0' });
    if (!result.ok) throw new Error('palette refused');
    for (const [key, value] of Object.entries(result.colours)) {
      expect(hexToOklch(value).c, key).toBeLessThan(0.005);
    }
  });
});

describe('BRANDING_PRESETS', () => {
  it('starts with The Anchor, which carries no palette', () => {
    expect(BRANDING_PRESETS[0]).toEqual({ id: 'anchor', name: 'The Anchor' });
  });

  it('has unique ids and names', () => {
    expect(new Set(BRANDING_PRESETS.map((p) => p.id)).size).toBe(BRANDING_PRESETS.length);
    expect(new Set(BRANDING_PRESETS.map((p) => p.name)).size).toBe(BRANDING_PRESETS.length);
  });

  it.each(BRANDING_PRESETS.filter((p) => p.palette).map((p) => [p.name, p.palette!]))(
    '%s is accepted with no readability warnings',
    (_name, palette) => {
      const result = derivePalette(palette);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.warnings).toEqual([]);
    },
  );
});

describe('brandingCssVars', () => {
  it('sets every colour in all three forms the stylesheet reads', () => {
    const vars = brandingCssVars(ANCHOR_COLOURS);
    expect(vars['--color-coral']).toBe('#A57626');
    expect(vars['--coral']).toBe('#A57626');
    expect(vars['--coral-rgb']).toBe('165 118 38');
    expect(vars['--cream-dim']).toBe('#7A8B7F');
    expect(vars['--color-cream-dim']).toBe('#7A8B7F');
    expect(vars['--on-coral']).toBe('#1A1A1A');
    expect(vars['--gold-tint']).toBe('#F0E6C6');
    expect(vars['--coral-headline']).toBe('#C9A020');
    expect(vars['--winner-chip-rgb']).toBe('201 160 32');
    // The eight core triples, plus the winner chip's.
    expect(Object.keys(vars).filter((key) => key.endsWith('-rgb')).sort()).toEqual(
      ['--coral-light-rgb', '--coral-rgb', '--cream-rgb', '--gold-light-rgb', '--gold-rgb', '--green-light-rgb', '--green-rgb', '--ink-rgb', '--winner-chip-rgb'],
    );
  });

  it('emits only custom properties with safe values', () => {
    const result = derivePalette(BRANDING_PRESETS[1].palette!);
    if (!result.ok) throw new Error('preset refused');
    const hex = '#[0-9A-F]{6}';
    const triple = '\\d{1,3} \\d{1,3} \\d{1,3}';
    const safe = new RegExp(
      `^(${hex}|${triple}|rgb\\(${triple} / 0\\.\\d{2}\\)|color-mix\\(in srgb, ${hex} 7%, ${hex}\\))$`,
    );
    for (const [key, value] of Object.entries(brandingCssVars(result.colours))) {
      expect(key).toMatch(/^--[a-z-]+$/);
      expect(value).toMatch(safe);
    }
  });

  it("also sets the kit's register variables, so kit components follow the night", () => {
    const result = derivePalette(BRANDING_PRESETS[1].palette!);
    if (!result.ok) throw new Error('preset refused');
    const vars = brandingCssVars(result.colours);
    expect(vars['--bg']).toBe(result.colours.green);
    expect(vars['--text']).toBe(result.colours.cream);
    expect(vars['--text-muted']).toBe(result.colours.creamDim);
    expect(vars['--accent']).toBe(result.colours.coralLight);
    expect(vars['--on-accent']).toBe(result.colours.onCoral);
    expect(vars['--anchor-gold']).toBe(result.colours.gold);
    expect(vars['--surface']).toBe(`color-mix(in srgb, ${result.colours.cream} 7%, ${result.colours.green})`);
    // The accent on the background and the text on the accent both read.
    expect(contrastRatio(result.colours.coralLight, result.colours.green)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(result.colours.onCoral, result.colours.coralLight)).toBeGreaterThanOrEqual(3);
  });
});

describe('isBrandingLogoUrl', () => {
  it('accepts a file in our own picture store', () => {
    expect(isBrandingLogoUrl(LOGO, OPTS)).toBe(true);
  });

  it('refuses another site, even one copying our path', () => {
    expect(isBrandingLogoUrl('https://evil.example/storage/v1/object/public/quiz-images/x.png', OPTS)).toBe(false);
    expect(isBrandingLogoUrl('https://example.com/logo.png', OPTS)).toBe(false);
  });

  it('refuses another bucket, traversal, credentials and non-URLs', () => {
    expect(isBrandingLogoUrl(`${SUPABASE}/storage/v1/object/public/other/x.png`, OPTS)).toBe(false);
    expect(isBrandingLogoUrl(`${SUPABASE}/storage/v1/object/public/quiz-images/%2E%2E/x.png`, OPTS)).toBe(false);
    expect(isBrandingLogoUrl(`${SUPABASE}/storage/v1/object/public/quiz-images/`, OPTS)).toBe(false);
    expect(isBrandingLogoUrl(LOGO.replace('https://', 'https://user:pw@'), OPTS)).toBe(false);
    expect(isBrandingLogoUrl('javascript:alert(1)', OPTS)).toBe(false);
    expect(isBrandingLogoUrl('data:image/png;base64,AAAA', OPTS)).toBe(false);
    expect(isBrandingLogoUrl(42, OPTS)).toBe(false);
  });

  it('fails closed when the Supabase URL is not configured', () => {
    expect(isBrandingLogoUrl(LOGO, { supabaseUrl: undefined, logoBucket: 'quiz-images' })).toBe(false);
    expect(isBrandingLogoUrl(LOGO, { supabaseUrl: '', logoBucket: 'quiz-images' })).toBe(false);
    expect(isBrandingLogoUrl(LOGO, { supabaseUrl: 'not a url', logoBucket: 'quiz-images' })).toBe(false);
  });

  it('fails closed when no bucket is named, or the name is not a bucket name', () => {
    expect(isBrandingLogoUrl(LOGO, { supabaseUrl: SUPABASE })).toBe(false);
    expect(isBrandingLogoUrl(LOGO, { supabaseUrl: SUPABASE, logoBucket: '../quiz-images' })).toBe(false);
    expect(isBrandingLogoUrl(LOGO, { supabaseUrl: SUPABASE, logoBucket: '' })).toBe(false);
  });

  it('accepts another app\'s own bucket when that app names it', () => {
    const bingo = `${SUPABASE}/storage/v1/object/public/bingo-images/branding/x.png`;
    expect(isBrandingLogoUrl(bingo, { supabaseUrl: SUPABASE, logoBucket: 'bingo-images' })).toBe(true);
    expect(isBrandingLogoUrl(bingo, OPTS)).toBe(false);
  });
});

describe('parseBranding', () => {
  it('keeps a valid look, upper-casing the colours', () => {
    expect(
      parseBranding(
        { palette: { background: '#0d1e3c', text: '#fff6e0', accent: '#d2372c', prize: '#f2c230' }, logo_url: LOGO, print_logo_url: PRINT_LOGO },
        OPTS,
      ),
    ).toEqual({
      palette: { background: '#0D1E3C', text: '#FFF6E0', accent: '#D2372C', prize: '#F2C230' },
      logo_url: LOGO,
      print_logo_url: PRINT_LOGO,
    });
  });

  it('drops only the invalid parts', () => {
    expect(
      parseBranding({ palette: { background: 'navy', text: '#FFFFFF', accent: '#D2372C', prize: '#F2C230' }, logo_url: LOGO }, OPTS),
    ).toEqual({ logo_url: LOGO });
    expect(parseBranding({ palette: ANCHOR_PALETTE, logo_url: 'https://example.com/x.png' }, OPTS)).toEqual({
      palette: ANCHOR_PALETTE,
    });
  });

  it('drops unknown keys and returns null when nothing valid is left', () => {
    expect(parseBranding({ palette: ANCHOR_PALETTE, css: 'body{}' }, OPTS)).toEqual({ palette: ANCHOR_PALETTE });
    expect(parseBranding({}, OPTS)).toBeNull();
    expect(parseBranding(null, OPTS)).toBeNull();
    expect(parseBranding('#003F27', OPTS)).toBeNull();
    expect(parseBranding([ANCHOR_PALETTE], OPTS)).toBeNull();
  });
});

describe('resolveBranding', () => {
  it('is The Anchor, with no CSS at all, when there is no look', () => {
    expect(resolveBranding(undefined, OPTS)).toEqual(ANCHOR_BRANDING);
    expect(resolveBranding(null, OPTS)).toEqual({ cssVars: null, logoUrl: null, printLogoUrl: null });
  });

  it('resolves a full look', () => {
    const resolved = resolveBranding({ palette: BRANDING_PRESETS[2].palette, logo_url: LOGO, print_logo_url: PRINT_LOGO }, OPTS);
    expect(resolved.logoUrl).toBe(LOGO);
    expect(resolved.printLogoUrl).toBe(PRINT_LOGO);
    expect(resolved.cssVars?.['--green']).toBe(BRANDING_PRESETS[2].palette!.background);
  });

  it('keeps The Anchor colours for an unreadable palette but still shows the logo', () => {
    const resolved = resolveBranding({ palette: { background: '#F6EFDD', text: '#003F27', accent: '#E0573B', prize: '#A57626' }, logo_url: LOGO }, OPTS);
    expect(resolved.cssVars).toBeNull();
    expect(resolved.logoUrl).toBe(LOGO);
  });

  it('never throws, whatever it is given', () => {
    const hostile = {
      get palette(): never {
        throw new Error('boom');
      },
    };
    expect(resolveBranding(hostile, OPTS)).toEqual(ANCHOR_BRANDING);
    expect(resolveBranding(Symbol('x'), OPTS)).toEqual(ANCHOR_BRANDING);
  });
});

describe('isSmallScreenLogo', () => {
  it('flags a logo small in both directions', () => {
    expect(isSmallScreenLogo(200, 200)).toBe(true);
    expect(isSmallScreenLogo(459, 229)).toBe(true);
  });

  it('passes a logo big enough in either direction', () => {
    expect(isSmallScreenLogo(460, 100)).toBe(false);
    expect(isSmallScreenLogo(150, 400)).toBe(false);
    expect(isSmallScreenLogo(1200, 600)).toBe(false);
  });

  it('says nothing about a size it could not measure', () => {
    expect(isSmallScreenLogo(0, 0)).toBe(false);
  });
});
