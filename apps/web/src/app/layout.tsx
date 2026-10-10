import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

const heading = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const body = Instrument_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const code = JetBrains_Mono({ subsets: ['latin'], variable: '--font-code', display: 'swap', weight: ['400', '500'] });

export const metadata: Metadata = {
  title: { default: 'Donat — top up games, apps and phones', template: '%s — Donat' },
  description:
    'Game currency, Telegram Premium and Stars, Steam and PlayStation wallets, and balance for Beeline, Ucell, Mobiuz and Uzmobile. Account checked before you pay, delivery tracked live.',
  applicationName: 'Donat',
};

export const viewport: Viewport = { themeColor: '#f3f0e8', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${code.variable}`}>
      <body className="flex min-h-screen flex-col">
        <AuthProvider>
          <div className="bg-ink text-paper">
            <p className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-1.5 font-mono text-[11px] tracking-wide">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              DEMO STORE — payments and deliveries are simulated. Nothing is charged, nothing is sent.
            </p>
          </div>
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
