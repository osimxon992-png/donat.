import Link from 'next/link';
import { LogoMark } from './logo';

export function Footer() {
  return (
    <footer className="mt-24 border-t-4 border-ink bg-ink text-white">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5">
            <LogoMark size={40} />
            <span className="font-display text-4xl leading-none tracking-wider text-pop">
              DON<span className="text-accent">AT!</span>
            </span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
            Top-ups for games, apps and phones in Uzbekistan. The account is checked before you pay, and you can follow the delivery live.
          </p>
        </div>
        <FooterCol
          title="Store"
          links={[
            ['/?c=games', 'Game currency'],
            ['/?c=services', 'Apps & wallets'],
            ['/?c=mobile', 'Mobile balance'],
            ['/account/orders', 'Track an order'],
          ]}
        />
        <FooterCol title="Help" links={[['/guides', 'Where is my ID?'], ['/help', 'FAQ'], ['/account/support', 'Contact support'], ['/forgot-password', 'Reset password']]} />
        <FooterCol title="Account" links={[['/login', 'Sign in'], ['/register', 'Create account'], ['/account/settings', 'Settings']]} />
      </div>
      <div className="border-t-2 border-white/15">
        <div className="mx-auto flex max-w-[1400px] flex-wrap justify-between gap-3 px-4 py-5 text-xs text-white/50 sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} Donat</span>
          <span>Not affiliated with any game publisher, app or mobile operator. Names belong to their owners.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="font-display text-2xl tracking-wider text-pop uppercase">{title}</p>
      <ul className="mt-3 space-y-2.5 text-sm">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="font-medium text-white/80 transition-colors hover:text-pop">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
