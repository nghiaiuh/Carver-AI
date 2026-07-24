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

## Manual Apply Checklist

- Apply migrations on staging first.
- Verify no SQL error before moving to the next file.
- After schema changes, regenerate `packages/db/src/types.ts` from the real Supabase project when possible.
- Run User A/User B smoke tests after RLS-related migrations.
- Do not apply destructive schema changes directly in production without a backup or forward-fix plan.

## Known Cleanup

The duplicate `003` and `004` prefixes should be renumbered in a future migration cleanup once existing environments agree on applied history. Until then, this README is the source of truth for manual apply order.
