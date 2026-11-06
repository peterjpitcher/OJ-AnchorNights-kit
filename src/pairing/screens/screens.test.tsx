// @vitest-environment jsdom
// The pairing screens with stub endpoints and actions: the TV never shows a
// made-up code, says when it cannot reach the server, asks for a new code
// when one runs out, and reloads once paired; the host forms show the
// person whatever went wrong.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AuthFormState } from '../../auth/shared';
import { PAIRING_MESSAGES, type TvDevice, type TvDeviceRow, type TvView } from '../shared';
import { TvPageShell } from '../page-shell';
import { PairTvForm, TV_PAIRING_MESSAGES, TvDevicesPanel, TvNotice, TvPairingScreen, tvNavigation } from './index';

type Reply = { status: number; body: unknown } | Error;

let posts: Reply[] = [];
let gets: Reply[] = [];
const fetchMock = vi.fn(async (_url: string, init?: RequestInit): Promise<Response> => {
  const queue = init?.method === 'POST' ? posts : gets;
  const next = queue.length > 1 ? queue.shift()! : queue[0];
  if (!next) throw new Error('no reply queued');
  if (next instanceof Error) throw next;
  return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'Content-Type': 'application/json' } });
});

const code = (value = '123456'): Reply => ({ status: 200, body: { status: 'code', code: value, expiresInSeconds: 600, pollMs: 3000 } });

beforeEach(() => {
  posts = [];
  gets = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(tvNavigation, 'reload').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('TvPairingScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('shows the code from the server, large and grouped, and asks for it once', async () => {
    posts = [code('012345')];
    gets = [{ status: 200, body: { status: 'waiting' } }];
    render(<TvPairingScreen appName="Quiz Night" />);
    await flush();
    expect(screen.getByLabelText('Pairing code 0 1 2 3 4 5').textContent).toBe('012 345');
    expect(screen.getByText('Quiz Night: pair this screen')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/tv/pairing', expect.objectContaining({ method: 'POST', cache: 'no-store' }));
  });

  it('polls every 3 seconds and reloads once paired', async () => {
    posts = [code()];
    gets = [{ status: 200, body: { status: 'waiting' } }, { status: 200, body: { status: 'paired' } }];
    render(<TvPairingScreen />);
    await flush();
    await flush(3000);
    expect(tvNavigation.reload).not.toHaveBeenCalled();
    await flush(3000);
    expect(tvNavigation.reload).toHaveBeenCalledTimes(1);
  });

  it('asks for a new code when the server says this one has gone', async () => {
    posts = [code('111111'), code('222222')];
    gets = [{ status: 200, body: { status: 'expired' } }];
    render(<TvPairingScreen />);
    await flush();
    expect(screen.getByText('111 111')).toBeTruthy();
    await flush(3000);
    expect(screen.getByText('222 222')).toBeTruthy();
  });

  it('asks for a new code by itself after 10 minutes', async () => {
    posts = [code('111111'), code('333333')];
    gets = [{ status: 200, body: { status: 'waiting' } }];
    render(<TvPairingScreen />);
    await flush();
    await flush(600_000 + 3000);
    expect(screen.getByText('333 333')).toBeTruthy();
  });

  it('shows no code, says so and retries when a code cannot be had', async () => {
    posts = [new Error('Failed to fetch'), { status: 503, body: { status: 'unavailable' } }, code('444444')];
    render(<TvPairingScreen />);
    await flush();
    expect(screen.getByRole('status').textContent).toBe(TV_PAIRING_MESSAGES.unavailable);
    expect(screen.queryByLabelText(/Pairing code/)).toBeNull();
    await flush(5000);
    expect(screen.getByRole('status').textContent).toBe(TV_PAIRING_MESSAGES.unavailable);
    await flush(10_000);
    expect(screen.getByText('444 444')).toBeTruthy();
  });

  it('tells the room when the connection asked too often, and waits as told', async () => {
    posts = [{ status: 429, body: { status: 'rate_limited', retryAfterSeconds: 60 } }, code('555555')];
    render(<TvPairingScreen />);
    await flush();
    expect(screen.getByRole('status').textContent).toBe(TV_PAIRING_MESSAGES.rateLimited);
    await flush(30_000);
    expect(screen.queryByText('555 555')).toBeNull();
    await flush(30_000);
    expect(screen.getByText('555 555')).toBeTruthy();
  });

  it('refuses a malformed code from the server', async () => {
    posts = [{ status: 200, body: { status: 'code', code: '12ab', expiresInSeconds: 600, pollMs: 3000 } }];
    render(<TvPairingScreen />);
    await flush();
    expect(screen.queryByText('12ab')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(TV_PAIRING_MESSAGES.unavailable);
  });

  it('keeps the code but says the connection is lost when polls fail', async () => {
    posts = [code()];
    gets = [new Error('offline')];
    render(<TvPairingScreen />);
    await flush();
    await flush(3000);
    expect(screen.getByText('123 456')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(TV_PAIRING_MESSAGES.connectionLost);
    expect(tvNavigation.reload).not.toHaveBeenCalled();
  });

  it('reloads straight away when the server says this screen is already paired', async () => {
    posts = [{ status: 200, body: { status: 'paired' } }];
    render(<TvPairingScreen />);
    await flush();
    expect(tvNavigation.reload).toHaveBeenCalledTimes(1);
  });
});

describe('TvNotice and TvPageShell', () => {
  const device: TvDevice = { id: 'd1', name: 'Bar TV', createdAt: '2026-11-06T20:00:00Z', lastSeenAt: null };
  const shell = (view: TvView<string>): React.ReactElement => (
    <TvPageShell view={view} renderGame={(game, d, rehearsal) => <p>game {game} on {d.name}{rehearsal ? ' (rehearsal)' : ''}</p>} renderIdle={(d) => <p>idle on {d.name}</p>} />
  );

  it('shows the game, the idle loop or the code by view', async () => {
    vi.useFakeTimers();
    posts = [code()];
    gets = [{ status: 200, body: { status: 'waiting' } }];
    const { rerender } = render(shell({ kind: 'game', device, game: 'g1', rehearsal: true }));
    expect(screen.getByText('game g1 on Bar TV (rehearsal)')).toBeTruthy();
    rerender(shell({ kind: 'idle', device, rehearsal: false }));
    expect(screen.getByText('idle on Bar TV')).toBeTruthy();
    rerender(shell({ kind: 'unpaired' }));
    await flush();
    expect(screen.getByText('123 456')).toBeTruthy();
  });

  it('shows the reconnecting notice on an outage, shows no game, and reloads after 30 seconds', async () => {
    vi.useFakeTimers();
    render(shell({ kind: 'unavailable', reason: 'resolver' }));
    expect(screen.getByRole('status').textContent).toBe('Reconnecting');
    expect(screen.queryByText(/game/)).toBeNull();
    await flush(29_000);
    expect(tvNavigation.reload).not.toHaveBeenCalled();
    await flush(1000);
    expect(tvNavigation.reload).toHaveBeenCalledTimes(1);
  });

  it('TvNotice stays put without a reload time', async () => {
    vi.useFakeTimers();
    render(<TvNotice title="Paused" />);
    await flush(120_000);
    expect(tvNavigation.reload).not.toHaveBeenCalled();
  });
});

describe('PairTvForm', () => {
  const failing = (error: string, field?: string) =>
    vi.fn(async (): Promise<AuthFormState> => ({ status: 'error', code: 'validation_failed', error, field }));

  it('sends the code and name and shows the field error from the action', async () => {
    const action = failing(PAIRING_MESSAGES.codeWrong, 'code');
    render(<PairTvForm action={action} />);
    fireEvent.change(screen.getByLabelText('Code on the TV'), { target: { value: '123 456' } });
    fireEvent.change(screen.getByLabelText('Name for this TV'), { target: { value: 'Bar TV' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pair TV' }));
    });
    expect(await screen.findByText(PAIRING_MESSAGES.codeWrong)).toBeTruthy();
    const sent = action.mock.calls[0] as unknown as [AuthFormState, FormData];
    expect(sent[1].get('code')).toBe('123 456');
    expect(sent[1].get('name')).toBe('Bar TV');
  });

  it('shows a locked message as an alert', async () => {
    render(<PairTvForm action={failing(PAIRING_MESSAGES.locked)} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pair TV' }));
    });
    expect((await screen.findByRole('alert')).textContent).toContain(PAIRING_MESSAGES.locked);
  });

  it('shows a service message when the action cannot be reached', async () => {
    const action = vi.fn(async (): Promise<AuthFormState> => {
      throw new Error('Failed to fetch');
    });
    render(<PairTvForm action={action} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pair TV' }));
    });
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not reach/i);
  });

  it('confirms a pairing and clears the form', async () => {
    const action = vi.fn(async (): Promise<AuthFormState> => ({ status: 'ok', message: PAIRING_MESSAGES.paired }));
    render(<PairTvForm action={action} />);
    const input = screen.getByLabelText('Code on the TV') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pair TV' }));
    });
    expect(await screen.findByText(PAIRING_MESSAGES.paired)).toBeTruthy();
    await waitFor(() => expect(input.value).toBe(''));
  });
});

