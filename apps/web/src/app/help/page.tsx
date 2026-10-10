import Link from 'next/link';
import { Faq } from '@/components/faq';

export const metadata = { title: 'Help' };

export default function HelpPage() {
  return (
    <div className="grid gap-12 md:grid-cols-[1fr_2fr]">
      <div>
        <p className="eyebrow mb-2">Help centre</p>
        <h1 className="text-5xl tracking-wider uppercase sm:text-6xl">Frequently asked questions</h1>
        <p className="mt-4 text-sm text-muted">
          Didn’t find it?{' '}
          <Link href="/account/support" className="link text-text">
            Write to support
          </Link>{' '}
          — a person reads every ticket.
        </p>
      </div>
      <Faq />
    </div>
  );
}
