# Carver AI

Carver AI is an AI landscape design co-pilot for landscape engineers, garden studios, designers, and homeowners. It turns site photos, sketches, references, and natural-language instructions into controlled garden concepts while preserving important layout constraints such as camera angle, house and pond position, paths, materials, and locked areas.

The main product experience is a canvas-first editor: the canvas is the workspace, and AI supports the design process through chat, references, region edits, and queued image generation.

## Architecture

Carver AI uses a **local-first AI canvas editor with a Next.js BFF, shared domain contracts, private asset delivery, and queue-driven worker processing**.

The diagrams below describe the target production architecture. Solid paths are implemented or preserve the current design. Dashed paths marked `planned` are the next scalability work and must not be treated as already shipped.

### Target system architecture

```mermaid
flowchart LR
  User((User))

  subgraph Browser["Browser / Local-first"]
    Canvas["Canvas workspace"]
    Memory["Working state + undo/redo<br/>memory only"]
    IndexedDB["IndexedDB journal + checkpoints<br/>crash/offline recovery"]
    SyncLeader["Draft sync coordinator<br/>Web Locks + BroadcastChannel"]
    RuntimeAssets["Runtime asset URL cache"]
    JobStatus["Adaptive polling<br/>realtime later"]
  end

  subgraph BFF["Next.js Web App / BFF"]
    Routes["API routes<br/>HTTP boundary only"]
    Guards["Authentication + ownership<br/>validation + rate limits"]
    Services["Application services<br/>draft / version / AI job / asset / chat"]
    AssetAuth["Asset authorization<br/>assetId -> short-lived token"]
  end

  subgraph Data["Authoritative data"]
    Supabase[("Supabase Auth + Postgres<br/>projects / mutable drafts / versions<br/>assets / jobs / chat / credits / outbox")]
    Redis[("Redis / BullMQ<br/>AI job transport only")]
    R2[("Cloudflare R2<br/>private asset binaries")]
  end

  subgraph Edge["Private delivery edge"]
    AssetEdge["Cloudflare Worker / CDN<br/>validate delivery token"]
  end

  subgraph Workers["Horizontally scalable workers"]
    Outbox["Outbox dispatcher<br/>planned"]
    Generation["Generation worker pool<br/>receive jobId only"]
    TrustedLoad["Load + revalidate trusted DB data"]
    Persist["Idempotent output persistence"]
    Maintenance["Maintenance worker<br/>cleanup / sync / reconciliation"]
  end

  OpenAI[("OpenAI<br/>text + image providers")]
  Observability["Logs / metrics / alerts / traces"]

  User --> Canvas
  Canvas --> Memory
  Memory --> IndexedDB
  IndexedDB --> SyncLeader
  SyncLeader --> Routes
  Canvas --> RuntimeAssets
  Canvas --> JobStatus
  JobStatus --> Routes

  Routes --> Guards
  Guards --> Services
  Guards --> AssetAuth
  Services --> Supabase
  Services -->|synchronous text chat| OpenAI
  AssetAuth --> Supabase
  AssetAuth -. short-lived token .-> RuntimeAssets
  RuntimeAssets -. direct private delivery / planned .-> AssetEdge
  AssetEdge --> R2

  Supabase -. committed outbox rows / planned .-> Outbox
  Outbox -. enqueue after DB commit / planned .-> Redis
  Redis --> Generation
  Generation --> TrustedLoad
  TrustedLoad --> Supabase
  TrustedLoad --> R2
  Generation --> OpenAI
  Generation --> Persist
  Persist --> Supabase
  Persist --> R2
  Maintenance --> Supabase
  Maintenance --> Redis
  Maintenance --> R2

  Routes --> Observability
  Generation --> Observability
  Maintenance --> Observability
```

### Code dependency direction

Applications compose the system. Shared contracts and pure domain logic must not import infrastructure. Infrastructure adapters may implement repository, queue, and storage concerns, but must not own product orchestration.

```mermaid
flowchart TB
  Web["apps/web<br/>UI + BFF composition root"]
  Worker["apps/worker<br/>background execution root"]
  Services["Application services<br/>web + worker orchestration"]
  AI["@carver/ai<br/>pure prompt and generation policy"]
  Contracts["@carver/shared<br/>contracts + schemas + safe primitives"]
  DB["@carver/db<br/>Supabase repositories/adapters"]
  Queue["@carver/queue<br/>BullMQ adapter"]
  Storage["@carver/storage<br/>R2 adapter + image utilities"]
  Ports["Repository / queue / storage ports<br/>planned"]

  Web --> Services
  Worker --> Services
  Services --> AI
  Services --> Contracts
  Services --> DB
  Services --> Queue
  Services --> Storage
  AI --> Contracts
  DB --> Contracts
  Queue --> Contracts
  Storage --> Contracts

  classDef planned stroke-dasharray: 5 5;
  Services -. depend on ports / planned .-> Ports
  DB -. implements .-> Ports
  Queue -. implements .-> Ports
  Storage -. implements .-> Ports
  class Ports planned;
```

