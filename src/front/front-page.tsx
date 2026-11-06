import * as React from 'react';
import { Brain, ChevronRight, Grid3x3, Mic, Music, Settings, Tv, Wine, type LucideIcon } from 'lucide-react';
import { cardClass } from '../ui/card';
import { AnchorLogo, Grain } from '../ui/logo';
import { cn } from '../ui/cn';
import { getTodayIsoDateInLondon } from '../dates';
import type { NightKey, OtherNight } from './nights';

// The front page every night shares (spec S2.3), from Cash Bingo's
// src/app/page.tsx: the logo, the script greeting, the night's name, three
// tiles (Host console, Pub TV, Admin) and a row linking to the other nights.
// Server-renderable: no state, no effects.

export interface FrontTile {
  href: string;
  /** The line under the label. */
  hint?: string;
}

export interface FrontPageProps {
  /** The night's name as the heading, e.g. "Bingo night". */
  appName: string;
  /** The line under the heading. */
  lead?: string;
  /** The script greeting above the heading. */
  greeting?: string;
  /** Defaults: /host, /tv, /admin with Cash Bingo's hints. */
  tiles?: { host?: FrontTile; tv?: FrontTile; admin?: FrontTile };
  /** From buildOtherNights(). The row is left out when empty. */
  otherNights?: readonly OtherNight[];
  /** A photo behind a deep green wash, from the app's public folder (Cash Bingo: /the-anchor-bar.jpg). */
  backdropSrc?: string;
  logoSrc?: string;
  /** Next's Link for the three tiles, so they prefetch. Defaults to a plain link. */
  linkComponent?: React.ElementType;
  /** The Orange Jelly copyright line under the tiles. On by default. */
  showCopyright?: boolean;
}

const NIGHT_ICONS: Record<NightKey, LucideIcon> = { quiz: Brain, cash: Grid3x3, music: Music, tasting: Wine };

export const FRONT_DEFAULTS = Object.freeze({
  greeting: "Where everyone's welcome",
  lead: 'Staff tools for running the night. Pick where you are heading.',
  host: { href: '/host', hint: "Run tonight's games" },
  tv: { href: '/tv', hint: 'Open the big screen on this device' },
  admin: { href: '/admin', hint: 'Set-up, staff and paired TVs' },
});

/** The copyright notice, with the year as it is in London (from Cash Bingo's copyright-line). */
export function copyrightText(now: Date = new Date()): string {
  return `© ${getTodayIsoDateInLondon(now).slice(0, 4)} Orange Jelly Limited. All rights reserved.`;
}

export function FrontPage({
  appName,
  lead = FRONT_DEFAULTS.lead,
  greeting = FRONT_DEFAULTS.greeting,
  tiles = {},
  otherNights = [],
  backdropSrc,
  logoSrc,
  linkComponent: LinkComponent = 'a',
  showCopyright = true,
}: FrontPageProps): React.ReactElement {
  const roles: { key: string; label: string; icon: LucideIcon; href: string; hint: string }[] = [
    { key: 'host', label: 'Host console', icon: Mic, href: tiles.host?.href ?? FRONT_DEFAULTS.host.href, hint: tiles.host?.hint ?? FRONT_DEFAULTS.host.hint },
    { key: 'tv', label: 'Pub TV', icon: Tv, href: tiles.tv?.href ?? FRONT_DEFAULTS.tv.href, hint: tiles.tv?.hint ?? FRONT_DEFAULTS.tv.hint },
    { key: 'admin', label: 'Admin', icon: Settings, href: tiles.admin?.href ?? FRONT_DEFAULTS.admin.href, hint: tiles.admin?.hint ?? FRONT_DEFAULTS.admin.hint },
  ];

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-anchor-green-deep text-anchor-cream-text">
      {backdropSrc ? (
        <>
          <img src={backdropSrc} alt="" aria-hidden="true" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--anchor-green-deep)_70%,transparent)_0%,color-mix(in_srgb,var(--anchor-green-deep)_95%,transparent)_40%,var(--anchor-green-deep)_100%)]"
          />
        </>
      ) : null}
      <Grain />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 pb-7 pt-[calc(env(safe-area-inset-top)+3rem)] md:max-w-lg">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <AnchorLogo height={92} priority src={logoSrc} />
          {greeting ? <span className="font-script text-[34px] text-anchor-gold-bright">{greeting}</span> : null}
          <h1 className="font-display text-[40px] leading-none text-anchor-cream-text">{appName}</h1>
          {lead ? <p className="max-w-[30ch] font-sans text-[15px] text-anchor-cream-text/85">{lead}</p> : null}
        </div>

        <nav aria-label="Where to go" className="mt-auto flex flex-col gap-2.5">
          {roles.map(({ key, label, icon: Icon, href, hint }) => (
            <LinkComponent key={key} href={href} className={cardClass({ hover: true, className: 'flex items-center gap-3.5 p-4' })}>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card border border-line-gold bg-anchor-gold-bright/[0.12] text-anchor-gold-bright">
                <Icon aria-hidden="true" size={24} strokeWidth={2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-display text-[22px] leading-[1.1]">{label}</span>
                <span className="font-sans text-[13px] text-anchor-sage">{hint}</span>
              </span>
              <ChevronRight aria-hidden="true" size={20} strokeWidth={2} className="shrink-0 text-anchor-gold-bright" />
            </LinkComponent>
          ))}
        </nav>

        {otherNights.length > 0 ? (
          <nav aria-label="Other nights" className="flex flex-col gap-2.5">
            <span className="kicker text-center">Other nights</span>
            <ul className={cn('grid gap-2', otherNights.length === 1 ? 'grid-cols-1' : otherNights.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
              {otherNights.map((night) => {
                const Icon = NIGHT_ICONS[night.key];
                return (
                  <li key={night.key}>
                    <a
                      href={night.href}
                      className={cardClass({ hover: true, className: 'flex h-full flex-col items-center gap-1.5 px-2 py-3 text-center' })}
                    >
                      <Icon aria-hidden="true" size={20} strokeWidth={2} className="text-anchor-gold-bright" />
                      <span className="font-sans text-[13px] font-semibold leading-tight">{night.name}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        {showCopyright ? (
          <p className="text-center font-sans text-xs text-anchor-sage" suppressHydrationWarning>
            {copyrightText()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
