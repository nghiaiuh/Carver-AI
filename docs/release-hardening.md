# Release Hardening Checklist

## Deploy Order

1. Verify staging backup and run User A/User B RLS smoke tests.
2. Apply backward-compatible SQL migrations in order, including `packages/db/sql/005_release_hardening.sql`.
3. Deploy worker with required env and Redis/R2/Supabase service role configured.
4. Deploy web after worker is healthy.
5. Run production smoke tests and monitor redacted logs by `requestId`.

## Required Env

Web/API:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ASSET_GATEWAY_SIGNING_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET`

Worker:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET`
- `REDIS_URL` or `REDIS_HOST`
- optional `AI_WORKER_CONCURRENCY`, `AI_JOB_ATTEMPTS`, `AI_JOB_BACKOFF_MS`
- optional `LIBRARY_R2_SYNC_ENABLED`, `LIBRARY_SYNC_INTERVAL_MS`

## Production Smoke

- `/api/generate` returns `410 LEGACY_GENERATE_DISABLED`.
- Missing/invalid auth on sensitive APIs returns `401` with `requestId`.
- User A cannot read User B projects, jobs, library assets, chat, snapshots, or asset gateway URLs.
- Library upload rejects SVG, wrong magic bytes, oversized files, and invalid dimensions.
- Library list returns gateway URLs, not permanent public R2 URLs.
- Worker syncs R2 library metadata automatically; frontend manual `/api/library/sync` returns `410`.
- Snapshot load returns resolved gateway URLs for stable `assetId` refs.
- Generate double-click returns one logical job through `idempotency_key`.
- Worker queue payload contains only `jobId` plus non-sensitive metadata.
- Worker starts, validates env, connects Redis, and shuts down cleanly on `SIGTERM`.
- Logs include `requestId`/`jobId` metadata and do not include signed URL queries, secrets, prompts, chat content, snapshots, or base64.

## Release Blockers

- RLS and API ownership checks pass User A/User B smoke tests.
- User-owned assets are not exposed through permanent public URLs.
- Server never signs or streams raw client-provided storage paths.
- Snapshot/job result DB does not store signed URLs, blobs, data URLs, or base64.
- Public legacy generation is disabled.
- Rate limit and concurrent job guard exist for AI/upload/sync routes.
- DB indexes/constraints from `005_release_hardening.sql` are applied.
- `npm run typecheck` and production build pass.
