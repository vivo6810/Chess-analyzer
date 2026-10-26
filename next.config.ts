import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The dev server is reached through the sandbox's preview proxy, so the
  // browser sends the preview hostname rather than localhost. Next rejects
  // untrusted Host headers during development unless they're listed here.
  // The hostname changes on every re-provisioning: update it per INIT.md §9.
  allowedDevOrigins: ['pv-01465cccf9af-f818a712-99b0-4adc-b69f-93441a2b1602.style.dev'],

  // The chess engine is a same-origin static Web Worker asset; it must not be
  // imported into the Next bundle.

  async headers() {
    return [
      {
        /* The engine is the heaviest thing this site ships (~1.8 MB of JS+
           WASM, and every play or analysis session fetches both). Cache it at
           the CDN, not just per browser: a new session should not re-pull the
           pair from cold storage. It is deliberately NOT `immutable` — the
           filename is not versioned and the worker JS and WASM must switch
           to a new build together, so an indefinitely-cached old worker next
           to a fresh WASM would tear. A short browser window plus a long
           CDN window with stale-while-revalidate gives repeat sessions the
           fast path without that risk. */
        source: '/engine/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=14400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
