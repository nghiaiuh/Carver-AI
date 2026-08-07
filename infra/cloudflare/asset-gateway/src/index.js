/**
 * Private asset delivery edge for Carver AI.
 *
 * The Web BFF checks asset ownership before minting the HMAC URL. This worker
 * validates that short-lived URL, resolves only its metadata with a service
 * credential stored in Cloudflare, and streams bytes from the private R2
 * binding. Browser clients never receive a storage path or service-role key.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VARIANTS = new Set(["thumb", "preview", "original"]);

const encoder = new TextEncoder();

const base64Url = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const safeEqual = (left, right) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

async function verifyToken(env, { assetId, variant, expiresAt, token }) {
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.ASSET_GATEWAY_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${assetId}.${variant}.${expiresAt}`),
  );
  return safeEqual(base64Url(new Uint8Array(signature)), token);
}

const withCors = (request, env, headers) => {
  const origin = request.headers.get("origin");
  const allowedOrigins = new Set((env.CARVER_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
  if (origin && allowedOrigins.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "GET, OPTIONS");
    headers.set("access-control-allow-headers", "Content-Type");
    headers.set("vary", "Origin");
  }
  return headers;
};

const json = (request, env, status, code) => new Response(JSON.stringify({ success: false, code, error: "Asset not found" }), {
  status,
  headers: withCors(request, env, new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })),
});

async function supabaseSelect(env, table, assetId, select) {
  const url = new URL(`/rest/v1/${table}`, env.SUPABASE_URL);
  url.searchParams.set("id", `eq.${assetId}`);
  url.searchParams.set("select", select);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) throw new Error("ASSET_METADATA_LOOKUP_FAILED");
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function resolveStoragePaths(env, assetId, variant) {
  const projectAsset = await supabaseSelect(env, "assets", assetId, "storage_path,mime_type");
  if (projectAsset) {
    return { mimeType: projectAsset.mime_type, paths: [projectAsset.storage_path] };
  }

  const libraryAsset = await supabaseSelect(
    env,
    "library_assets",
    assetId,
    "thumb_storage_path,preview_storage_path,original_storage_path,mime_type",
  );
  if (!libraryAsset) return null;

  const ordered = {
    thumb: [libraryAsset.thumb_storage_path, libraryAsset.preview_storage_path, libraryAsset.original_storage_path],
    preview: [libraryAsset.preview_storage_path, libraryAsset.original_storage_path, libraryAsset.thumb_storage_path],
    original: [libraryAsset.original_storage_path, libraryAsset.preview_storage_path, libraryAsset.thumb_storage_path],
  }[variant];
  return {
    mimeType: libraryAsset.mime_type,
    paths: [...new Set(ordered.filter(Boolean))],
  };
}

export default {
  async fetch(request, env) {
    if (!env.ASSET_GATEWAY_SIGNING_SECRET || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.ASSETS_BUCKET) {
      return json(request, env, 500, "ASSET_GATEWAY_CONFIG_MISSING");
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: withCors(request, env, new Headers()) });
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/assets\/([0-9a-f-]{36})\/content$/i);
    if (request.method !== "GET" || !match || !UUID.test(match[1])) return json(request, env, 404, "ASSET_NOT_FOUND");

    const assetId = match[1];
    const variant = VARIANTS.has(url.searchParams.get("variant")) ? url.searchParams.get("variant") : "original";
    const expiresAt = Number(url.searchParams.get("exp"));
    const token = url.searchParams.get("token") ?? "";
    if (!await verifyToken(env, { assetId, variant, expiresAt, token })) return json(request, env, 404, "ASSET_NOT_FOUND");

    try {
      const resolved = await resolveStoragePaths(env, assetId, variant);
      if (!resolved) return json(request, env, 404, "ASSET_NOT_FOUND");

      for (const storagePath of resolved.paths) {
        const object = await env.ASSETS_BUCKET.get(storagePath);
        if (!object) continue;
        const headers = withCors(request, env, new Headers({
          "content-type": resolved.mimeType || object.httpMetadata?.contentType || "application/octet-stream",
          "cache-control": "private, max-age=60",
          "cross-origin-resource-policy": "cross-origin",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
        }));
        if (object.httpEtag) headers.set("etag", object.httpEtag);
        return new Response(object.body, { status: 200, headers });
      }
      return json(request, env, 404, "ASSET_NOT_FOUND");
    } catch {
      return json(request, env, 500, "ASSET_DELIVERY_FAILED");
    }
  },
};
