const DEFAULT_LANDING_ASSET_BASE_URL = "https://pub-7f78968cf13a4dc496b43fccf7e30172.r2.dev";

const LANDING_ASSET_BASE_URL =
  process.env.NEXT_PUBLIC_LANDING_ASSET_BASE_URL?.trim().replace(/\/+$/, "") ||
  DEFAULT_LANDING_ASSET_BASE_URL;

export function getLandingAssetUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${LANDING_ASSET_BASE_URL}${normalizedPath}`;
}
