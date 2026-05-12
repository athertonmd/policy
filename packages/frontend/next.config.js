/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@travel-policy/shared'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
