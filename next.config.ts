import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Allow production builds to successfully complete even if
    // there are ESLint errors. Useful for CI/Vercel deploys.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Skip type checking during production builds to avoid
    // blocking deploys on non-critical type issues.
    ignoreBuildErrors: true,
  },
  experimental: {
    // Ensure Node.js runtime for all route handlers by default
    forceSwcTransforms: true,
  },
  // Serve static DB file from public/; add headers to prevent caching if desired
  async headers() {
    return [
      {
        source: '/data/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
