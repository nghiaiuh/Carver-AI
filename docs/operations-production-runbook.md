# Production Operations Runbook

This runbook covers the operating controls required before Carver AI accepts
real users. It is intentionally provider-neutral where possible and never
includes secret values.

## 1. Worker and queue

### Required production environment

- `NODE_ENV=production`
- `REDIS_URL=rediss://<user>:<password>@<host>:<port>`
- `AI_WORKER_CONCURRENCY=2` initially; increase only after load testing.
- `AI_JOB_ATTEMPTS=3` and `AI_JOB_BACKOFF_MS=10000` initially.
- `AI_JOB_LOCK_DURATION_MS=60000` and `AI_JOB_MAX_STALLED_COUNT=1`.
- `WORKER_HEALTH_PORT` or Railway `PORT` must be reachable by the platform.

The queue package rejects an unauthenticated or non-TLS Redis URL when
`NODE_ENV=production`. `rediss://` means Redis traffic is encrypted in transit.

### Railway service configuration

1. Deploy `apps/worker` as a separate worker service, not as a Vercel route.
2. Configure the health check path as `/healthz`.
3. Use `/readyz` for deployment smoke checks. It verifies Redis `PING` and a
   cheap Supabase service-role query; it never invokes OpenAI or R2 operations.
4. Configure Railway to send `SIGTERM` on deploy. The worker marks itself
   unavailable, stops library/reconciliation schedulers, pauses BullMQ intake,
   closes event listeners and the HTTP health server, then waits up to
   `WORKER_SHUTDOWN_TIMEOUT_MS`.

### Retry and recovery policy

- BullMQ is the retry source of truth. A retryable worker exception is thrown
  back to BullMQ; the database stays `running` while backoff is pending.
- Permanent validation/provider request errors become terminal `failed` jobs.
- The worker records `last_error_*` and `last_attempt_at` for support.
- Every five minutes, stale `running` rows are reconciled with their BullMQ
  state. A job still `active`, `waiting`, or `delayed` is left alone. A missing,
  failed, or inconsistent queue job becomes `failed` with a stable error code.
- Generated output paths remain deterministic by AI job ID. Retried attempts
  must not create random output paths.

### Worker incident steps

1. Check `/healthz`; if it fails, restart the worker service.
2. Check `/readyz`; a Redis failure means do not enqueue new generation jobs.
3. Inspect logs by `jobId`, `bullJobId`, and `requestId`, never by raw prompt.
4. For large queue wait, confirm worker count/concurrency, Redis availability,
   OpenAI rate-limit responses, and current job duration before scaling.
5. Do not manually set a job to `succeeded`. Retry only after determining that
   its input assets and output path are safe to reuse.

## 2. Error tracking and alerts

### Baseline implementation

All server and worker logs use `createSafeLogger()`, which redacts secrets,
tokens, signed URL query strings, prompts, chat content, snapshots, and binary
payloads. Every public API failure includes a `requestId`.

Set `OPS_ALERT_WEBHOOK_URL` to an HTTPS endpoint owned by an alerting provider
or internal relay. The endpoint receives generic JSON with only redacted IDs and
codes. `OPS_ALERT_COOLDOWN_MS` defaults to five minutes per alert class.

Required alert events:

- `ai_job_queue_wait_high`
- `ai_job_failed`
- `openai_generation_failure`
- `r2_generation_failure`
- `ai_job_stalled`
- `ai_job_stalled_reconciled`
- `ai_job_enqueue_failed`
- `credit_mutation_failed`

### Alert policy

- Page or notify an on-call owner for terminal job failures, R2/OpenAI failures,
  Redis readiness failure, and credit mutation failures.
- Warn for queue wait above `AI_JOB_QUEUE_WAIT_ALERT_MS` (default two minutes).
- Alerts must link to `requestId`, `jobId`, and deployment revision where
  available. They must not contain raw user content.
- Before public release, connect the webhook to a durable log/error-tracking
  system and test one synthetic alert in staging.

