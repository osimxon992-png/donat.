import Link from 'next/link';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-baseline font-display text-[22px] leading-none font-extrabold tracking-[-0.04em] ${className}`}>
      donat
      <span className="ml-0.5 inline-block h-[7px] w-[7px] bg-accent transition-transform group-hover:rotate-45" aria-hidden />
    </Link>
  );
}
