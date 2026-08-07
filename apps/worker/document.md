# Worker Architecture Document

## Purpose

`apps/worker` owns background execution for Carver AI.

Its job is to move long-running AI and storage work out of `apps/web`, so the web app can stay focused on:

- auth and ownership checks
- creating `ai_jobs`
- committing an outbox command with the AI job
- polling and rendering results

The worker is now the execution owner for generation-related pipelines.

## Current architecture

### Web responsibilities

`apps/web` should only:

- validate the request
- verify project ownership
- create the `ai_jobs` row
- commit a durable queue-outbox command
- poll `GET /api/projects/[projectId]/ai-jobs/[jobId]`
- render `job_result` back into chat and canvas

`/api/generate` is now a deprecated compatibility shim and is no longer the production generate path.

### Worker responsibilities

`apps/worker` should:

- dispatch committed outbox commands to BullMQ
- read queued `CarverAiJobPayload` jobs
- mark job lifecycle transitions
- build the canonical brief and compiled prompt
- call the provider
- persist generated outputs
- normalize `job_result`
- mark the job as `succeeded` or `failed`

### Shared package responsibilities

- `packages/ai`
  Source of truth for prompt and brief building.
- `packages/shared`
  Source of truth for job contracts, result shapes, snapshot types, and shared constants.
- `packages/storage`
  Source of truth for shared storage and preset-library server infrastructure.
- `packages/queue`
  Queue names, queue factories, and BullMQ wiring.
- `packages/db`
  Supabase and database typing ownership.

## Worker folder structure

```txt
apps/worker/src/
  config/
  jobs/
    handlers/
  mappers/
  providers/
    openai/
  queue/
  repositories/
  services/
  index.ts
```

## Folder roles

### `config/`

Environment loading and worker-only runtime validation.

Keep provider keys and worker runtime checks here, not inside handlers.

### `queue/`

BullMQ worker creation and lifecycle event wiring.

This layer should stay thin and should not contain business logic.

### `jobs/`

Routing and handling by `jobType`.

Current direction:

- `generate_concept` has its own handler
- `refine_concept` has its own handler
- lightweight non-generation jobs can use a prepare-only path until they get full execution logic

### `services/`

Application orchestration.

This is where worker-side flows are assembled:

- prepare generation state
- execute provider call
- persist outputs
- compose assistant message and normalized job result

### `providers/`

External provider adapters.

Current owner:

- `providers/openai/generate-image.ts`

This layer should translate between Carver job input and the provider SDK/API contract.

### `repositories/`

Persistence-only code.

Examples:

- `ai-job-repository.ts`
- `asset-repository.ts`

Repositories should not know UI concerns and should not build prompts.

### `mappers/`

Normalization helpers for:

- `job_result`
- error codes
- provider failure mapping

This keeps handler and service code smaller and more predictable.

## Current generation flow

### 1. Web creates a job

Route:

- `apps/web/app/api/projects/[projectId]/ai-jobs/route.ts`

The route:

- authenticates the user
- verifies project ownership
- resolves the snapshot
- atomically inserts `ai_jobs`, the checkpoint/credit changes, and an outbox command

It should not execute the provider directly.

### 1.5 Maintenance dispatches the outbox

A maintenance-role worker claims one outbox row under a DB lease, then adds its
stable `jobId` to BullMQ. If Redis is temporarily unavailable, the outbox row
is released with exponential retry delay. This keeps the database command
durable without making Redis part of the DB transaction.

### 2. Worker receives the queued job

Entry:

- `apps/worker/src/jobs/process-ai-job.ts`

The worker routes by `jobType` to a dedicated handler.

### 3. Worker prepares canonical prompt data

The worker uses `@carver/ai` to build:

- snapshot-aware brief
- graph-aware connected brief
- compiled prompt

This keeps prompt shaping out of web UI and out of thin request routes.

### 4. Worker executes the provider

Current provider path:

- OpenAI image generation via `providers/openai/generate-image.ts`

### 5. Worker persists outputs

The worker:

