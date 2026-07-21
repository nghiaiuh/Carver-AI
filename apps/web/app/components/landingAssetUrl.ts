const LANDING_ASSET_BASE_URL =
  process.env.NEXT_PUBLIC_LANDING_ASSET_BASE_URL?.trim().replace(/\/+$/, "") ?? "";

export function getLandingAssetUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!LANDING_ASSET_BASE_URL) {
    return normalizedPath;
  }

  return `${LANDING_ASSET_BASE_URL}${normalizedPath}`;
}
