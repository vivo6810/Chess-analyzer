import Link from 'next/link';

import HeroArena from '@/components/hero-arena';
import NotationMarquee from '@/components/notation-marquee';

export default function LandingPage() {
  return (
    <>
      <section className="relative border-b-2 border-ink bg-canvas">
        <div className="relative mx-auto grid max-w-6xl lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="px-5 py-12 sm:px-10 sm:py-14 lg:py-24 lg:pr-16">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
              Play · analyze · improve
            </p>
            <h1 className="mt-6 max-w-[15ch] text-[clamp(2.7rem,6.4vw,5rem)] leading-[0.94] font-extrabold tracking-[-0.045em] text-ink">
              Your chess, on the record.
            </h1>
            <p className="mt-7 max-w-[42ch] text-[17px] leading-relaxed text-ink-soft">
              Play a game against Stockfish at eight levels, or pull any Chess.com player&apos;s
              games, and Arbiter reviews every move: brilliant through blunder, accuracy, the clock
              they kept, and a graph of the engine&apos;s eye.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 sm:gap-4">
              <Link
                href="/play"
                className="press border-2 border-ink bg-accent px-6 py-3.5 text-[15px] font-bold text-on-accent shadow-brut"
              >
                Play the engine
              </Link>
              <Link
                href="/analysis"
                className="press border-2 border-ink bg-surface px-6 py-3.5 text-[15px] font-bold text-ink shadow-brut"
              >
                Analyze a game
              </Link>
            </div>
          </div>
          <div className="relative border-t-2 border-ink px-5 py-10 sm:px-10 sm:py-12 lg:border-t-0 lg:border-l-2 lg:py-16 lg:pr-8 lg:pl-12">
            <HeroArena />
          </div>
        </div>
      </section>
      <NotationMarquee />
    </>
  );
}
