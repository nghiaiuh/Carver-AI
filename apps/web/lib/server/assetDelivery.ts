import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type AssetDeliveryVariant = "thumb" | "preview" | "original";

const DEFAULT_TTL_SECONDS = 15 * 60;
const VARIANTS = new Set<AssetDeliveryVariant>(["thumb", "preview", "original"]);

const getSigningSecret = () => {
  const secret = process.env.ASSET_GATEWAY_SIGNING_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("Missing ASSET_GATEWAY_SIGNING_SECRET or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return secret;
};

const signPayload = (payload: string) =>
  createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");

const buildPayload = (params: {
  assetId: string;
  variant: AssetDeliveryVariant;
  expiresAt: number;
}) => `${params.assetId}.${params.variant}.${params.expiresAt}`;

export const normalizeAssetDeliveryVariant = (value: string | null): AssetDeliveryVariant =>
  value && VARIANTS.has(value as AssetDeliveryVariant)
    ? (value as AssetDeliveryVariant)
    : "original";

export function createAssetDeliveryToken(params: {
  assetId: string;
  variant?: AssetDeliveryVariant;
  ttlSeconds?: number;
}) {
  const variant = params.variant ?? "original";
  const expiresAt = Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const payload = buildPayload({
    assetId: params.assetId,
    variant,
    expiresAt,
  });

  return {
    expiresAt,
    token: signPayload(payload),
    variant,
  };
}

export function verifyAssetDeliveryToken(params: {
  assetId: string;
  variant: AssetDeliveryVariant;
  expiresAt: number;
  token: string;
}) {
  if (!Number.isFinite(params.expiresAt) || params.expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = signPayload(buildPayload(params));
  const actualBuffer = Buffer.from(params.token);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function buildAssetContentUrl(
  requestUrl: string,
  params: {
    assetId: string;
    variant?: AssetDeliveryVariant;
    ttlSeconds?: number;
  },
) {
  const signed = createAssetDeliveryToken(params);
  const url = new URL(`/api/assets/${params.assetId}/content`, requestUrl);
  url.searchParams.set("variant", signed.variant);
  url.searchParams.set("exp", String(signed.expiresAt));
  url.searchParams.set("token", signed.token);

  return {
    url: url.toString(),
    expiresAt: new Date(signed.expiresAt * 1000).toISOString(),
  };
}
