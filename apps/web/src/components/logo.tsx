import Link from 'next/link';

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden>
      <path
        d="M18 1L21.2 6.2L26.5 3.3L26.6 9.4L32.7 9.5L29.8 14.8L35 18L29.8 21.2L32.7 26.5L26.6 26.6L26.5 32.7L21.2 29.8L18 35L14.8 29.8L9.5 32.7L9.4 26.6L3.3 26.5L6.2 21.2L1 18L6.2 14.8L3.3 9.5L9.4 9.4L9.5 3.3L14.8 6.2Z"
        fill="var(--color-pop)"
        stroke="var(--color-ink)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M19.8 8.5 12.2 19.4h5.2l-1.6 8.1 8.2-11.3h-5.4l1.2-7.7Z" fill="var(--color-accent)" stroke="var(--color-ink)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-1.5 ${className}`}>
      <span className="transition-transform duration-200 group-hover:rotate-12">
        <LogoMark />
      </span>
      <span className="font-display text-[30px] leading-none tracking-wider text-ink">
        DON<span className="text-accent">AT!</span>
      </span>
    </Link>
  );
}
