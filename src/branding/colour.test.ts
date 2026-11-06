// From Quiz Night (src/lib/colour.test.ts), unchanged.
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  hexToOklch,
  hexToRgb,
  isHexColour,
  oklchToHex,
  rgbToHex,
  rgbTriple,
} from './colour';

describe('isHexColour', () => {
  it('accepts six-digit codes in either case', () => {
    expect(isHexColour('#003F27')).toBe(true);
    expect(isHexColour('#abcdef')).toBe(true);
  });

  it('refuses anything that could carry more than a colour', () => {
    for (const value of ['003F27', '#03F', '#003F2780', 'red', '#003F27;x:y', '#003F27</style>', '', null, 42]) {
      expect(isHexColour(value)).toBe(false);
    }
  });
});

describe('hex and rgb', () => {
  it('round-trips', () => {
    expect(rgbToHex(hexToRgb('#E0573B'))).toBe('#E0573B');
  });

  it('gives the triple the stylesheet uses', () => {
    expect(rgbTriple('#E0573B')).toBe('224 87 59');
    expect(rgbTriple('#04130C')).toBe('4 19 12');
  });
});

describe('OKLCH', () => {
  it('round-trips the Anchor colours exactly', () => {
    for (const colour of ['#003F27', '#0F6846', '#04130C', '#F6EFDD', '#CDBFA0', '#E0573B', '#F5814F', '#A57626', '#C4952F']) {
      expect(oklchToHex(hexToOklch(colour))).toBe(colour);
    }
  });

  it('keeps an out-of-gamut request inside sRGB by giving up saturation', () => {
    const result = oklchToHex({ l: 0.9, c: 0.4, h: 30 });
    expect(isHexColour(result)).toBe(true);
    // Lightness is kept, so it stays a pale colour rather than clipping to a vivid one.
    expect(hexToOklch(result).l).toBeCloseTo(0.9, 2);
  });

  it('clamps lightness', () => {
    expect(oklchToHex({ l: 1.4, c: 0, h: 0 })).toBe('#FFFFFF');
    expect(oklchToHex({ l: -0.2, c: 0, h: 0 })).toBe('#000000');
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('is symmetric and measures today\'s Anchor pairs', () => {
    expect(contrastRatio('#F6EFDD', '#003F27')).toBeCloseTo(10.52, 1);
    expect(contrastRatio('#003F27', '#F6EFDD')).toBeCloseTo(10.52, 1);
    expect(contrastRatio('#F6EFDD', '#E0573B')).toBeCloseTo(3.27, 1);
  });
});
