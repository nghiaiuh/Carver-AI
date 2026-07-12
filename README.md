# Carver AI

Carver AI is an AI landscape design co-pilot for landscape engineers, garden studios, designers, and homeowners. It turns site photos, sketches, references, and natural-language instructions into controlled garden concepts while preserving important layout constraints such as camera angle, house and pond position, paths, materials, and locked areas.

The main product experience is a canvas-first editor: the canvas is the workspace, and AI supports the design process through chat, references, region edits, and queued image generation.

## Architecture

Carver AI uses a **Local-first AI canvas editor with a Next.js BFF, shared domain contracts, private asset gateway, and queue-driven AI worker processing.**

```mermaid
flowchart LR
  User((User))

  subgraph Browser["Browser / Local-first"]
    CanvasUI["Canvas Workspace UI"]
    LocalState["Working Canvas State<br/>nodes / edges / selection / prompt"]
    UndoRedo["Undo / Redo<br/>memory only"]
    LocalDraft["IndexedDB Local Draft<br/>TTL 7 days"]
    RuntimeUrls["Runtime Asset URL Cache<br/>imageUrl expires / refresh"]
    JobPolling["AI Job Polling"]
  end

  subgraph Web["Next.js Web App - BFF / API Layer"]
    ApiRoutes["API Routes<br/>HTTP boundary only"]
    Authz["Auth + Ownership Guards"]
    AppServices["Application Services<br/>snapshotService<br/>aiJobService<br/>assetService<br/>chatService"]
    AssetGateway["Private Asset Gateway<br/>assetId -> runtime URL/content"]
  end

  subgraph Packages["Shared Packages / Adapters"]
    Shared["@carver/shared<br/>snapshot / job / asset contracts"]
    AI["@carver/ai<br/>prompt engine / generation brief"]
    DB["@carver/db<br/>Supabase repositories / helpers / types"]
    Queue["@carver/queue<br/>BullMQ queue client / contracts"]
    Storage["@carver/storage<br/>R2 helpers / path builders"]
  end

  subgraph Worker["Worker Process"]
    WorkerApp["apps/worker"]
    JobProcessor["AI Job Processor<br/>load job by jobId"]
    ImageResolver["Image Source Resolver<br/>assetId -> DB metadata -> R2 bytes"]
    Provider["Provider Adapter<br/>OpenAI image-aware generation"]
    OutputPersist["Persist Output<br/>asset metadata + job result"]
  end

  subgraph Infra["Infrastructure"]
    Supabase[("Supabase Postgres / Auth / RLS<br/>projects, snapshots, assets, jobs, chat")]
    Redis[("Redis / BullMQ<br/>durable job queue")]
    R2[("Cloudflare R2<br/>private binary object storage")]
    OpenAI[("OpenAI Providers<br/>chat / prompt / image")]
  end

  User --> CanvasUI
  CanvasUI --> LocalState
  CanvasUI --> UndoRedo
  CanvasUI --> LocalDraft
  CanvasUI --> RuntimeUrls
  CanvasUI --> ApiRoutes
  JobPolling --> ApiRoutes
  ApiRoutes --> Authz
  Authz --> AppServices
  AppServices --> Shared
  AppServices --> AI
  AppServices --> DB
  AppServices --> Queue
  AppServices --> Storage
  AppServices --> AssetGateway
  AssetGateway --> DB
  AssetGateway --> Storage
  WorkerApp --> JobProcessor
  Redis --> WorkerApp
  JobProcessor --> Shared
  JobProcessor --> AI
  JobProcessor --> DB
  JobProcessor --> Queue
  JobProcessor --> Storage
  JobProcessor --> ImageResolver
  ImageResolver --> DB
  ImageResolver --> Storage
  ImageResolver --> Provider
  Provider --> OpenAI
  Provider --> OutputPersist
  OutputPersist --> DB
  OutputPersist --> Storage
  DB --> Supabase
  Queue --> Redis
  Storage --> R2
```

Key boundaries:

- The browser owns working canvas state, in-memory undo/redo, IndexedDB local drafts, and runtime image URL caching.
- Next.js is the BFF: routes authenticate and validate requests, then delegate business logic to application services.
- Supabase stores metadata, ownership, snapshots, jobs, and chat records. Cloudflare R2 stores private binary assets.
- Redis/BullMQ is only the AI job queue. The worker receives a `jobId`, loads trusted data from Supabase, and persists results back to Supabase/R2.
- Canvas and chat persist stable `assetId` references. Asset URLs are short-lived runtime delivery URLs and are never the source of truth.
- Database snapshots are reserved for manual versions, best-effort close versions, and AI job checkpoints. Unsaved editing work stays in the browser draft.

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
