import type { NextConfig } from 'next';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sniffoutpro/types', '@sniffoutpro/api', '@sniffoutpro/db'],
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
