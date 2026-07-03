# Carver AI Context

This file is a fast-start context pack for coding agents working in this repo.
Read this first before scanning large parts of the codebase.

## 1. Product in one minute

Carver AI is an AI landscape architect co-pilot.
It is not a generic image generator.

Core product idea:
- The canvas is the main workspace.
- Users work from real layout/context images.
- AI should preserve layout, camera angle, object positions, pond shape, house position, paths, locked areas, and spatial constraints.
- Presets and references exist to guide editing and generation, not to replace the canvas-first workflow.

Main workflow direction:
- User uploads or selects images on the canvas.
- User can connect source images and preset references to a target image.
- User chats with AI using that selected image and its linked references as context.
- User generates or refines design outputs from the selected target image.

## 2. Repo ownership

Use these boundaries:
- `apps/web`
  Frontend UI, canvas, chat panel, API routes.
- `apps/worker`
  Background job processing.
- `packages/ai`
  Prompt-building, AI-side helpers, graph-aware generation brief logic.
- `packages/db`
  DB types and Supabase-related ownership.
- `packages/queue`
  Job contracts and queue wiring.
- `packages/shared`
  Shared types, snapshot schema, generation context types.

Rule of thumb:
- UI behavior belongs in `apps/web`.
- AI orchestration and brief generation belong in `packages/ai`.
- Cross-package contracts belong in `packages/shared`.

## 3. Current canvas architecture

Main shell:
- `apps/web/app/canvas/components/core/CanvasWorkspace.tsx`
  Pure layout shell that wires left sidebar, canvas board, right chat panel, modals.

Main state hook:
- `apps/web/app/canvas/hooks/useCanvasWorkspace.ts`
  This is the center of canvas state and actions.
  It owns:
  - nodes / edges
  - active selection
  - active generation target
  - prompt text bound to selected image node
  - preset group mutations
  - generation action

Canvas board:
- `apps/web/app/canvas/components/core/CanvasBoard.tsx`
  Renders nodes/edges and interaction logic for graph-like behavior.

Node/edge helpers:
- `apps/web/app/canvas/utils/presetGroup.ts`
  Preset-group node sizing, child layout, helpers for child connections.
- `apps/web/app/canvas/utils/generationContext.ts`
  Converts canvas graph into a generation context for AI.

Important canvas types:
- `apps/web/app/canvas/types/canvas.ts`
  Defines:
  - `CanvasNode`
  - `CanvasEdge`
  - `CanvasPresetGroupNode`
  - `SelectedItem`
  - connection roles

## 4. Preset system: current mental model

The library preset flow has already been changed away from "drop preset image directly on canvas".

Current design:
- Clicking preset library items creates or updates a `presetGroup` node on the canvas.
- A preset group node is a container/folder-like node.
- Child presets appear as thumbnails inside/above that node.
- Users can connect:
  - image -> preset group
  - image -> preset child
  - image -> image

Important files:
- `apps/web/app/canvas/components/library/LibrarySidebar.tsx`
  Preset library UI, flyouts, section/slot logic, library-side selection state.
- `apps/web/app/canvas/components/core/CanvasPresetGroupNodeCard.tsx`
  Canvas rendering for preset-group nodes and child preset thumbnails.
- `apps/web/app/canvas/utils/presetGroup.ts`
  Geometry and helpers for preset child rects and anchors.

Current rule:
- Presets are reference context.
- Preset groups are not direct generation targets.

Library storage note:
- `apps/web/app/canvas/hooks/useCanvasLibrary.ts` now talks to server API routes instead of demo/localStorage data.
- Uploaded preset-library images are processed on the server and stored in Cloudflare R2 as `thumb`, `preview`, and `original` versions.
- `public.library_folders` and `public.library_assets` hold the library metadata in Supabase, including tags, category, prompt, and image URLs.
- Local `public/assets` demo images were removed; the canvas/library flow now expects cloud-backed image URLs only.
- `apps/web/app/api/library/sync/route.ts` can backfill existing R2 objects into Supabase metadata for the current user.

## 5. Generation graph model

The canvas graph now acts as a generation context system.

Important concepts:
- `activeGenerationTargetId`
  The currently selected image node that generation/chat should bind to.
- Inbound edges into that target are the source of truth for context.
- Group-level preset links and child-level preset links are distinct.

Generation context builder:
- `apps/web/app/canvas/utils/generationContext.ts`

Key exported helpers:
- `getInboundEdgesForTarget`
- `resolveConnectedImageReferences`
- `resolveConnectedPresetReferences`
- `buildCanvasGenerationContext`
- `buildCanvasSnapshotWithGraph`

Current precedence:
1. direct edit target
2. connected image references
3. explicit connected preset children
4. connected preset groups

