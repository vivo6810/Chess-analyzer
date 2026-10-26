'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import GooeyNav, { type GooeyNavItem } from '@/components/gooey-nav/GooeyNav';

const NAV: GooeyNavItem[] = [
  { label: 'Play', href: '/play' },
  { label: 'Analyze', href: '/analysis' },
  { label: 'Profile', href: '/profile' },
];

/* Longest prefix wins for nested routes such as profile history or analysis. */
const activeIndexFor = (pathname: string) => {
  let best = 0;
  let bestLength = -1;
  NAV.forEach((item, index) => {
    const href = item.href ?? '/';
    const matches = href === '/' ? pathname === '/' : pathname.startsWith(href);
    if (matches && href.length > bestLength) {
      best = index;
      bestLength = href.length;
    }
  });
  return best;
};

const PANEL_ID = 'site-menu';

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = activeIndexFor(pathname);

  /* A navigation always means the menu has done its job. Closing on the
     pathname (rather than only in the link's click handler) also covers the
     back button and any programmatic push. */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b-2 border-line/70 bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="shrink-0 text-[15px] font-semibold tracking-[-0.03em] text-ink transition-colors hover:text-ink-soft"
        >
          Arbiter
        </Link>

        {/* ── Wide screens: the gooey pill ─────────────────────── */}
        <div className="hidden min-w-0 items-center gap-3 md:flex">
          <GooeyNav
            aria-label="Sections"
            items={NAV}
            size="sm"
            adaptive
            /* The three-site hop is the app's signature transition; left at
               the defaults the spring is settled before an eye assigns it a
               reading. A longer flight and more droplets keep it legible
               without resorting to theatrical timing. */
            animationTime={900}
            particleCount={22}
            spread={72}
            wobble={0.62}
            activeIndex={active}
            /* Navigation is the link's job. Pushing here as well navigated
               twice — once by the anchor, once by the router — and the second
               push cut off the press animation the first one started. */
            linkComponent={Link}
          />
        </div>

        {/* ── Small screens: a button, and a menu that drops down ──
            The gooey pill needs roughly 420px of horizontal room; below that
            its items wrap onto several rows and the gooey surface inflates
            into a blob that covers the page. A phone gets a real menu. */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={PANEL_ID}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="press flex h-11 w-11 flex-none flex-col items-center justify-center gap-[5px] border-2 border-line-strong bg-surface text-ink"
          >
            <span
              aria-hidden="true"
              className={`block h-[2px] w-5 bg-ink transition-transform duration-200 ${
                open ? 'translate-y-[7px] rotate-45' : ''
              }`}
            />
            <span
              aria-hidden="true"
              className={`block h-[2px] w-5 bg-ink transition-opacity duration-150 ${
                open ? 'opacity-0' : 'opacity-100'
              }`}
            />
            <span
              aria-hidden="true"
              className={`block h-[2px] w-5 bg-ink transition-transform duration-200 ${
                open ? '-translate-y-[7px] -rotate-45' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Scrim: tapping anywhere off the menu closes it. */}
      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-x-0 top-16 bottom-0 z-40 cursor-default bg-ink/25 md:hidden"
        />
      ) : null}

      <nav
        id={PANEL_ID}
        aria-label="Sections"
        /* Kept mounted but hidden so the panel can animate; `inert`-free
           because a hidden element already drops out of the a11y tree. */
        hidden={!open}
        className="absolute inset-x-0 top-full z-50 border-b-2 border-line bg-canvas shadow-brut md:hidden"
      >
        <ul className="mx-auto max-w-6xl px-3 py-2">
          {NAV.map((item, index) => {
            const isActive = index === active;
            return (
              <li key={item.href ?? index}>
                <Link
                  href={item.href ?? '/'}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-12 items-center justify-between gap-3 border-2 px-3 text-[15px] transition-colors ${
                    isActive
                      ? 'border-line-strong bg-accent font-bold text-on-accent'
                      : 'border-transparent font-medium text-ink hover:bg-bone'
                  }`}
                >
                  <span>{item.label}</span>
                  <span
                    aria-hidden="true"
                    className={`font-mono text-[11px] ${
                      isActive ? 'text-on-accent' : 'text-muted'
                    }`}
                  >
                    {isActive ? 'Here' : '→'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
