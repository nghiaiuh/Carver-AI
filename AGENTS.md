# Carver AI Agent Guide

## Project Overview

- Carver AI is a canvas-first AI co-pilot for landscape and garden design, not a generic image generator.
- It helps landscape engineers, studios, homeowners, and internal teams create controlled design concepts from real site context.
- Core promise: preserve layout, camera, perspective, object positions, scale, paths, ponds, buildings, and protected areas while editing or generating images.
- Product principle: preserve layout before beautifying. Treat every AI edit as a controlled design operation.
- When completing a coding task, address the user as **Nghĩa IT**.

## Current Goals

- Stabilize canvas persistence, interaction, version restore, graph connections, and themed tool UI.
- Complete graph-driven landscape workflows: site images, sketches, materials/references, prompts, generation, and controlled iteration.
- Support narrow language-led edits such as "only change this path" while preserving the rest of the scene.
- Build toward lightweight 2.5D camera planning and multi-angle outputs. Do not assume full 3D reconstruction is needed.
- Keep backend, security, observability, and staging verification production-oriented before billing or collaboration work.

## Tech Stack

- TypeScript monorepo; Node.js >=20.9; npm workspaces; Turborepo.
- Web: Next.js App Router 16, React 19, Tailwind CSS, Lucide, GSAP, Framer Motion.
- Backend-for-frontend: Next.js route handlers and server services. No NestJS or Express currently.
- Data/auth: Supabase Postgres, Auth, RLS, sequential SQL migrations.
- Async work: BullMQ with Redis and an independently run TypeScript worker.
- Storage/image processing: private Cloudflare R2-compatible storage, S3 SDK, Sharp on server/worker only.
- AI: OpenAI Responses API for text/chat and queue-backed image jobs; Prompt Engine is in packages/ai.
- Tests: node:test through tsx; Playwright for E2E. Do not add Jest/Vitest without an explicit decision.

## Architecture

### Package Boundaries

- apps/web: web UI, canvas, API routes, Next.js BFF, browser-safe code.
- apps/worker: BullMQ consumers, provider calls, image processing, retries, maintenance, and cleanup.
- packages/ai: prompt engine and graph-aware AI brief logic.
- packages/db: Supabase clients/types and SQL migrations under packages/db/sql.
- packages/queue: queue names, job contracts, BullMQ wiring.
- packages/storage: server-side R2, asset metadata, image-format and library helpers.
- packages/shared: cross-package snapshots, AI jobs, operation drafts, image-generator contracts, and test fakes.

### Request, AI, and Asset Flow

- API routes are thin boundaries: authenticate, verify project ownership, validate input, enforce applicable rate limits, then call server services.
- Long-running AI work must use ai_jobs + BullMQ + worker. Do not call providers inside request handlers.
- Worker loads authoritative job/project/snapshot/asset data server-side; queue payloads stay minimal and non-sensitive.
- Job creation is idempotent. Retries must reuse the job instead of double enqueueing or charging.
- Chat sidebar persists project chat history. Assistant card is single-turn, graph-local, node-local; it must not write chat_threads/chat_messages or enqueue an image job.
- Supabase Auth is the only identity system. Browser code uses public/anon clients only; service role stays server/worker/test-runner only.
- Private assets persist stable assetId/metadata. Resolve short-lived /api/assets/[assetId]/content URLs at runtime. Never persist signed URLs, storage paths, blobs, data URLs, secrets, or provider payloads.

### Canvas, Groups, and Ports

