// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import {
  AnchorLogo,
  Badge,
  Banner,
  Button,
  Card,
  Dock,
  EmptyState,
  HoldButton,
  Input,
  Kicker,
  Modal,
  Sheet,
  Spinner,
  UndoSlot,
  buttonClass,
  cardClass,
  cn,
} from './index';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.style.overflow = '';
});

describe('cn', () => {
  it('lets a later class win, including the kit radius, shadow and TV size names', () => {
    expect(cn('rounded-card', 'rounded-full')).toBe('rounded-full');
    expect(cn('shadow-gold', 'shadow-lift')).toBe('shadow-lift');
    expect(cn('text-tv-base', 'text-white')).toBe('text-tv-base text-white');
    expect(cn('text-tv-base', 'text-tv-lg')).toBe('text-tv-lg');
  });
});

describe('Button', () => {
  it('is a primary pill by default, with a 44px minimum at the small size', () => {
    expect(buttonClass()).toContain('bg-anchor-gold');
    expect(buttonClass({ size: 'sm' })).toContain('min-h-11');
    expect(buttonClass({ variant: 'ghost', tone: 'quiet' })).toContain('text-fg-muted');
    expect(buttonClass({ variant: 'outline', className: 'w-auto' })).toContain('w-auto');
  });

  it('is disabled and busy while loading, and shows a spinner', () => {
    render(<Button isLoading>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('keeps the native button type, so a Button in a form still submits', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBeNull();
  });
});

describe('Card, Badge, Kicker, Input, Spinner', () => {
  it('builds card classes from the register tokens', () => {
    expect(cardClass()).toContain('bg-surface');
    expect(cardClass({ accent: true })).toContain('border-t-card-accent');
    render(<Card data-testid="card">x</Card>);
    expect(screen.getByTestId('card').className).toContain('rounded-card');
  });

  it('renders a badge with an optional live dot', () => {
    const { container } = render(
      <Badge variant="success" dot>
        Running
      </Badge>,
    );
    expect(container.textContent).toBe('Running');
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders the kicker as the element asked for', () => {
    const { container } = render(<Kicker as="p">Game 2</Kicker>);
    expect(container.querySelector('p.kicker')?.textContent).toBe('Game 2');
  });

  it('passes props through to the input', () => {
    render(<Input aria-label="Team name" aria-invalid="true" defaultValue="Quizzly Bears" />);
    expect(screen.getByLabelText('Team name')).toHaveProperty('value', 'Quizzly Bears');
  });

  it('hides a decorative spinner and labels a standalone one', () => {
    const { container, rerender } = render(<Spinner />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    rerender(<Spinner label="Loading" />);
    expect(screen.getByRole('status', { name: 'Loading' })).not.toBeNull();
  });
});

describe('Modal', () => {
  function Harness({ onClose = () => undefined, showCloseButton = true }: { onClose?: () => void; showCloseButton?: boolean }) {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        <Modal
          isOpen={open}
          showCloseButton={showCloseButton}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          title="Void the number?"
          kicker="Game 2"
          footer={<button type="button">Void</button>}
        >
          <p>Body</p>
        </Modal>
      </>
    );
  }

  it('is a labelled modal dialog that renders nothing when closed', () => {
    const { rerender } = render(<Modal isOpen={false} onClose={() => undefined} title="T">x</Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<Modal isOpen onClose={() => undefined} title="Void the number?">x</Modal>);
    expect(screen.getByRole('dialog', { name: 'Void the number?' }).getAttribute('aria-modal')).toBe('true');
  });

  it('focuses the close button, closes on Escape, and locks the page scroll while open', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('unset');
  });

  it('cannot be dismissed by Escape without a close button', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} showCloseButton={false} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('traps Tab inside the dialog', () => {
    render(<Harness />);
    const close = screen.getByRole('button', { name: 'Close' });
    const voidButton = screen.getByRole('button', { name: 'Void' });
    voidButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(voidButton);
  });
});

describe('Sheet', () => {
  it('names itself by its title, even with a custom header', () => {
    render(
      <Sheet isOpen onClose={() => undefined} title="Check a claim" header={<p>3 numbers</p>}>
        <p>Grid</p>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Check a claim' })).not.toBeNull();
  });

  it('keeps the page locked while a dialog over it closes', () => {
    const { rerender } = render(
      <>
        <Sheet isOpen onClose={() => undefined} title="Sheet">
          x
        </Sheet>
        <Modal isOpen onClose={() => undefined} title="Modal">
          y
        </Modal>
      </>,
    );
    rerender(
      <>
        <Sheet isOpen onClose={() => undefined} title="Sheet">
          x
        </Sheet>
        <Modal isOpen={false} onClose={() => undefined} title="Modal">
          y
        </Modal>
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');
  });
});

describe('HoldButton', () => {
  function fakeClock(): void {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
  }

  it('runs the action only once the hold is full, then shows it done', async () => {
    fakeClock();
    const onDone = vi.fn(() => true);
    render(<HoldButton label="Hold to end the night" onDone={onDone} />);
    const button = screen.getByRole('button', { name: 'Hold to end the night. Press and hold.' });
    fireEvent.pointerDown(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button').textContent).toContain('End the night');
  });

  it('cancels when let go early', async () => {
    fakeClock();
    const onDone = vi.fn();
    render(<HoldButton label="Hold to reset" onDone={onDone} />);
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.pointerUp(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onDone).not.toHaveBeenCalled();
  });

  it('goes back to the hold face when the action is refused', async () => {
    fakeClock();
    render(<HoldButton label="Hold to delete the team" onDone={() => Promise.resolve(false)} />);
    fireEvent.pointerDown(screen.getByRole('button'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(screen.getByRole('button', { name: 'Hold to delete the team. Press and hold.' })).not.toBeNull();
  });

  it('can be held from the keyboard with Space', async () => {
    fakeClock();
    const onDone = vi.fn();
    render(<HoldButton label="Hold to void" onDone={onDone} />);
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: ' ' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', async () => {
    fakeClock();
    const onDone = vi.fn();
    render(<HoldButton label="Hold to void" onDone={onDone} disabled />);
    fireEvent.pointerDown(screen.getByRole('button'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('UndoSlot', () => {
  it('counts down and calls onGone when the time is up', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-11-06T20:00:00Z'));
    const onGone = vi.fn();
    const onUndo = vi.fn();
    render(<UndoSlot done="Revealed wine 3" label="Undo" until={Date.now() + 3000} onUndo={onUndo} onGone={onGone} />);
    expect(screen.getByRole('status').textContent).toContain('Revealed wine 3');
    expect(screen.getByRole('button').textContent).toContain('Undo · 3');
    fireEvent.click(screen.getByRole('button'));
    expect(onUndo).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3200);
    });
    // onGone is scheduled straight after the render that reaches zero.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(onGone).toHaveBeenCalled();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Dock, Banner, EmptyState, AnchorLogo', () => {
  it('pins the actions and labels the tab row', () => {
    render(<Dock nav={<button type="button">Run</button>}>{<button type="button">Next</button>}</Dock>);
    expect(screen.getByRole('navigation', { name: 'Console' })).not.toBeNull();
  });

  it('announces danger straight away and the rest politely', () => {
    const { rerender } = render(<Banner tone="danger" title="That did not save" />);
    expect(screen.getByRole('alert').textContent).toContain('That did not save');
    rerender(<Banner tone="info" title="New version ready" />);
    expect(screen.getByRole('status')).not.toBeNull();
  });

  it('shows a title, a description and an action', () => {
    render(<EmptyState title="No quizzes yet" description="Build one to get started." action={<button type="button">New quiz</button>} />);
    expect(screen.getByRole('heading', { name: 'No quizzes yet' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'New quiz' })).not.toBeNull();
  });

  it('renders the wordmark at twice its height in width', () => {
    render(<AnchorLogo height={40} priority />);
    const img = screen.getByRole('img', { name: 'The Anchor' });
    expect(img.getAttribute('width')).toBe('80');
    expect(img.getAttribute('src')).toBe('/the-anchor-pub-logo-white-transparent.png');
    expect(img.getAttribute('loading')).toBe('eager');
  });
});
