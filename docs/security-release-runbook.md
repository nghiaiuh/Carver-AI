# Security Release Runbook

Carver AI is a bearer-token BFF application. User-owned metadata lives in
Supabase and user-owned binaries live in a **private** Cloudflare R2 bucket.
The web app never exposes a permanent R2 URL.

## Release blockers

1. Apply SQL migrations in order through `018_service_role_draft_trigger_fix.sql` to
   the Supabase project referenced by production environment variables.
2. Verify RLS for two test users: user A cannot read, update, delete, poll, or
   resolve a project, snapshot, chat message, job, asset, or library item owned
   by user B. Ownership failures must look like `404`, not `403`.
3. Keep `CLOUDFLARE_R2_BUCKET` private. Do not configure a public bucket domain
   for it. Public landing images must use the separate landing bucket only.
4. Set a unique, high-entropy `ASSET_GATEWAY_SIGNING_SECRET`; never reuse the
   Supabase service-role key. Rotate it if it is exposed.
5. Set `CARVER_ALLOWED_ORIGINS` to exact deployed web origins and set
   `CARVER_INTERNAL_ADMIN_USER_IDS` to the Auth user IDs allowed to view
   `/field-notes/*` diagnostics.
6. Use authenticated TLS Redis (`rediss://`) in production. The worker and web
   queue client fail closed when production Redis is insecure or unauthenticated.
7. Run `npm run security:env`, `npm audit --omit=dev`, `npm run typecheck`,
   `npm run test --workspace @carver/shared`, and a production smoke test
   before each release. Upgrade or mitigate every reachable high/critical audit
   finding; do not use `npm audit fix --force` without review.

## Supabase Auth configuration

These controls are configured in the Supabase dashboard, not in the browser:

- Require email confirmation for password registrations.
- Set a minimum password length of 12 and enable leaked-password protection.
- Configure sign-in, sign-up, recovery, and OTP rate limits; enable CAPTCHA for
  public auth flows before production.
- Allow only exact production callback URLs. Do not use wildcard redirect URLs.
- Keep access tokens short-lived (typically 30-60 minutes), enable refresh-token
  rotation/reuse detection, and require MFA for internal administrators.
- Revoke sessions and rotate credentials when an account or device is suspected
  to be compromised.

The UI applies a 12-character mixed-case-and-number rule and displays generic
auth failures, but dashboard policies are the enforcement boundary. Current
application APIs use `Authorization: Bearer <access-token>` rather than cookies;
therefore a cross-site page cannot attach credentials and CSRF tokens do not
protect those APIs. If a future mutation endpoint authenticates with cookies,
add Origin validation and a CSRF token before release.

## API and data controls

- Every sensitive API route authenticates first, validates IDs/payload limits,
  checks project ownership, and returns coded failures with a server-generated
  `requestId`.
- Rate limits are an atomic Supabase RPC (`api_rate_limits`), shared across web
  instances. Its scope is an allowlist of fixed per-user operations, preventing
  authenticated callers from creating unbounded rate-limit keys. `429` responses
  include `Retry-After`; do not retry blindly.
- `project_canvas_drafts` is bound to both `owner_id` and the owning project,
  and historical asset/snapshot ownership constraints are validated by migration
  `015`. Apply that migration before relying on draft recovery in production.
- AI jobs, profile credits, and project bootstrap use server/RPC-owned paths;
  browser clients cannot set job result/status or account plan/credit fields.
- Asset URLs are short-lived gateway capabilities minted only after an ownership
  lookup. Snapshot, job, and chat records persist stable `assetId`s, never signed
  URLs, raw binaries, tokens, or base64 image data.
- Image uploads accept JPEG/PNG/WebP only, validate magic bytes, byte/dimension
  limits, strip metadata through re-encoding, and reject runtime SVG.
- Global Next.js headers set CSP, HSTS in production, `nosniff`, restrictive
  Permissions Policy, and anti-framing. Private image responses have an exact
  CORS allowlist and short private caching.

The API is not versioned yet. Treat current routes as the v1 compatibility
surface: introduce breaking contracts under `/api/v2` (or a negotiated media
type) and retain the old route for a documented migration window.

## Logging, auditing, and incident response

- Use `createSafeLogger()` for API and worker logs. It redacts bearer tokens,
  secrets, signed URL queries, prompt/chat text, snapshot JSON, and image/base64
  payloads. Logs should contain only IDs, route, status, error code, and timing.
- Do not put secrets, tokens, signed URLs, raw prompts, snapshots, or full job
  payloads in API examples, tickets, browser screenshots, or documentation.
- Preserve database audit evidence through `credit_ledger`, job state/error
  metadata, request IDs, and provider-safe structured logs. Ship logs to a
  retention-controlled provider before production.
- Rotate Supabase service-role, OpenAI, R2, Redis, and gateway-signing secrets
  immediately after suspected exposure. Then invalidate affected sessions and
  inspect request/job IDs around the incident window.

## Smoke tests

1. Call every sensitive route without a bearer token: expect `401`.
2. With user A's token, request user B's project/job/asset IDs: expect `404`.
3. Resolve an owned asset, then verify its URL expires and an unowned ID is
   omitted from the batch result.
4. Upload malformed bytes labelled `image/png`: expect `400`; upload over the
   byte limit: expect `413`.
5. Exceed chat/enhance/generation/upload limits: expect `429` plus
   `Retry-After`.
6. Start an AI job twice with the same idempotency key: expect one logical job
   and one ledger debit.
7. Check browser DevTools and worker logs: no token, secret, signed URL query,
   prompt, chat body, or snapshot JSON may appear.
8. As user A, call the draft upsert RPC with a project ID owned by user B and
   user A's owner ID: expect the DB to reject it; no draft row may be created.
9. Call `consume_api_rate_limit` with an arbitrary scope string: expect
   `INVALID_RATE_LIMIT_INPUT` and verify no new `api_rate_limits` row exists.

## Operations handoff

Production worker reliability, alert configuration, Supabase Auth verification,
backup/restore drills, and rollback procedures are documented in
[operations-production-runbook.md](./operations-production-runbook.md).