Dependency rules:

- API routes authenticate, parse HTTP input, and call application services. They do not contain business workflows.
- `@carver/shared` has no dependency on web, worker, DB, queue, storage, or provider SDKs.
- `@carver/ai` contains pure policy/compiler code; provider SDK and environment access remain server-only.
- `@carver/storage` should converge on R2/image concerns and stop importing the DB package directly.
- Service-role credentials stay inside server and worker composition roots.

### Canvas persistence and versioning

```mermaid
flowchart TD
  Edit["Semantic canvas operation"] --> History["In-memory undo/redo"]
  Edit --> Buffer["Pending operation buffer"]
  Buffer -->|debounce / idle / pagehide| Journal["IndexedDB operation journal"]
  Journal --> Leader["Single sync leader per user + project"]
  Leader -->|PUT documentHash + expectedRevision| DraftAPI["BFF draft service"]
  DraftAPI -->|compare-and-swap| CloudDraft[("project_canvas_drafts<br/>one mutable row per project")]
  CloudDraft -->|revision ACK| Ack["Acknowledge exact operations"]
  Ack --> Journal

  DraftAPI -->|409 revision mismatch| Conflict["Conflict resolver"]
  Conflict --> UseCloud["Use newer cloud draft"]
  Conflict --> Reapply["Reapply safe local operations"]

  Manual["Manual save"] --> SyncFirst["Flush and ACK pending draft"]
  AiCheckpoint["AI job checkpoint"] --> SyncFirst
  Close["Close best effort"] --> AckedOnly["Finalize only an ACKed revision"]
  SyncFirst --> Finalize["Finalize immutable version"]
  AckedOnly --> Finalize
  Finalize --> Versions[("canvas_snapshots<br/>manual / close / job_checkpoint")]
```

Persistence invariants:

- IndexedDB is the crash/offline recovery source; the mutable cloud draft is the cross-device recovery source.
- Cloud autosave updates a mutable revisioned draft and does not create version-history rows.
- Manual save, close finalize, and AI checkpoints create immutable snapshots.
- Never clear unacknowledged local operations, and never persist signed URLs, blobs, or base64 image payloads in draft documents.

### Private asset lifecycle and delivery

```mermaid
flowchart LR
  Upload["Upload / paste image"] --> Validate["BFF validate auth<br/>MIME / size / ownership"]
  Validate --> Binary["Write binary variants<br/>thumb / preview / original"]
  Binary --> R2Asset[("Private R2 object")]
  Binary --> Metadata[("Supabase asset metadata")]
  Metadata --> StableRef["Canvas persists assetId only"]

  StableRef --> Resolve["POST /api/assets/resolve"]
  Resolve --> Ownership["Ownership + project access check"]
  Ownership --> Token["Short-lived delivery token"]
  Token --> CurrentProxy["Current: Next.js content proxy"]
  CurrentProxy -->|read private bytes| R2Asset
  CurrentProxy --> BrowserImage["Browser runtime URL cache"]
  Token -. planned .-> EdgeGateway["Cloudflare Worker / CDN"]
  EdgeGateway -. read private bytes .-> R2Asset
  EdgeGateway -. private byte delivery .-> BrowserImage
```

Asset invariants:

- `assetId` is the durable reference; runtime URLs may expire and must be refreshable.
- Ownership is checked before a delivery token is minted.
- The target scale path moves binary streaming from Vercel functions to a private edge gateway without exposing R2 paths.
- Failed metadata or binary writes require rollback or scheduled orphan cleanup.

### Reliable AI job creation and execution

```mermaid
sequenceDiagram
  participant UI as Canvas / Chat
  participant BFF as Next.js BFF
  participant DB as Supabase transaction
  participant Outbox as Outbox dispatcher (planned)
  participant Queue as Redis / BullMQ
  participant Worker as Generation worker
  participant Provider as OpenAI
  participant R2 as Cloudflare R2

  UI->>BFF: Create generation command + idempotency key
  BFF->>BFF: Auth, ownership, limits, stable asset validation
  BFF->>DB: Atomically reserve credit + checkpoint + ai_job + outbox row
  DB-->>BFF: Commit jobId
  BFF-->>UI: queued_pending / jobId
  Outbox->>DB: Claim undispatched outbox row
  Outbox->>Queue: Enqueue jobId
  Queue->>Worker: Deliver jobId with bounded retries
  Worker->>DB: Load job, snapshot, ownership and asset metadata
  Worker->>Worker: Revalidate context revision, ports, locks and masks
  Worker->>R2: Read trusted input bytes
  Worker->>Provider: Generate using canonical prompt plan
  Provider-->>Worker: Generated output
  Worker->>R2: Idempotent output write
  Worker->>DB: Persist asset metadata + terminal job result
  UI->>BFF: Adaptive poll, with realtime terminal event later
  BFF->>DB: Read user-owned job status
  DB-->>UI: running / retrying / succeeded / failed
```

