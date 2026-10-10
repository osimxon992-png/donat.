import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-ink/10 bg-ink text-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 pt-14 pb-8 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <p className="font-display text-5xl leading-none font-extrabold tracking-[-0.05em]">
            donat<span className="text-accent">.</span>
          </p>
          <p className="mt-4 max-w-xs text-sm text-paper/60">
            Top-ups for games, apps and phones. We check the account before you pay and you can watch the delivery happen.
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
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 border-t border-paper/10 px-5 py-5 font-mono text-[11px] text-paper/45">
        <span>© {new Date().getFullYear()} Donat</span>
        <span>Not affiliated with any game publisher, app or mobile operator. Names belong to their owners.</span>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.14em] text-paper/45 uppercase">{title}</p>
      <ul className="mt-4 space-y-2 text-sm">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-paper/80 hover:text-accent">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