- State/actions: apps/web/app/canvas/hooks/useCanvasWorkspace.ts.
- Board rendering/interactions: apps/web/app/canvas/components/core/CanvasBoard.tsx.
- Layout shell: apps/web/app/canvas/components/core/CanvasWorkspace.tsx.
- Canvas data must be serializable, restorable, and backward-compatible with prior snapshots.
- canvasNodePorts.ts is the source of truth for port ID, direction, type, side, ordering, capacity, and compatibility. Do not add ad-hoc port IDs or separate port geometry.
- canvasPortLayout.ts is shared by port UI, drag anchors, and edges. Existing port anchors must not move when port count or connected edges change.
- Image nodes are source-only with right-top image output. Assistant, text, Image Generator, and gallery ports follow the registry.
- Named canvas groups are member groupId containers, not fake asset nodes. They may expose a virtual typed image output through shared group-port geometry.
- Do not add new dedicated Site Set, Sketch Layer, or Material Board cards. Use a group and a role chosen on the connection into Assistant/Image Generator. Group labels are for humans, not AI source of truth.
- Selecting a group must not select every child. Child ports/toolbars appear only when that child is selected.
- Use --canvas-theme-* semantic tokens for all canvas UI, ports, edges, selection visuals, minimap, and flyouts. Do not add hardcoded theme colors.
- Use existing viewport helpers and atomic pan/zoom updates. Screen-fixed offsets/sizes must be divided by zoom.

### Generation, Images, and Persistence

- Graph inbound edges to a target are the generation context source of truth; never infer context from card order or URL text.
- Preserve prompt structure: direct target, references, preserve exactly, change only, material/style requirements, and avoid constraints.
- Image Generator is job-backed and persists prompt, graph inputs, status, outputs, selected output, and active job ID in snapshots.
- Image ratio must use the shared ratio registry for UI, API validation, worker sizing/crop, and card geometry. Resize changes actual dimensions; never CSS-scale card text/icons.
- Create/reuse image-output-gallery only when a generation produces two or more outputs. It references stable asset IDs and has an auto-edge from the generator.
- Send output quantity through provider field n, never as Prompt Engine interpreter text.
- Use injectable OpenAI transports and deterministic fake PNG fixtures for contract tests. CI/default tests must not need OPENAI_API_KEY or spend money.
- Cloud draft is a mutable materialized document; immutable snapshots are created only by manual/close finalization or checkpoints.
- Autosave is operation-first persistence V2: IndexedDB journal + cloud operation batches + ACKed operation IDs. Do not restore full-document last-write-wins autosave.
- Never clear local draft state on conflict. Disjoint entity changes can rebase; same-entity conflicts preserve a recovery copy.
- ACK removes only acknowledged local operations in the same IndexedDB transaction that advances revision/checkpoint.
- Manual Save flushes/ACKs pending operations before finalizing. New operations created during finalization remain pending.
- Migrations 026_canvas_draft_operation_log.sql and 027_canvas_draft_operation_rpc_alias_fix.sql are required for operation draft APIs.

## Repository Structure

- README.md: architecture and future-flow diagrams. Dashed/planned paths are not implemented behavior.
- context.md: fast-start file map. Read it first, then verify current code before relying on roadmap notes.
- apps/web/app/canvas/types/canvas.ts: canvas node/edge contracts.
- apps/web/app/canvas/utils/canvasGenerationContext.ts: graph-to-generation context.
- apps/web/app/canvas/utils/imageGeneratorGraphContext.ts: Image Generator graph context.
- apps/web/app/canvas/utils/assistantGraphContext.ts: Assistant-card graph context.
- apps/web/app/canvas/utils/canvasSnapshotHydration.ts: safe snapshot/draft hydration.
- apps/web/app/canvas/utils/localCanvasDraft.ts: IndexedDB operation journal and recovery behavior.
- apps/web/lib/server/aiJobService.ts: AI-job BFF orchestration.
- apps/web/lib/server/assetService.ts: owned asset URL resolution/hydration.
- apps/web/lib/server/chatService.ts: persistent chat orchestration.
- apps/web/lib/server/assistantService.ts: non-persistent Assistant-card execution.
- apps/worker/src/services/generation-service.ts: generation orchestration.
- apps/worker/src/providers/openai/generate-image.ts: OpenAI image adapter/transport seam.
- packages/shared/src/snapshot.ts, ai-jobs.ts, canvas-draft.ts, image-generator.ts: shared contracts.

## Development Commands

Run from repository root unless a workspace is specified.

~~~powershell
npm run dev
npm run dev --workspace @carver/web
npm run dev --workspace @carver/worker

