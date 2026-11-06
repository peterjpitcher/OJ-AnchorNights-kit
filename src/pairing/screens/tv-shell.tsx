'use client';

import * as React from 'react';
import { Stage } from '../../tv/stage';
import { AnchorLogo, Grain } from '../../ui/logo';

/** The dark TV canvas every pairing screen sits on: the 1920 by 1080 Stage, grain and the logo. */
export function TvCanvas({ logoSrc, children }: { logoSrc?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Stage>
      <main className="relative flex h-full w-full flex-col items-center justify-center gap-[calc(4*var(--anchor-vh,1vh))] overflow-hidden bg-bg px-[calc(6*var(--anchor-vw,1vw))] text-center text-fg">
        <Grain />
        <AnchorLogo height={96} priority src={logoSrc} className="relative h-[calc(9*var(--anchor-vh,1vh))] w-auto" />
        <div className="relative flex flex-col items-center gap-[calc(3*var(--anchor-vh,1vh))]">{children}</div>
      </main>
    </Stage>
  );
}
