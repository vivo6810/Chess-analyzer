import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';
import SiteFooter from '@/components/site-footer';
import SiteHeader from '@/components/site-header';
import { VerdictSprite } from '@/components/verdict-badge';

/* Two faces, each with a job. Geist carries interface and body copy;
   Geist Mono handles notation and clocks, where digit widths must not
   shift. All three of the original faces were doing the same job the
   heading weight and tracking now do. */
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Arbiter — play the engine, analyze any game',
  description:
    'Chess.com-fetch or PGN into a brutally honest review: brilliant to blunder, accuracy and the clock, with Stockfish levels to play against.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <VerdictSprite />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
