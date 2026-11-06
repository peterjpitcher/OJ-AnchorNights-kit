// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, fireEvent } from '@testing-library/react';
import { useRef, type CSSProperties } from 'react';
import { BRANDING_PRESETS, resolveBranding } from '../branding';
import { ConnectionBanner } from './connection-banner';
import { Stage } from './stage';
import { useBuildCheck } from './use-build-check';
import { useClockOffset, readTimeResponse } from './use-clock-offset';
import { useConnectionHealth } from './use-connection-health';
import { useFitStep } from './use-fit-step';

const nosleep = vi.hoisted(() => ({ enable: vi.fn(), disable: vi.fn(), instances: 0 }));

vi.mock('nosleep.js', () => ({
  default: class {
    isEnabled = false;
    constructor() {
      nosleep.instances += 1;
    }
    async enable(): Promise<void> {
      nosleep.enable();
      this.isEnabled = true;
    }
    disable(): void {
      nosleep.disable();
      this.isEnabled = false;
    }
  },
}));

// Imported after the mock is registered.
const { useWakeLock } = await import('./wake-lock');

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
}

beforeEach(() => {
  setOnline(true);
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  nosleep.enable.mockClear();
  nosleep.disable.mockClear();
});

describe('Stage (from Quiz Night DisplayStage)', () => {
  const navy = BRANDING_PRESETS.find((preset) => preset.id === 'navy')?.palette;

  it('puts no style at all on the viewport for The Anchor', () => {
    const { container } = render(
      <Stage>
        <p>Screen</p>
      </Stage>,
    );
    const viewport = container.querySelector('.anchor-stage');
    expect(viewport?.hasAttribute('style')).toBe(false);
    expect(viewport?.hasAttribute('data-branded')).toBe(false);
  });

  it("sets a special night's colours as variables on the viewport only", () => {
    const { cssVars } = resolveBranding({ palette: navy });
    expect(cssVars).not.toBeNull();
    const { container } = render(
      <Stage style={cssVars as CSSProperties}>
        <p>Screen</p>
      </Stage>,
    );
    const viewport = container.querySelector('.anchor-stage') as HTMLElement;
    for (const [name, value] of Object.entries(cssVars ?? {})) {
      expect(viewport.style.getPropertyValue(name)).toBe(value);
    }
    expect(viewport.hasAttribute('data-branded')).toBe(true);
    expect(container.querySelector('.anchor-stage-canvas')?.hasAttribute('style')).toBe(false);
  });

  it('scales the canvas to the window and follows a resize', () => {
    vi.stubGlobal('innerWidth', 960);
    vi.stubGlobal('innerHeight', 540);
    const { container } = render(<Stage>x</Stage>);
    const scaler = container.querySelector('.anchor-stage-scaler') as HTMLElement;
    expect(scaler.style.transform).toBe('translate(-50%, -50%) scale(0.5)');
    vi.stubGlobal('innerWidth', 3840);
    vi.stubGlobal('innerHeight', 2160);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(scaler.style.transform).toBe('translate(-50%, -50%) scale(2)');
  });
});

