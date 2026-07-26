# Carver AI SQL Migration Order

Apply these SQL files in the exact order below. The numeric prefixes are historical and include duplicate `003` / `004` prefixes, so do not rely on filename sorting alone when applying migrations manually in Supabase SQL Editor.

## Apply Order

| Step | File | Purpose |
| --- | --- | --- |
| 1 | `001_canvas_chat_schema.sql` | Base project, canvas, chat, asset, job, design version, export schema. |
| 2 | `002_rls_policies.sql` | Base RLS policies for user-owned/project-owned tables and storage buckets. |
| 3 | `003_ai_job_v2.sql` | AI job v2 columns and project-owner update policy. |
| 4 | `003_library_schema.sql` | Library folders/assets metadata schema. |
| 5 | `004_canvas_snapshot_rpc.sql` | Atomic canvas snapshot save RPC. |
| 6 | `004_library_rls_policies.sql` | RLS policies for library folders/assets. |
| 7 | `005_release_hardening.sql` | Release indexes, constraints, idempotency, and hardened AI job policies. |
| 8 | `006_profile_credit_rpcs.sql` | Profile credit reservation/restore RPCs. |
| 9 | `007_local_draft_snapshot_versions.sql` | Snapshot kind/version metadata and local-draft-aligned snapshot semantics. |
| 10 | `008_ai_job_retry_observability.sql` | AI job retry observability fields for BullMQ processing. |
| 11 | `009_project_canvas_drafts.sql` | Mutable cloud drafts and draft finalize RPCs. |
| 12 | `010_project_canvas_drafts_owner_id_fix.sql` | Fixes ambiguous owner references in the draft RPC. |
| 13 | `011_security_foundation.sql` | Server-managed profiles, immutable credits, and server-only AI-job creation. |
| 14 | `012_distributed_rate_limits.sql` | Atomic per-user API rate limiting. |
| 15 | `013_asset_metadata_integrity.sql` | Asset and library path/ownership integrity triggers. |
| 16 | `014_project_workspace_rpc.sql` | Atomic project, initial snapshot, brief, and chat-thread creation. |
| 17 | `015_tenant_integrity_constraints.sql` | Draft tenant binding and validated legacy ownership constraints. |
| 18 | `016_rate_limit_scope_allowlist.sql` | Fixed allowlist for public rate-limit RPC scopes. |
| 19 | `017_draft_snapshot_service_boundary.sql` | Moves draft/snapshot write RPCs behind the service-role API boundary. |
| 20 | `018_service_role_draft_trigger_fix.sql` | Allows service-boundary draft writes while preserving project-owner integrity. |
| 21 | `019_project_delete_rate_limit.sql` | Adds the destructive project-delete scope to the fixed rate-limit allowlist. |
| 22 | `020_ai_job_chat_message_idempotency.sql` | Prevents a BullMQ retry from inserting duplicate generated assistant messages. |
| 23 | `021_ai_job_poll_rate_limit.sql` | Limits authenticated AI-job polling without disrupting normal long-running job updates. |
| 24 | `022_asset_resolve_rate_limit.sql` | Limits authenticated runtime asset URL resolution. |

## Manual Apply Checklist

- Apply migrations on staging first.
- Verify no SQL error before moving to the next file.
- After schema changes, regenerate `packages/db/src/types.ts` from the real Supabase project when possible.
- Run User A/User B smoke tests after RLS-related migrations.
- Do not apply destructive schema changes directly in production without a backup or forward-fix plan.

## Tenant Isolation Integration Test

The test creates two temporary Supabase Auth users, seeds User A-owned records,
and verifies that User B cannot read or mutate them through RLS or web API routes.
It never uploads an object to R2 or calls an AI provider.

Run it only against a local or staging environment with the same migrations as
the web app. The explicit environment gate prevents accidental production use:

```bash
CARVER_RUN_INTEGRATION_TESTS=1
CARVER_TEST_ENVIRONMENT=local # or staging
SUPABASE_TEST_URL=https://your-test-project.supabase.co
SUPABASE_TEST_ANON_KEY=...
SUPABASE_TEST_SERVICE_ROLE_KEY=...
CARVER_TEST_WEB_BASE_URL=http://localhost:3000
npm run test:tenant-isolation --workspace @carver/db
```

`CARVER_TEST_WEB_BASE_URL` must point to a web instance configured against the
same test database. Do not reuse production credentials for any `*_TEST_*` variable.

## Staging Release Smoke: Migrations 011-022

Use both checks below before deploying these security migrations to production.
They deliberately target a separate staging Supabase project and never accept a
`production` test environment value.

1. Apply migrations `001` through `022` in the exact order above to staging.
2. In the staging Supabase SQL Editor, run
   `staging_release_smoke_011_016.sql`. It is read-only and verifies the
   required tables, RLS, policies, constraints, triggers, RPCs, revoked table
   grants, and the fixed rate-limit scope allowlist.
3. Start a web instance using that same staging Supabase project, then run the
   two-user test from PowerShell:

```powershell
$env:CARVER_RUN_INTEGRATION_TESTS = "1"
$env:CARVER_TEST_ENVIRONMENT = "staging"
$env:SUPABASE_TEST_URL = "https://your-staging-project.supabase.co"
$env:SUPABASE_TEST_ANON_KEY = "your-staging-anon-key"
$env:SUPABASE_TEST_SERVICE_ROLE_KEY = "your-staging-service-role-key"
$env:CARVER_TEST_WEB_BASE_URL = "https://your-staging-web.example"
npm run test:tenant-isolation --workspace @carver/db
```

The integration test creates and deletes two temporary Auth users. It checks
that User B cannot read or mutate User A's project, snapshot, draft, assets,
chat, AI job, or library records through either RLS or sensitive web API routes.
Keep all `*_TEST_*` secrets in a local, ignored environment file; never paste a
service-role key into source control or a terminal recording.

The smoke script also verifies the service-boundary controls introduced in
`017` and `018`, the `project-delete` rate-limit allowlist entry from `019`,
the AI-job chat-message idempotency index from `020`, the bounded AI-job
polling scope from `021`, and the asset URL resolution scope from `022`.

## Known Cleanup

The duplicate `003` and `004` prefixes should be renumbered in a future migration cleanup once existing environments agree on applied history. Until then, this README is the source of truth for manual apply order.
