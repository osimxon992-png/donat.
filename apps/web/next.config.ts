import type { NextConfig } from 'next';

// The browser only ever talks to this Next.js origin. /api and /uploads are proxied to the
// backend server-side, so auth cookies stay first-party and no backend URL or secret is
// exposed to the client bundle.
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@donat/shared'],
  eslint: { ignoreDuringBuilds: true }, // linted from the repo root (`npm run lint`)
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_INTERNAL_URL}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API_INTERNAL_URL}/uploads/:path*` },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
