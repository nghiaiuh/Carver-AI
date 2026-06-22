/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile monorepo packages so Next.js handles their source directly
  transpilePackages: ["@carver/ai", "@carver/db", "@carver/queue", "@carver/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
