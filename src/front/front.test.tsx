// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { buildOtherNights, copyrightText, FrontPage, NIGHT_LABELS, safeNightUrl } from './index';

afterEach(cleanup);

const URLS = {
  quiz: 'https://quiz.example.test',
  cash: 'https://bingo.example.test/',
  music: 'https://musicbingo.example.test',
  tasting: 'https://tastingnight.example.test',
};

describe('buildOtherNights', () => {
  it('lists every night but this one, in order, from the URLs the app passes', () => {
    expect(buildOtherNights({ current: 'cash', urls: URLS })).toEqual([
      { key: 'quiz', name: 'Quiz Night', href: 'https://quiz.example.test/' },
      { key: 'music', name: 'Music Bingo', href: 'https://musicbingo.example.test/' },
      { key: 'tasting', name: 'Tasting Night', href: 'https://tastingnight.example.test/' },
    ]);
  });

  it('leaves out a night with no URL or an unsafe one', () => {
    const nights = buildOtherNights({ current: 'quiz', urls: { cash: '', music: 'http://musicbingo.example.test', tasting: 'javascript:alert(1)' } });
    expect(nights).toEqual([]);
    expect(safeNightUrl('http://localhost:3001')).toBe('http://localhost:3001/');
    expect(safeNightUrl('https://user:pw@quiz.example.test')).toBeNull();
    expect(safeNightUrl('not a url')).toBeNull();
  });
});

describe('FrontPage', () => {
  it('shows the three tiles with their default links and the other nights', () => {
    render(<FrontPage appName="Bingo night" otherNights={buildOtherNights({ current: 'cash', urls: URLS })} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Bingo night');
    const tiles = within(screen.getByRole('navigation', { name: 'Where to go' })).getAllByRole('link');
    expect(tiles.map((a) => [a.textContent?.split(/(?=[A-Z][a-z])/)[0], a.getAttribute('href')])).toEqual([
      ['Host console', '/host'],
      ['Pub TV', '/tv'],
      ['Admin', '/admin'],
    ]);
    const others = within(screen.getByRole('navigation', { name: 'Other nights' })).getAllByRole('link');
    expect(others.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Quiz Night', 'https://quiz.example.test/'],
      ['Music Bingo', 'https://musicbingo.example.test/'],
      ['Tasting Night', 'https://tastingnight.example.test/'],
    ]);
  });

  it("uses the app's own links, hints and link component", () => {
    const Link = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }): React.ReactElement => (
      <a href={href} className={className} data-app-link="">
        {children}
      </a>
    );
    render(
      <FrontPage
        appName="Quiz Night"
        tiles={{ tv: { href: '/display' }, admin: { href: '/admin', hint: 'Sessions, pots and winners' } }}
        linkComponent={Link}
        showCopyright={false}
      />,
    );
    expect(screen.getByText('Pub TV').closest('a')?.getAttribute('href')).toBe('/display');
    expect(screen.getByText('Sessions, pots and winners')).toBeTruthy();
    expect(document.querySelectorAll('[data-app-link]')).toHaveLength(3);
    expect(screen.queryByRole('navigation', { name: 'Other nights' })).toBeNull();
    expect(screen.queryByText(/Orange Jelly/)).toBeNull();
  });

  it('shows the copyright year as it is in London', () => {
    expect(copyrightText(new Date('2026-12-31T23:30:00Z'))).toContain('2026');
    expect(copyrightText(new Date('2027-01-01T00:30:00Z'))).toContain('2027');
    render(<FrontPage appName="x" />);
    expect(screen.getByText(/Orange Jelly Limited\. All rights reserved\./)).toBeTruthy();
  });

  it('names the nights the way the pub does', () => {
    expect(Object.values(NIGHT_LABELS)).toEqual(['Quiz Night', 'Cash Bingo', 'Music Bingo', 'Tasting Night']);
  });

  it('has no hostnames in its source', () => {
    for (const name of readdirSync(import.meta.dirname).filter((n) => !n.includes('.test.'))) {
      const text = readFileSync(join(import.meta.dirname, name), 'utf8');
      expect(text, name).not.toMatch(/https?:\/\/[a-z]|the-anchor\.pub|vercel\.app|orangejelly\.co\.uk/i);
    }
  });
});
