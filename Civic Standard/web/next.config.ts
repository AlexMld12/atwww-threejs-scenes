import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
  // Every page is prerendered (the products and the configurator from generateStaticParams): the site is plain files,
  // and Vercel builds no serverless function (its name would carry the project's path, whose space it refuses).
  output: 'export',
};

export default nextConfig;