## 6. Chat + image understanding: current state

Right panel:
- `apps/web/app/canvas/components/panels/EditorRightPanel.tsx`

This panel currently supports:
- prompt text entry
- local image attachments in the chat composer
- linked selected canvas image
- linked connected canvas/preset references
- sending those images to OpenAI as `input_image`

Important detail:
- Internal app images should be converted to `data:` URLs before being sent to OpenAI.
- Relative URLs like `/assets/...` are not safe to send directly.

Chat API route:
- `apps/web/app/api/chat/route.ts`
  Receives:
  - `content`
  - `images[]`

OpenAI server helper:
- `apps/web/lib/server/openaiChat.ts`
  Uses Responses API and currently defaults to `gpt-5-mini`.

Important implementation detail:
- Historical `assistant` messages must be replayed using `output_text`, not `input_text`.

## 7. Generation pipeline: current state

Canvas generation action lives in:
- `apps/web/app/canvas/hooks/useCanvasWorkspace.ts`
  Search for `generateConcept`.

Graph-aware generation types live in:
- `packages/shared/src/ai-jobs.ts`
- `packages/shared/src/snapshot.ts`

Graph-aware AI brief logic lives in:
- `packages/ai/src/connected-generation-brief.ts`

API side:
- `apps/web/app/api/generate/route.ts`
- `apps/web/app/api/projects/[projectId]/ai-jobs/route.ts`

Worker side:
- `apps/worker`

Current worker structure direction:
- `apps/worker/src/index.ts`
  Worker bootstrap only.
- `apps/worker/src/queue/*`
  BullMQ worker creation and lifecycle events.
- `apps/worker/src/jobs/*`
  Job routing by `jobType` and per-job handlers.
- `apps/worker/src/services/*`
  Orchestration logic such as brief/prompt preparation and status flow.
- `apps/worker/src/repositories/*`
  Persistence for `ai_jobs` and later assets/snapshots.

Current direction:
- one selected target image
- connected references resolved from the graph
- graph should be serializable/restorable via snapshot schema

## 8. Snapshot/version compatibility

Shared snapshot schema already includes graph support.

Look at:
- `packages/shared/src/snapshot.ts`

Important fields:
- `graph.nodes`
- `graph.edges`
- `graph.activeGenerationTargetId`

Backward compatibility expectation:
- old snapshots without `graph` should still open
- new snapshots should round-trip graph state

## 9. Fast file map for common tasks

If the task is about canvas layout/state:
- start with `CanvasWorkspace.tsx`
- then `useCanvasWorkspace.ts`
- then `CanvasBoard.tsx`

If the task is about preset library/flyout/grid:
- start with `LibrarySidebar.tsx`

If the task is about preset group node rendering:
- start with `CanvasPresetGroupNodeCard.tsx`
- then `presetGroup.ts`

If the task is about chat panel behavior:
- start with `EditorRightPanel.tsx`
- then `/api/chat/route.ts`
- then `apps/web/lib/server/openaiChat.ts`

If the task is about generation context or linked references:
- start with `generationContext.ts`
- then `useCanvasWorkspace.ts`
- then `packages/shared/src/ai-jobs.ts`

If the task is about generation payload / job contract:
- start with `packages/shared/src/ai-jobs.ts`
- then `apps/web/app/api/generate/route.ts`
- then `apps/web/app/api/projects/[projectId]/ai-jobs/route.ts`

If the task is about worker processing:
- start with `apps/worker/src/index.ts`
- then `apps/worker/src/queue/worker.ts`
- then `apps/worker/src/jobs/process-ai-job.ts`
- then the relevant handler/service/repository under `apps/worker/src`

## 10. Known recent changes

These behaviors were recently added and should not be accidentally removed:
- `presetGroup` node flow in canvas
- active generation target selection
- graph-aware generation context
- chat composer linked to selected canvas image
- chat composer sending local and linked images to OpenAI as image inputs
- environment preset grid using 2 columns
- preset flyout background and library panel styling refinements
- cloud-backed canvas library uploads and signed URL refresh for preset assets

## 11. Practical rules for agents

Before touching code:
- Prefer reading the files named in section 9 first.
- Do not scan unrelated packages unless the task crosses boundaries.
- Preserve snapshot compatibility.
- Do not collapse Carver AI into a generic image app UX.

When changing AI behavior:
- Keep layout preservation as the default philosophy.
- Treat preset references as context, not as the primary source image.
- Keep one clear target image unless the task explicitly expands that model.

When changing chat:
- Distinguish between text-only chat and image-aware chat.
- Do not assume OpenAI can read local app-relative URLs directly.

## 12. Update policy

If you make a meaningful architecture or workflow change, update this file.
This file is meant to reduce token waste and onboarding time for future agents.