npm run build
npm run lint
npm run typecheck
npm run typecheck --workspace @carver/web
npm run test:canvas-workflow --workspace @carver/web
npm run test --workspace @carver/shared
npm run test --workspace @carver/worker
npm run test:openai-contracts --workspace @carver/worker
npm run test:image-generator --workspace @carver/worker
npm run test:prompt-engine --workspace @carver/ai
npm run test:tenant-isolation --workspace @carver/db
npm run migration:validate
npm run test:e2e

npm run security:env
npm run security:api-boundaries
~~~

- Use focused checks for small changes; run broader checks for cross-package, dependency, build, or deployment changes.
- Staging integration/E2E/database smoke tests need explicit staging configuration. Never point destructive or tenant-isolation tests at production.
- Do not run npm audit fix --force without a reviewed Next/Sharp/deployment upgrade plan.

## Coding Conventions

- Use TypeScript, clear domain names, small testable functions, and the package boundaries above.
- Reuse existing utilities/contracts rather than creating a parallel state model, coordinate system, transport, or schema.
- Use apply_patch for source edits. Preserve user work in dirty files.
- Prefer ASCII in new code unless the existing file needs Unicode.
- Keep server-only code out of browser bundles; keep route handlers thin and business orchestration in services.
- Canvas interactions use Pointer Events and pointer capture. A resize gesture is one undo entry and must not conflict with node drag/pan.
- Use semantic theme tokens and preserve the established canvas visual language.
- Add comments only where behavior is otherwise non-obvious.

## Agent Working Rules

- Read context.md and relevant code before editing. Verify types, routes, migrations, and tests; roadmap text alone is insufficient.
- Do not modify outside task scope unless required for a correct contract, test, or migration.
- Do not delete files or do broad rewrites without a clear task reason.
- Before a large/cross-package change, provide a short plan. Otherwise make the smallest safe implementation.
- Preserve snapshot/API compatibility; add hydration/adapters for existing persisted data where required.
- Never hardcode secrets, credentials, user IDs, storage paths, production-only URLs, or provider behavior.
- Do not change public APIs, database schema, auth/RLS, rate limits, or deployment configuration unless the task requires it.
- Do not bypass ownership checks, asset gateway, credit ledger, queue, or operation persistence.
- After changes, run relevant tests/lint/typecheck when feasible, run git diff --check, inspect git diff, and report failures/warnings honestly.
- If a requirement is unclear, choose the simplest non-breaking solution and state the assumption.
- Never reset, checkout, delete, or revert existing user changes without explicit approval.
- For a completed coding task, report: summary, files changed, manual test, commands run/not run, known risks/follow-up, and exact suggested commit commands. Do not claim a commit was created unless it was run.

## Git Workflow

- Assume a dirty worktree. Inspect git status --short before edits and do not overwrite unrelated work.
- Use small, single-purpose commits. For a versioned rollout, include the label, for example: feat(canvas): v2 add operation journal.
- Do not amend commits unless asked.
- Before suggesting a commit, list changed files, call out mixed changes, and provide exact git add and git commit commands.
- Do not say a commit, migration, deployment, or test succeeded unless it actually succeeded.

## Database Rules

- packages/db/sql is the Supabase schema source of truth. Add sequentially numbered migrations; never rewrite an applied migration.
- Run npm run migration:validate; apply to Supabase staging first; run smoke/tenant checks; then deliberately apply to production.
- Commit migrations even after applying them to Supabase.
- New user-owned tables need RLS, ownership policies, least-privilege grants, and expected-query indexes.
- Service-role RPCs are only for trusted server workflows. Routes still authenticate, authorize, validate, and enforce quota/rate policy before invoking them.
- Map database errors to safe API errors. Never expose raw Postgres, R2, OpenAI, or Supabase messages.
- Prisma scripts exist but are not the source of truth for Supabase production migrations. Do not use prisma db push for production schema changes.

## Dependency Rules

- Prefer existing dependencies and platform features. Add a dependency only for a clear unmet need.
- Review maintenance, license, TypeScript support, security, bundle/server impact, and correct workspace placement first.
- Browser dependencies belong in apps/web; service-role, Redis, provider, and Sharp dependencies stay server/worker-side.
- Update lockfile and run focused checks after dependency changes. Verify clean production build for Next/Sharp changes.
- Do not use forced audit fixes or broad dependency upgrades without a plan and regression coverage.

