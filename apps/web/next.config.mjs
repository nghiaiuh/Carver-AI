/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === "production";

function getLandingAssetOrigin() {
  const baseUrl = process.env.NEXT_PUBLIC_LANDING_ASSET_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("Missing NEXT_PUBLIC_LANDING_ASSET_BASE_URL.");
  }

  try {
    return new URL(baseUrl).origin;
  } catch {
    throw new Error("NEXT_PUBLIC_LANDING_ASSET_BASE_URL must be a valid absolute URL.");
  }
}

const landingAssetOrigin = getLandingAssetOrigin();

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `img-src 'self' data: blob: https://images.unsplash.com ${landingAssetOrigin}`,
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-API-Version", value: "1" }],
      },
    ];
  },
};

export default nextConfig;