describe('useFitStep (from Quiz Night)', () => {
  function Probe({ fitsFrom, stepCount, contentKey = 'a' }: { fitsFrom: number; stepCount: number; contentKey?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const step = useFitStep(ref, stepCount, (element) => Number(element.dataset.step) >= fitsFrom, contentKey);
    return (
      <div ref={ref} data-step={step} data-testid="probe">
        {step}
      </div>
    );
  }

  it('stays on the first step when the content fits', () => {
    render(<Probe fitsFrom={0} stepCount={10} />);
    expect(screen.getByTestId('probe').textContent).toBe('0');
  });

  it('advances to the first step that fits before returning', () => {
    render(<Probe fitsFrom={4} stepCount={10} />);
    expect(screen.getByTestId('probe').textContent).toBe('4');
  });

  it('stops at the last step when nothing fits', () => {
    render(<Probe fitsFrom={99} stepCount={28} />);
    expect(screen.getByTestId('probe').textContent).toBe('27');
  });

  it('starts again from the first step when the content changes', () => {
    const { rerender } = render(<Probe fitsFrom={3} stepCount={10} contentKey="a" />);
    expect(screen.getByTestId('probe').textContent).toBe('3');
    rerender(<Probe fitsFrom={1} stepCount={10} contentKey="b" />);
    expect(screen.getByTestId('probe').textContent).toBe('1');
  });
});

describe('useConnectionHealth and ConnectionBanner', () => {
  function Screen({ onReload, unsaved = false }: { onReload: () => void; unsaved?: boolean | (() => boolean) }) {
    const health = useConnectionHealth();
    const { markPollFailure } = health;
    return (
      <>
        <button type="button" onClick={markPollFailure}>
          fail
        </button>
        <ConnectionBanner visible={health.shouldShowBanner} shouldAutoRefresh={health.shouldAutoRefresh} hasUnsavedWork={unsaved} onReload={onReload} />
      </>
    );
  }

  function failAndWait(ms: number): Promise<void> {
    return act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it('shows the banner after 10 seconds without contact, and reloads once at 30 if online', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    const onReload = vi.fn();
    render(<Screen onReload={onReload} />);
    fireEvent.click(screen.getByRole('button', { name: 'fail' }));
    await failAndWait(9_000);
    expect(screen.queryByRole('status')).toBeNull();
    await failAndWait(2_000);
    expect(screen.getByRole('status').textContent).toContain('Reconnecting');
    await failAndWait(18_000);
    expect(onReload).not.toHaveBeenCalled();
    await failAndWait(3_000);
    expect(onReload).toHaveBeenCalledTimes(1);
    await failAndWait(10_000);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('never reloads while offline, says so, and reloads once the browser is back online', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    setOnline(false);
    const onReload = vi.fn();
    render(<Screen onReload={onReload} />);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await failAndWait(40_000);
    expect(screen.getByRole('status').textContent).toContain('No connection');
    expect(onReload).not.toHaveBeenCalled();
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    // Online again but still nothing delivering: the next poll failure keeps it unhealthy.
    fireEvent.click(screen.getByRole('button', { name: 'fail' }));
    await failAndWait(31_000);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('never reloads over unsaved work, and the manual Refresh asks first', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    const onReload = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Screen onReload={onReload} unsaved={() => true} />);
    fireEvent.click(screen.getByRole('button', { name: 'fail' }));
    await failAndWait(40_000);
    expect(onReload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('a poll success clears the banner', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    const { result } = renderHook(() => useConnectionHealth());
    act(() => result.current.markPollFailure());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect(result.current.shouldShowBanner).toBe(true);
    act(() => result.current.markPollSuccess());
    expect(result.current.shouldShowBanner).toBe(false);
    expect(result.current.healthy).toBe(true);
  });
});

describe('useBuildCheck', () => {
  function serveBuild(build: string): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ build }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function settle(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('reloads a TV for a new release once the app says it is safe, and only once', async () => {
    serveBuild('def');
    const onReload = vi.fn();
    let safe = false;
    const { result, rerender } = renderHook(() => useBuildCheck({ mode: 'auto', clientBuild: 'abc', isSafeToReload: () => safe, onReload }));
    await settle();
    expect(result.current.action).toBe('wait');
    expect(onReload).not.toHaveBeenCalled();
    safe = true;
    rerender();
    expect(result.current.action).toBe('reload');
    expect(onReload).toHaveBeenCalledTimes(1);
    rerender();
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('only prompts the host, never reloading by itself', async () => {
    serveBuild('def');
    const onReload = vi.fn();
    const { result } = renderHook(() => useBuildCheck({ mode: 'prompt', clientBuild: 'abc', isSafeToReload: () => true, onReload }));
    await settle();
    expect(result.current.showPrompt).toBe(true);
    expect(onReload).not.toHaveBeenCalled();
    act(() => result.current.reload());
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('never asks the server from a local build', async () => {
    const fetchMock = serveBuild('def');
    renderHook(() => useBuildCheck({ mode: 'auto', clientBuild: 'dev', isSafeToReload: () => true, onReload: vi.fn() }));
    renderHook(() => useBuildCheck({ mode: 'auto', clientBuild: undefined, isSafeToReload: () => true, onReload: vi.fn() }));
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a safety rule that throws as not safe', async () => {
    serveBuild('def');
    const onReload = vi.fn();
    const { result } = renderHook(() =>
      useBuildCheck({
        mode: 'auto',
        clientBuild: 'abc',
        isSafeToReload: () => {
          throw new Error('no game state yet');
        },
        onReload,
      }),
    );
    await settle();
    expect(result.current.action).toBe('wait');
    expect(onReload).not.toHaveBeenCalled();
  });

  it('waits for the network to come back before reloading', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    serveBuild('def');
    setOnline(false);
    const onReload = vi.fn();
    renderHook(() => useBuildCheck({ mode: 'auto', clientBuild: 'abc', isSafeToReload: () => true, onReload }));
    await settle();
    expect(onReload).not.toHaveBeenCalled();
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});

describe('useClockOffset', () => {
  it('reads the offset from the time route', async () => {
    const server = Date.now() + 5_000;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ now: server }), { status: 200 })));
    const { result } = renderHook(() => useClockOffset({ endpoint: '/api/time' }));
    expect(result.current).toBe(0);
    await act(async () => {
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(Math.abs(result.current - 5_000)).toBeLessThan(500);
  });

  it('refuses a time route answer with no usable time', () => {
    expect(readTimeResponse({ now: 1_700_000_000_000 })).toBe(1_700_000_000_000);
    expect(() => readTimeResponse({ now: 'soon' })).toThrow();
    expect(() => readTimeResponse(null)).toThrow();
  });
});

describe('useWakeLock', () => {
  it('locks on mount, lets go when hidden, locks again when visible, and lets go on unmount', async () => {
    const visibility = { state: 'visible' as DocumentVisibilityState };
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility.state });
    const { result, unmount } = renderHook(() => useWakeLock());
    await act(async () => {
      await Promise.resolve();
    });
    expect(nosleep.enable).toHaveBeenCalledTimes(1);
    expect(result.current.isLocked).toBe(true);

    visibility.state = 'hidden';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(nosleep.disable).toHaveBeenCalledTimes(1);
    expect(result.current.isLocked).toBe(false);

    visibility.state = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(nosleep.enable).toHaveBeenCalledTimes(2);
    expect(result.current.isLocked).toBe(true);

    unmount();
    expect(nosleep.disable).toHaveBeenCalledTimes(2);
  });
});
