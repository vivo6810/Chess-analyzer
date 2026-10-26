import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The dev server is reached through the sandbox's preview proxy, so the
  // browser sends the preview hostname rather than localhost. Next rejects
  // untrusted Host headers during development unless they're listed here.
  allowedDevOrigins: ['pv-01465cccf9af-4846690f-4505-48e8-a60b-3e42a9cee880.style.dev'],

  // The chess engine is a same-origin static Web Worker asset; it must not be
  // imported into the Next bundle.
};

export default nextConfig;
