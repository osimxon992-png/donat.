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
      <p className="eyebrow mb-3 hidden lg:block">{title}</p>
      <ul className="-mx-5 flex gap-1 overflow-x-auto border-b border-ink/10 px-5 pb-0 lg:mx-0 lg:flex-col lg:gap-0 lg:border-b-0 lg:border-l lg:px-0">
        {visible.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px block border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors lg:mb-0 lg:-ml-px lg:border-b-0 lg:border-l-2 lg:py-1.5 lg:pl-4 ${
                  active ? 'border-ink font-semibold text-text' : 'border-transparent text-muted hover:text-text'
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
