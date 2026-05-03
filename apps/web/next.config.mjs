import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  serverExternalPackages: ['@prisma/client', 'argon2'],
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
