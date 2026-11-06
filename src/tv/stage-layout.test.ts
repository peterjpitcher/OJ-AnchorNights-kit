// The Stage scales a 1920x1080 canvas with a CSS transform. These guard the
// two ways that went wrong in 2.0.0: fitting measured some figures scaled and
// some not, and the vh-based TV text sizes were scaled twice.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawnScale, layoutFits, measureLayout } from './fit';

interface CanvasBox {
  top: number;
  bottom: number;
  width?: number;
}

/**
 * A column `height` canvas pixels tall, drawn at `scale` the way a browser
 * reports it: getBoundingClientRect scaled, clientHeight and offsetHeight not.
 */
function column(height: number, scale: number, children: CanvasBox[]): HTMLElement {
  const screenTop = 137;
  const rect = ({ top, bottom, width = 600 }: CanvasBox): DOMRect =>
    ({
      top: screenTop + top * scale,
      bottom: screenTop + bottom * scale,
      width: width * scale,
      height: (bottom - top) * scale,
    }) as DOMRect;
  const kids = children.map((child) => ({ getBoundingClientRect: () => rect(child) }));
  return {
    clientHeight: height,
    offsetHeight: height,
    getBoundingClientRect: () => rect({ top: 0, bottom: height }),
    querySelectorAll: () => kids,
  } as unknown as HTMLElement;
}

const SCALES = [0.5, 2 / 3, 0.7875, 1, 2];

describe('drawnScale', () => {
  it('is the on-screen height over the layout height', () => {
    expect(drawnScale(540, 1080)).toBe(0.5);
    expect(drawnScale(2160, 1080)).toBe(2);
    expect(drawnScale(900, 900)).toBe(1);
  });

  it('is 1 for an element with no size, never a division by zero', () => {
    expect(drawnScale(0, 0)).toBe(1);
    expect(drawnScale(0, 900)).toBe(1);
    expect(drawnScale(450, 0)).toBe(1);
  });
});

