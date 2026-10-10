import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/bangers/latin-400.css';
import '@fontsource-variable/onest/index.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Donat — top up games, apps and phones', template: '%s — Donat' },
  description:
    'Game currency, Telegram Premium and Stars, Steam and PlayStation wallets, and balance for Beeline, Ucell, Mobiuz and Uzmobile. Account checked before you pay, delivery tracked live.',
  applicationName: 'Donat',
};

export const viewport: Viewport = { themeColor: '#ffd21f', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <AuthProvider>
          <div className="border-b-[3px] border-ink bg-ink text-center text-xs font-semibold text-pop">
            <p className="mx-auto max-w-[1400px] px-5 py-1.5">Demo store: payments and deliveries are simulated. Nothing is charged and nothing is sent.</p>
          </div>
          <Header />
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
