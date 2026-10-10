import type { ReactNode } from 'react';

/** Two-column layout for sign in / sign up / password pages. */
export function AuthShell({ eyebrow, title, aside, children }: { eyebrow: string; title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid items-start gap-12 py-4 md:grid-cols-[1fr_400px] md:gap-20">
      <div className="md:pt-6">
        <p className="eyebrow mb-4">{eyebrow}</p>
        <h1 className="text-4xl leading-[0.98] font-extrabold tracking-[-0.04em] sm:text-[56px]">{title}</h1>
        {aside && <div className="mt-6 max-w-sm text-[15px] leading-relaxed text-muted">{aside}</div>}
      </div>
      <div className="rounded-[10px] border border-ink/15 bg-surface p-6 sm:p-7">{children}</div>
    </div>
  );
}