describe('TvDevicesPanel', () => {
  const row: TvDeviceRow = {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Bar TV',
    createdAt: '2026-11-06T20:00:00Z',
    lastSeenAt: '2026-07-01T19:00:00Z',
    createdBy: 'u1',
    createdByEmail: 'host@example.test',
    revokedAt: null,
  };

  it('lists TVs with London times, and says when there are none', () => {
    const { rerender } = render(<TvDevicesPanel devices={[row]} revokeAction={vi.fn()} />);
    expect(screen.getByText('Bar TV')).toBeTruthy();
    expect(screen.getByText(/by host@example\.test/)).toBeTruthy();
    expect(screen.getByText(/Last seen .*20:00/)).toBeTruthy();
    rerender(<TvDevicesPanel devices={[]} revokeAction={vi.fn()} />);
    expect(screen.getByText('No TVs are paired.')).toBeTruthy();
  });

  it('asks first, sends the device id, and shows a failure', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const action = vi.fn(async (): Promise<AuthFormState> => ({ status: 'error', code: 'service_unavailable', error: PAIRING_MESSAGES.revokeUnavailable }));
    render(<TvDevicesPanel devices={[row]} revokeAction={action} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });
    expect((await screen.findByRole('alert')).textContent).toBe(PAIRING_MESSAGES.revokeUnavailable);
    expect((action.mock.calls[0] as unknown as [AuthFormState, FormData])[1].get('deviceId')).toBe(row.id);
  });

  it('does nothing when the admin cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const action = vi.fn(async (): Promise<AuthFormState> => ({ status: 'ok' }));
    render(<TvDevicesPanel devices={[row]} revokeAction={action} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });
    expect(action).not.toHaveBeenCalled();
  });

  it('shows a removed TV without a button', () => {
    render(<TvDevicesPanel devices={[{ ...row, revokedAt: '2026-11-06T21:00:00Z' }]} revokeAction={vi.fn()} />);
    expect(screen.getByText('Removed')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
