import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
  // Images are exported from Figma at their final size and colour-matched to it; the
  // optimiser would re-encode them.
  images: { unoptimized: true },
};

export default nextConfig;