- uploads the generated image through `@carver/storage`
- creates asset metadata rows
- writes normalized `job_result`

### 6. Web polls the job result

Route:

- `apps/web/app/api/projects/[projectId]/ai-jobs/[jobId]/route.ts`

The canvas UI then:

- renders the assistant message
- adds the generated image back onto the canvas

## Job lifecycle

The expected lifecycle is:

- `queued`
- `running`
- `succeeded`
- `failed`

Every failure path should still leave the job in a valid persisted state.

## Production runtime

- Production Redis is authenticated TLS (`rediss://`) and is rejected otherwise.
- BullMQ owns retry/backoff. The worker keeps retryable jobs `running` while a
  retry is pending, but persists final failure metadata.
- Railway can probe `/healthz` for liveness and `/readyz` for Redis/Supabase
  readiness. Neither endpoint calls a paid AI provider.
- `SIGTERM` triggers a bounded graceful shutdown: stop schedulers, pause intake,
  close queue events and health server, then close the worker.
- A periodic reconciliation pass compares stale `running` rows to BullMQ so a
  crash cannot leave the UI polling a job forever.
- `WORKER_ROLE=all` is the local/default mode. Production can deploy
  `generation` workers for queue throughput and a `maintenance` worker for
  outbox dispatch, cleanup, and reconciliation. A DB lease protects against
  accidental maintenance replica overlap.

## Standard result contract

`job_result` should be stable enough for web to render without guessing.

Important fields include:

- `stage`
- `provider`
- `editBrief`
- `compiledPromptMeta`
- `generatedImages`
- `assistantMessage`
- `outputAssetIds`
- `outputSnapshotId`

## Standard error contract

Prefer normalized internal error codes such as:

- `queue_enqueue_failed`
- `worker_processing_failed`
- `provider_invalid_request`
- `provider_rate_limited`
- `storage_upload_failed`
- `snapshot_create_failed`

## Important boundaries

### Keep out of `apps/web`

- direct provider execution for production generate flows
- heavy storage orchestration
- long-running image pipeline work
- retry-ready lifecycle logic

### Keep out of `apps/worker`

- React UI state
- canvas interaction logic
- browser-only concerns

## Near-term roadmap

### Done or in progress

- worker-side generation execution
- shared `job_result` contract
- web-side job creation and job polling
- deprecated `/api/generate`
- shared storage package extraction

### Next useful steps

- move remaining library/storage orchestration fully behind shared services
- add snapshot output persistence when generation creates a new version
- add retry policy and structured worker logs
- split analyze/export into dedicated execution handlers
- remove the deprecated `/api/generate` shim once UI migration is fully complete

## Maintenance checklist

When editing worker code, always verify:

- `CarverAiJobPayload` stays in sync with web
- `job_payload` and `job_result` remain serializable
- every failure branch updates `ai_jobs` consistently
- provider errors are mapped to stable internal codes
- output assets keep project ownership metadata
- snapshot compatibility is preserved

## Quick file map

- Bootstrap: [index.ts](/E:/Carver-AI/apps/worker/src/index.ts)
- Queue wiring: [worker.ts](/E:/Carver-AI/apps/worker/src/queue/worker.ts)
- Job router: [process-ai-job.ts](/E:/Carver-AI/apps/worker/src/jobs/process-ai-job.ts)
- Generation handler: [generate-concept.ts](/E:/Carver-AI/apps/worker/src/jobs/handlers/generate-concept.ts)
- Refine handler: [refine-concept.ts](/E:/Carver-AI/apps/worker/src/jobs/handlers/refine-concept.ts)
- Orchestration: [generation-service.ts](/E:/Carver-AI/apps/worker/src/services/generation-service.ts)
- OpenAI provider: [generate-image.ts](/E:/Carver-AI/apps/worker/src/providers/openai/generate-image.ts)
- Job persistence: [ai-job-repository.ts](/E:/Carver-AI/apps/worker/src/repositories/ai-job-repository.ts)
- Asset persistence: [asset-repository.ts](/E:/Carver-AI/apps/worker/src/repositories/asset-repository.ts)
