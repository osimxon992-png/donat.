import type { ReactNode } from 'react';
import { LogoMark } from './logo';

/** Centered card layout for sign in / sign up / password pages. */
export function AuthShell({ eyebrow, title, aside, children }: { eyebrow: string; title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[440px] py-4 sm:py-8">
      <div className="mb-6 text-center">
        <div className="mb-5 inline-block">
          <LogoMark size={44} />
        </div>
        <p className="sr-only">{eyebrow}</p>
        <h1 className="text-5xl tracking-wider uppercase">{title}</h1>
        {aside && <div className="mt-3 text-[15px] leading-relaxed font-medium text-muted">{aside}</div>}
      </div>
      <div className="card p-6 sm:p-8">{children}</div>
    </div>
  );
}