## 3. Supabase Auth production checklist

Configure these in the **production Supabase Dashboard**, not in source code:

1. Enable email confirmation for password sign-up.
2. Set password minimum length to at least 12 and enable breached-password
   protection where available.
3. Configure CAPTCHA for sign-up, sign-in, password recovery, and other public
   auth endpoints.
4. Set Auth rate limits for sign-up, sign-in, recovery, verification, and token
   refresh. Verify the deployed proxy preserves end-user IP behavior.
5. Restrict redirect URLs to exact production origins. Do not leave wildcard
   callback URLs enabled.
6. Use short access-token lifetime (start at 30–60 minutes), enable refresh
   token rotation/reuse detection, and verify session revocation behavior.
7. Require MFA for every internal admin account and remove former team members.
8. Run a staging test for password signup, confirmation, login throttling,
   password reset, session refresh, logout, and admin MFA before release.

Record the dashboard setting owner, date verified, and screenshots without
including API keys in the release ticket.

## 4. Database and R2 backup/restore

### Backup policy

- Confirm Supabase plan backup retention and whether Point-in-Time Recovery
  (PITR) is enabled. PITR gives a finer restore point but costs extra.
- Take a logical database backup before every destructive migration using
  `supabase db dump` or `pg_dump`, storing it encrypted outside the app account.
- Database backups restore metadata only. Cloudflare R2 objects require their
  own lifecycle/backup policy because a Supabase restore cannot recover deleted
  R2 image binaries.
- Test restoring a backup to a new isolated Supabase project at least quarterly.

### Restore procedure

1. Declare incident and stop worker intake to prevent new writes.
2. Identify the recovery point, expected data loss window, and owner approving
   the restore.
3. Prefer restore/clone into a new project first for validation.
4. Validate migrations, RLS, critical project/asset/job rows, and asset object
   availability before redirecting traffic.
5. Rotate service credentials after a restore if incident scope requires it.
6. Record duration, recovery point, lost-write window, and follow-up actions.

## 5. Deploy and migration rollback

### Safe deployment order

1. Merge and review backward-compatible SQL migration files.
2. Apply migrations to staging, run tenant-isolation and smoke tests.
3. Deploy the worker version that understands both old and new schema.
4. Deploy web after worker readiness passes.
5. Run owned-user smoke flows: project create, draft save, chat, generate job,
   private asset delivery, and credit debit/refund.
6. Monitor queue wait, job failures, API errors, and alert delivery.

### Rollback rules

- Roll back web/worker code to the prior deployment first when a deploy fails.
- Do **not** blindly reverse a production migration. Prefer a new forward-fix
  migration because data may already have been written using the new schema.
- If a migration is destructive, prepare an explicit restore plan and backup
  verification before applying it.
- If migration history and schema diverge, diagnose with `supabase migration
  list`; use `migration repair` only after confirming actual schema state.

## 6. Release evidence

Keep a release record containing:

- deployed web and worker commit SHA;
- migration IDs applied to staging and production;
- Auth checklist confirmation;
- Redis TLS/readiness result;
- backup timestamp and last restore drill date;
- tenant-isolation test result;
- alert webhook synthetic test result;
- known risks and rollback owner.

## 7. Storage lifecycle cleanup

- Run `npm run storage:temp-assets:dry-run` daily in staging and production.
  It considers only assets marked `metadata.temporary=true`, older than 24
  hours, and excludes inputs referenced by queued/running jobs.
- Run `npm run storage:orphan-r2:dry-run` before any deletion. It finds old R2
  objects that have no asset/library metadata row.
- Use the corresponding `:delete` command only after reviewing dry-run output.
  Keep deletion logs as release/operations evidence.
- Failed job output and project deletion cleanup remain dependent on the same
  orphan pass until a dedicated soft-delete/outbox lifecycle table is added.
  Do not bulk-delete project prefixes without a verified DB ownership query.
