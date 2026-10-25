'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Me = { id: number; username: string } | null;

/**
 * Who is signed in, in the header.
 *
 * The header is a client component and the session cookie is httpOnly, so it
 * asks the server. `/api/auth/me` is the smallest honest answer to that
 * question; the chip stays out of the DOM until the answer arrives rather than
 * rendering "Sign in" for a visitor who is already signed in and then swapping.
 */
export default function AccountChip({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { user: null }))
      .then((payload: { user: Me }) => {
        if (!cancelled) setMe(payload.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setMe(null);
    router.push('/');
    router.refresh();
  };

  if (me === undefined) {
    /* The gap stays empty on the first paint: a placeholder the same width as
       "Sign in" would be a promise about state the server has not answered. */
    return null;
  }

  if (me == null) {
    return (
      <Link
        href="/login"
        className={`font-mono text-[10px] font-bold tracking-[0.12em] uppercase ${className}`}
      >
        Sign in
      </Link>
    );
  }

  return (
    <span className="inline-flex flex-none items-center gap-1.5">
      <Link
        href={`/players/${encodeURIComponent(me.username)}`}
        className={`font-mono text-[10px] font-bold tracking-[0.12em] uppercase ${className}`}
      >
        {me.username}
      </Link>
      <button
        type="button"
        onClick={() => void signOut()}
        aria-label="Sign out"
        title="Sign out"
        className="press grid h-7 w-7 flex-none place-items-center border-2 border-line-strong bg-surface text-[12px] leading-none text-muted hover:border-ink hover:text-ink"
      >
        ×
      </button>
    </span>
  );
}