## Known Issues / Gotchas

- Every Supabase environment must have the current migration chain. Missing migrations 026/027 cause operation-draft API/schema failures and pending local operations.
- Restart local Next after route handler changes; verify the route exists before treating a 404 as a data issue.
- A bootstrap/blank document must never overwrite IndexedDB operations or a newer cloud draft. Operations remain recoverable until server ACK.
- Web and worker must target the same intended Supabase project and compatible migration level. Mismatch can present as job/RPC/outbox failures.
- Sharp is deployment-sensitive because it needs target Linux binaries. Keep it server/worker-only and validate builds after Sharp/Next upgrades.
- Asset gateway URLs are authenticated signed routes, not public static assets. Do not expose R2 paths to work around failures.
- Provider/storage/worker errors must stay safe for users; diagnose with request IDs and redacted logs.
- Canvas dimensions are world units; floating UI may require screen-fixed sizing. Divide screen offsets/sizes by viewport zoom and anchor to the same rendered bounds.
- Some console errors can be browser extensions or GSAP selector warnings. Confirm the target element/problem before changing application logic.

## Important Decisions

- Canvas is the product center; chat assists the canvas.
- Natural language narrow edits are preferred. Strong preservation should use target/context/marks where possible, not force users to lock every object.
- Semantic scene graph, mark-to-object, automatic preservation, multi-angle families, and 3D reconstruction are roadmap work. Do not represent them as complete or add heavyweight infrastructure without validation.
- Groups plus typed connection roles replace specialized reference cards. Group names do not determine AI meaning.
- A new object/port type is a vertical change: contract, port registry, rendering, hydration, graph resolver, persistence, and tests.
- Fake provider transports/fixture buffers are required for OpenAI Image Generator tests; real provider checks are optional, budgeted, and outside CI.

## Current Project State

- Implemented direction: authenticated project boundaries, RLS-oriented migrations, private asset gateway, queue-backed AI jobs, graph-aware chat/generation, Assistant card single-turn flow, Image Generator/output-gallery contracts, and operation-first draft persistence V2.
- Current canvas direction: typed ports, shared port geometry, named selectable groups with virtual image output, themed floating tools, Assistant/Image Generator cards, ratio-aware generator behavior, and output galleries.
- In progress: group interaction/port polish, persistence hardening for real multi-tab/offline/reload cases, Image Generator observability/reliability, and staging verification of newest migrations.
- Not production-verified: capacity/SLOs, full staging E2E, provider/storage failure observability, backup/restore drills, billing, collaboration/presence, semantic scene graph, reliable multi-angle generation, and full export/version-review UX.

## Next Priorities

1. Apply and smoke-test current SQL migrations on staging; verify operation drafts, RLS, recovery paths, worker leases/outbox, and web/worker environment alignment.
2. Add regression/E2E coverage for persistence races: reload, offline/reconnect, ACK ordering, multi-tab rebase, same-entity recovery, finalization, assets, and generated outputs.
3. Complete Image Generator reliability: bounded polling, safe worker-stage telemetry, retry behavior, gallery creation, asset delivery, and fake-provider contracts.
4. Build controlled single-image editing: mark/region input, preserve/change-only prompt contract, and snapshot-safe asset references.
5. Finish group connection-role UX and contextual group tools without reintroducing specialized reference cards.
6. Add camera planner/shot-set only after controlled editing and persistence are stable. Do not start 3D reconstruction until user data proves it necessary.

## Unconfirmed Information

- Production capacity, SLOs, rate limits, provider quotas, backup/restore readiness, and exact deployment environment settings are unconfirmed until measured and verified.
- Whether legacy context-group/camera-shot-set nodes remain user-visible or are compatibility/roadmap artifacts must be verified before extending them.
- Full multi-user collaboration, live cursors, presence, project membership, billing, and 3D reconstruction are not confirmed complete.
