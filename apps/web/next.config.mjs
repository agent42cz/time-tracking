import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client', 'argon2'],
  poweredByHeader: false,
  experimental: {
    typedRoutes: false,
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
