const LANDING_ASSET_BASE_URL = process.env.NEXT_PUBLIC_LANDING_ASSET_BASE_URL?.trim().replace(/\/+$/, "");

export function getLandingAssetUrl(path: string) {
  if (!LANDING_ASSET_BASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_LANDING_ASSET_BASE_URL.");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${LANDING_ASSET_BASE_URL}${normalizedPath}`;
}
