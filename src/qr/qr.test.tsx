// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Qr } from './qr';

afterEach(cleanup);

describe('Qr', () => {
  it('draws a real link as an SVG with its title', () => {
    const { container } = render(<Qr value="https://bingo.the-anchor.pub/play" title="QR code: follow along" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-label')).toBe('QR code: follow along');
    expect(container.querySelector('title')?.textContent).toBe('QR code: follow along');
  });

  it('draws nothing at all for an empty value, never a placeholder', () => {
    for (const value of ['', '   ', null, undefined]) {
      const { container } = render(<Qr value={value} title="QR" />);
      expect(container.innerHTML).toBe('');
      cleanup();
    }
  });

  it('draws nothing for a localhost link a phone cannot open', () => {
    const { container } = render(<Qr value="http://localhost:3000/play" title="QR" />);
    expect(container.innerHTML).toBe('');
  });
});