describe('measureLayout inside a scaled Stage', () => {
  beforeEach(() => {
    vi.stubGlobal('getComputedStyle', () => ({ paddingBottom: '40px' }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports canvas pixels at every scale', () => {
    for (const scale of SCALES) {
      const metrics = measureLayout(column(900, scale, [{ top: 20, bottom: 300 }, { top: 300, bottom: 840 }]));
      expect(metrics.containerHeight).toBe(900);
      expect(metrics.paddingBottom).toBe(40);
      expect(metrics.contentTop).toBeCloseTo(0);
      expect(metrics.contentBottom).toBeCloseTo(840);
    }
  });

  it('gives the same verdict at every scale (2.0.0 failed this on a 4K TV and a laptop)', () => {
    for (const scale of SCALES) {
      expect(layoutFits(measureLayout(column(900, scale, [{ top: 100, bottom: 860 }])))).toBe(true);
      expect(layoutFits(measureLayout(column(900, scale, [{ top: 100, bottom: 870 }])))).toBe(false);
    }
  });

  it('fails a centred column whose content spills above its top', () => {
    for (const scale of SCALES) {
      const metrics = measureLayout(column(900, scale, [{ top: -40, bottom: 820 }]));
      expect(metrics.contentTop).toBeCloseTo(-40);
      expect(layoutFits(metrics)).toBe(false);
    }
  });

  it('skips elements with no size (display: none reports a zero rectangle at the origin)', () => {
    const el = column(900, 0.5, [{ top: 100, bottom: 500 }]);
    const hidden = { getBoundingClientRect: () => ({ top: 0, bottom: 0, width: 0, height: 0 }) };
    const kids = [...Array.from(el.querySelectorAll('*')), hidden];
    (el as unknown as { querySelectorAll: () => unknown[] }).querySelectorAll = () => kids;
    const metrics = measureLayout(el);
    expect(metrics.contentTop).toBe(0);
    expect(layoutFits(metrics)).toBe(true);
  });

  it('counts a column not laid out yet as fitting', () => {
    expect(layoutFits(measureLayout(column(0, 1, [{ top: 0, bottom: 50 }])))).toBe(true);
  });
});

describe('layoutFits and contentTop', () => {
  it('allows a pixel of rounding above the top, like the bottom', () => {
    expect(layoutFits({ containerHeight: 900, paddingBottom: 0, contentBottom: 800, contentTop: -1 })).toBe(true);
    expect(layoutFits({ containerHeight: 900, paddingBottom: 0, contentBottom: 800, contentTop: -2 })).toBe(false);
  });

  it('checks only the bottom when contentTop is left out, as before', () => {
    expect(layoutFits({ containerHeight: 900, paddingBottom: 0, contentBottom: 800 })).toBe(true);
  });
});

describe('TV text sizes inside and outside a Stage (tokens.css)', () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'tokens', 'tokens.css'), 'utf8');

  /** The 1920x1080 size each token is documented at (tv-text.ts), before rounding. */
  const AT_1080: Record<string, number> = {
    xs: 32.4,
    sm: 37.8,
    base: 44.28,
    lg: 56.16,
    xl: 70.2,
    '2xl': 86.4,
    '3xl': 118.8,
    '4xl': 144,
  };

  /** Resolves clamp(min, calc(n * var(--anchor-vX, 1vX)), max) for a given vh and vw in px. */
  function resolve(token: string, vh: number, vw: number): number {
    const match = new RegExp(`--text-tv-${token}: clamp\\((\\d+(?:\\.\\d+)?)px, calc\\((\\d+(?:\\.\\d+)?) \\* var\\(--anchor-(vh|vw), 1(vh|vw)\\)\\), (\\d+(?:\\.\\d+)?)px\\);`).exec(css);
    expect(match, `--text-tv-${token} reads var(--anchor-vh) or var(--anchor-vw)`).not.toBeNull();
    const [, min, n, unit, fallback, max] = match as RegExpExecArray;
    expect(fallback).toBe(unit);
    const preferred = Number(n) * (unit === 'vh' ? vh : vw);
    return Math.min(Number(max), Math.max(Number(min), preferred));
  }

  it('sets one canvas vh and vw on the Stage canvas', () => {
    const start = css.indexOf('.anchor-stage-canvas {');
    const canvas = css.slice(start, css.indexOf('}', start));
    expect(canvas).toContain('--anchor-vh: 10.8px;');
    expect(canvas).toContain('--anchor-vw: 19.2px;');
  });

  it('inside a Stage, every size is its 1080p size in canvas pixels whatever the window', () => {
    for (const [token, px] of Object.entries(AT_1080)) {
      expect(resolve(token, 10.8, 19.2)).toBeCloseTo(px, 5);
    }
  });

  it('outside a Stage, the sizes still follow the window (unchanged from 2.0.0)', () => {
    // A 1280x720 window, where nothing sets --anchor-vh and 1vh is 7.2px.
    expect(resolve('xs', 7.2, 12.8)).toBe(22);
    expect(resolve('base', 7.2, 12.8)).toBe(30);
    expect(resolve('lg', 7.2, 12.8)).toBeCloseTo(37.44, 5);
    // A 1920x1080 window matches the Stage exactly.
    for (const [token, px] of Object.entries(AT_1080)) {
      expect(resolve(token, 10.8, 19.2)).toBeCloseTo(px, 5);
    }
  });

  it('the promo slides never use a bare vh or vw, which would scale twice in a Stage', () => {
    const dir = join(import.meta.dirname, '..', 'promo');
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.tsx') && !name.includes('.test.'))) {
      // Code only: comments may describe sizes in vh.
      const code = readFileSync(join(dir, file), 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n')
        .replace(/var\(--anchor-v([hw]),\s*1v\1\)/g, '');
      const bare = code.match(/(?<![\w-])\d+(?:\.\d+)?v[hw]\b/g) ?? [];
      expect(bare, file).toEqual([]);
    }
  });
});
