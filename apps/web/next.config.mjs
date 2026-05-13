/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile monorepo packages so Next.js handles their source directly
  transpilePackages: ["@carver/db"],

};

export default nextConfig;
