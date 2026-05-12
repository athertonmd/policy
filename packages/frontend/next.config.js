/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@travel-policy/shared'],
};

module.exports = nextConfig;
