# Carver Private Asset Gateway

This Worker is the optional P1 direct-delivery path. It keeps the current
Next.js `/api/assets/:assetId/content` route as a safe fallback until deployed.

## Deploy

1. Change `bucket_name` in `wrangler.toml` to the existing private R2 bucket.
2. Add Worker secrets, never repository variables:

   ```powershell
   npx wrangler secret put ASSET_GATEWAY_SIGNING_SECRET
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```

3. Deploy from this directory: `npx wrangler deploy`.
4. In the Web deployment, set `ASSET_DELIVERY_EDGE_BASE_URL` to the Worker
   HTTPS origin, for example `https://carver-private-asset-gateway.<account>.workers.dev`.
5. Verify a newly minted canvas/library URL starts with that origin and returns
   the same private image. Keep the Next.js fallback unset in staging until the
   Worker is verified.
5. Add `CARVER_ALLOWED_ORIGINS` as a Worker environment variable when the
   canvas needs cross-origin image reads, for example `https://carver-ai.vercel.app`.

The browser receives only `assetId`, expiry, and HMAC token. The Worker reads
metadata internally and never exposes the R2 storage path or Supabase service
role key.
