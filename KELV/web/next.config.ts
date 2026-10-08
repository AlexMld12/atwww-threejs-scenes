import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
  // Figma exports are final size and colour-matched; the optimiser would re-encode them.
  images: { unoptimized: true },
};

export default nextConfig;
