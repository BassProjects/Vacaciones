/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  // Keep build workers within the isolated environment's resource budget.
  experimental: { cpus: 1 },
};

module.exports = nextConfig;
