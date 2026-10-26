import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The dev server is reached through the sandbox's preview proxy, so the
  // browser sends the preview hostname rather than localhost. Next rejects
  // untrusted Host headers during development unless they're listed here.
  // The hostname changes on every re-provisioning: update it per INIT.md §9.
  allowedDevOrigins: ['pv-01465cccf9af-f818a712-99b0-4adc-b69f-93441a2b1602.style.dev'],

  // The chess engine is a same-origin static Web Worker asset; it must not be
  // imported into the Next bundle.
};

export default nextConfig;
