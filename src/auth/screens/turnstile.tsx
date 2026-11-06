'use client';

import * as React from 'react';
import { CAPTCHA_FIELD } from '../shared';
import { cn } from '../../ui/cn';

// Cloudflare Turnstile, rendered explicitly so the form can reset it after
// every submission (tokens are single-use, and a wrong password spends one).
// Contract A: if the widget never loads, the form still submits without a
// token and Supabase decides; the app never requires the token itself.

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null;
        script.remove();
        reject(new Error('Turnstile did not load'));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

export type TurnstileStatus = 'loading' | 'ready' | 'solved' | 'expired' | 'error' | 'unavailable';

export interface TurnstileHandle {
  /** A fresh challenge. Called after every submission. */
  reset(): void;
}

export interface TurnstileWidgetProps {
  /** NEXT_PUBLIC_TURNSTILE_SITE_KEY. One widget lists all four hostnames (spec S1.6). */
  siteKey: string;
  /** The widget action, e.g. TURNSTILE_ACTIONS.signIn. */
  action: string;
  theme?: 'dark' | 'light' | 'auto';
  className?: string;
}

const STATUS_TEXT: Partial<Record<TurnstileStatus, string>> = {
  loading: 'Loading a quick security check.',
  expired: 'The security check timed out. It will refresh by itself; if it does not, reload the page.',
  error: 'The security check hit a problem. Reload the page and try again.',
  unavailable: 'The security check could not load. You can still try, and if it does not work, reload the page or try another network.',
};

export const TurnstileWidget = React.forwardRef<TurnstileHandle, TurnstileWidgetProps>(function TurnstileWidget(
  { siteKey, action, theme = 'auto', className },
  ref,
) {
  const container = React.useRef<HTMLDivElement>(null);
  const widgetId = React.useRef<string | null>(null);
  const [status, setStatus] = React.useState<TurnstileStatus>('loading');

  React.useImperativeHandle(
    ref,
    () => ({
      reset() {
        if (widgetId.current && window.turnstile) {
          window.turnstile.reset(widgetId.current);
          setStatus('ready');
        }
      },
    }),
    [],
  );

  React.useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: siteKey,
          action,
          theme,
          'response-field-name': CAPTCHA_FIELD,
          callback: () => setStatus('solved'),
          'expired-callback': () => setStatus('expired'),
          'error-callback': () => setStatus('error'),
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action, theme]);

  const note = STATUS_TEXT[status];
  return (
    <div className={cn('flex flex-col gap-1.5', className)} data-turnstile-status={status}>
      <div ref={container} />
      <p aria-live="polite" className="min-h-0 font-sans text-sm text-fg-muted">
        {note ?? ''}
      </p>
    </div>
  );
});
