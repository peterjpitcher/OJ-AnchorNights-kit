// Guards on tokens.css: no invented colours, both registers complete, and
// every colour class the kit's components use is defined.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANCHOR_HEX, FONT_VARIABLES, THEME_CLASS } from './index';

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');

/**
 * Every hex value the Anchor palette has, from the two sources the spec names:
 * Cash Bingo src/app/globals.css (C) and Quiz Night src/app/styles/tokens.css
 * and anchor.css (Q). #000 is Quiz Night's letterbox behind the TV stage.
 */
const SOURCE_HEX = new Set([
  '#005131', // C, Q anchor green
  '#003d25', // C, Q green dark
  '#0c1d11', // C, Q green deep (night page)
  '#132318', // C, Q green raised
  '#172d1e', // C, Q green card
  '#006b45', // C, Q green light, success
  '#081509', // C surface sunk, Q ink
  '#7a8b7f', // C, Q sage
  '#a57626', // C, Q gold
  '#8b6914', // C, Q gold dark
  '#c9a020', // C, Q gold bright
  '#1a1a1a', // C, Q charcoal
  '#faf8f3', // C, Q cream
  '#f0e6c6', // C, Q cream text
  '#f5e6d3', // C, Q sand
  '#6f6a61', // C, Q grey 500
  '#b1372f', // C, Q danger
  '#6ddaa1', // C success text, Q dark success badge
  '#e57368', // C danger text
  '#ffffff', // Q desk surface, white
  '#f2ede3', // Q desk surface sunk
  '#e2dccf', // Q line
  '#d2c9b4', // Q line strong
  '#000', // Q stage letterbox
]);

function block(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

function names(text: string, pattern: RegExp): Set<string> {
  return new Set(Array.from(text.matchAll(pattern), (match) => match[1]));
}

describe('tokens.css', () => {
  it('uses only the Anchor palette, never a new hex value', () => {
    const used = Array.from(css.matchAll(/#[0-9a-fA-F]{3,8}\b/g), (match) => match[0].toLowerCase());
    expect(used.filter((hex) => !SOURCE_HEX.has(hex))).toEqual([]);
  });

  it('defines the same variables for night and desk', () => {
    const night = names(block(':root,\n.theme-night'), /(--[a-z-]+):/g);
    const desk = names(block('.theme-desk,\n[data-theme="desk"]'), /(--[a-z-]+):/g);
    expect([...desk].sort()).toEqual([...night].sort());
  });

  it('keeps the night register exactly as Cash Bingo has it', () => {
    const night = block(':root,\n.theme-night');
    expect(night).toContain('--bg: #0c1d11;');
    expect(night).toContain('--surface: #172d1e;');
    expect(night).toContain('--text: #f0e6c6;');
    expect(night).toContain('--text-muted: #7a8b7f;');
    expect(night).toContain('--accent: #c9a020;');
    expect(night).toContain('--border-gold: rgba(201, 160, 32, 0.55);');
  });

  it('wires the three Anchor fonts to the next/font variables', () => {
    expect(css).toContain(`--font-display: var(${FONT_VARIABLES.display}), "Times New Roman", serif;`);
    expect(css).toContain(`--font-sans: var(${FONT_VARIABLES.body}),`);
    expect(css).toContain(`--font-script: var(${FONT_VARIABLES.script}),`);
  });

  it('is an inline theme, so a special night re-skins components through variables', () => {
    expect(css).toMatch(/@theme inline \{/);
  });

  it('has a selector for each register class', () => {
    expect(css).toContain(`.${THEME_CLASS.night}`);
    expect(css).toContain(`.${THEME_CLASS.desk}`);
  });

  it('switches off animation for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  });

  it('keeps ANCHOR_HEX equal to the palette', () => {
    for (const hex of Object.values(ANCHOR_HEX)) expect(SOURCE_HEX.has(hex), hex).toBe(true);
  });
});

describe('component classes', () => {
  // Every colour a component names must exist in @theme, or Tailwind silently
  // drops the class and the component renders unstyled.
  const themeColours = names(css, /--color-([a-z0-9-]+):/g);
  const builtIn = new Set(['white', 'black', 'transparent', 'current', 'inherit']);
  // Non-colour suffixes that share the bg-, text- and border- prefixes.
  const notColours =
    /^(xs|sm|base|lg|xl|[2-9]xl|left|right|center|justify|balance|pretty|wrap|nowrap|ellipsis|clip|solid|dashed|none|t|b|l|r|x|y|[0-9]+|\[.*\]|tv-.+|card|input|full|collapse|separate|opacity-.+)$/;

  // Every module that ships components or class strings: ui, and the tv screens.
  const sources = ['ui', 'tv']
    .flatMap((dir) => {
      const full = join(import.meta.dirname, '..', dir);
      return readdirSync(full)
        .filter((file) => /\.tsx?$/.test(file) && !file.includes('.test.'))
        .map((file) => readFileSync(join(full, file), 'utf8'));
    })
    .join('\n');

  it('names only colours that tokens.css defines', () => {
    const pattern = /(?:^|[\s'"`:])(?:bg|text|border(?:-[trblxy])?|outline|ring|fill|stroke|placeholder|divide)-([a-z][a-z0-9-]*)(?:\/[^\s'"`]+)?(?=[\s'"`]|$)/g;
    const unknown = new Set<string>();
    for (const match of sources.matchAll(pattern)) {
      const name = match[1];
      if (builtIn.has(name) || notColours.test(name) || themeColours.has(name)) continue;
      unknown.add(name);
    }
    expect([...unknown]).toEqual([]);
  });
});
