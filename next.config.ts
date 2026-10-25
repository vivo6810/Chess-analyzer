import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The dev server is reached through the sandbox's preview proxy, so the
  // browser sends the preview hostname rather than localhost. Next rejects
  // untrusted Host headers during development unless they're listed here.
  allowedDevOrigins: ['pv-01465cccf9af-4846690f-4505-48e8-a60b-3e42a9cee880.style.dev'],

  // The chess engine ships as a static asset in /public/engine and is loaded
  // as a Web Worker by same-origin URL. Keeping it out of the bundler avoids
  // Next trying to parse the emscripten glue code. The database driver's
  // native binding is also externalised: libsql loads a platform-specific
  // .node binary at runtime, which no bundler can trace.
  serverExternalPackages: ['libsql'],
};

export default nextConfig;
