import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

// AIAGE-39 — HTTP security headers. CSP is limited to directives that can't
// break Next.js hydration (no script-src without a nonce pipeline); the main
// goals are clickjacking (frame-ancestors + XFO) and SSL-strip (HSTS).
export const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  serverExternalPackages: ['@prisma/client', 'argon2', 'pdfmake'],
  poweredByHeader: false,
  experimental: {
    typedRoutes: false,
  },
  // Ship the embedded PDF fonts into the standalone build for the PDF route.
  outputFileTracingIncludes: {
    '/api/reports/export.pdf': ['./src/assets/fonts/**/*'],
  },
  // Tell webpack to resolve `.js` imports against `.ts/.tsx` source files —
  // matches Vitest/Vite behavior so the same code compiles in both.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
