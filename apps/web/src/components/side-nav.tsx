'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  href: string;
  label: string;
  show?: boolean;
}

export function SideNav({ items, title }: { items: NavItem[]; title: string }) {
  const pathname = usePathname();
  const visible = items.filter((i) => i.show !== false);
  const isActive = (href: string) => pathname === href || (href !== visible[0]?.href && pathname.startsWith(`${href}/`));

  return (
    <nav className="lg:sticky lg:top-24 lg:self-start">
      <p className="mb-3 hidden px-3 font-display text-2xl tracking-wider uppercase lg:block">{title}</p>
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:px-0">
        {visible.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-xl px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                  active ? 'border-[2.5px] border-ink bg-pop font-bold text-ink shadow-comic-sm' : 'border-[2.5px] border-transparent font-semibold text-muted hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