Job invariants:

- BullMQ payloads contain `jobId` and non-sensitive tracing metadata only.
- Job creation, credit reservation, checkpoint creation, and outbox creation belong to one DB transaction.
- BullMQ is the retry source of truth; handlers throw typed errors and the coordinator decides terminal failure.
- Provider calls and output writes use deterministic idempotency keys to reduce duplicate charge and orphan assets.

### Worker scaling and maintenance isolation

```mermaid
flowchart LR
  QueueDepth["Queue depth + oldest wait time"] --> Autoscale["Worker autoscaling policy"]
  Autoscale --> G1["Generation worker 1"]
  Autoscale --> G2["Generation worker 2"]
  Autoscale --> GN["Generation worker N"]

  MaintenanceSchedule["Scheduled maintenance"] --> Lock["Distributed lease / advisory lock"]
  Lock --> Maintenance["Single active maintenance worker"]
  Maintenance --> OutboxTask["Outbox dispatch"]
  Maintenance --> StalledTask["Stalled-job reconciliation"]
  Maintenance --> TempTask["Temp asset expiry"]
  Maintenance --> OrphanTask["R2 orphan cleanup"]
  Maintenance --> LibraryTask["Library metadata sync"]

  G1 --> Metrics["Metrics + alerts"]
  G2 --> Metrics
  GN --> Metrics
  Maintenance --> Metrics
```

Generation workers may scale horizontally. Periodic maintenance must either run in a dedicated process or acquire a distributed lease so multiple replicas do not execute the same sweep concurrently.

### Implementation roadmap

| Priority | Workstream | Current state | Target outcome |
| --- | --- | --- | --- |
| P0 | Architecture truth | Local draft, cloud draft, versions, and queued jobs exist | Keep diagrams and `context.md` aligned with code |
| P1 | Asset delivery edge | Next.js proxies R2 bytes | Ownership-resolved short-lived token with direct private CDN/Worker delivery |
| P1 | Transactional outbox | DB job creation then direct BullMQ enqueue with compensation | Atomic DB command plus retryable outbox dispatch |
| P1 | Maintenance isolation | Schedulers start with each worker process | Dedicated maintenance worker or distributed lease |
| P2 | Application boundaries | Several routes and storage helpers still access DB directly | Route-only HTTP boundaries and repository-backed services |
| P2 | Job status delivery | Browser polling with retry budget | Adaptive polling, then realtime terminal notifications if measured load requires it |
| P3 | Cloud draft compaction | Revisioned full-document sync | Operation/delta cloud sync only after payload and contention benchmarks justify it |

Key system boundaries:

- Browser state is disposable; recovery comes from IndexedDB first and the revisioned cloud draft second.
- Supabase stores identity, ownership, mutable drafts, immutable versions, asset metadata, jobs, chat, credits, and future outbox rows.
- R2 stores private binaries. Redis/BullMQ transports background work and is not a business-data source of truth.
- Image generation always goes through the durable job path. Synchronous BFF calls are limited to bounded operations such as text chat and prompt enhancement.
- Workers receive `jobId`, reload trusted state, and never trust canvas payloads or URLs carried in queue messages.
- The system remains a modular monolith plus workers until measured scale requires a service split.

## Getting Started

### Requirements

- Node.js `>=20.9.0`
- npm 10.x
- Supabase project with Auth and Postgres
- OpenAI API key
- Redis for local queue/worker development
- Cloudflare R2 configuration for asset workflows

### Install

```bash
npm install
```

Create local environment files from the examples where available. At minimum, configure the Supabase public URL/anon key, server service-role key, OpenAI key, Redis, and R2 values. Never commit `.env`, `.env.local`, tokens, or service credentials.

Apply database migrations from `packages/db/sql` in the order documented in [packages/db/sql/README.md](packages/db/sql/README.md).

### Run locally

Start the full development stack:

```bash
npm run dev
```

Or run the processes separately:

```bash
npm run dev --workspace=@carver/web
npm run dev --workspace=@carver/worker
```

The worker requires a reachable Redis instance and its server-side environment variables. Image generation will remain queued if Redis or the worker is unavailable.

### Verify

```bash
npm run typecheck
npm run lint
npm run build
```

## License

TODO: Add the project license.
