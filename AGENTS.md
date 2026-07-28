# Carver AI Agent Instructions

## Identity Check

When responding to the user after completing a task, always address or refer to the user as **Nghĩa IT**.

This is a context-check marker to confirm the agent has read and followed this file.
Example:

```md
Done, Nghĩa IT.
```

## Project Overview

Carver AI is an AI Landscape Architect Co-Pilot for landscape and garden design.

## Fast Startup

Before scanning the repo broadly, read `context.md` at the repository root.

Use it to quickly understand:

* package ownership
* canvas architecture
* preset-group workflow
* generation graph context
* chat image-input flow
* the most relevant files for each type of task

The product is not a generic image generator. Its core value is helping users design and edit landscape concepts while preserving real-world layout constraints such as object position, scale, camera angle, pond shape, house placement, garden paths, and locked design areas.

Primary users:

* Landscape engineers.
* Garden and architecture studios.
* Homeowners or normal users who want to design their own garden.
* Internal project/team workflow users.

## Core Product Principles

1. Preserve layout before beautifying.
2. Treat every image edit as a controlled design operation.
3. The canvas is the main workspace.
4. The AI assistant supports the canvas, not the other way around.
5. User-uploaded images, reference images, masks, selected regions, and locked objects must be treated as important context.
6. Do not let AI generation randomly change important layout elements.
7. Prefer stable MVP behavior over clever but fragile abstractions.

## Main Product Concepts

### Canvas-first Workflow

The user should be able to:

* Create a project.
* Upload or paste sources images.
* Select objects or regions on the canvas.
* Chat with AI using canvas context.
* Generate or refine landscape concepts.
* Save versioned canvas snapshots.
* Compare design versions.
* Export results.

Canvas state must be serializable, restorable, and versionable.

Current implemented direction:

* Selected canvas images can act as the active generation/chat target.
* Preset library items create or update `presetGroup` nodes on the canvas.
* Connection lines between images and preset references are used as generation context.
* Chat now supports image-aware input through the OpenAI Responses API path.
* Shared snapshot types include graph state and active generation target support.

### Spatial Lock System

Spatial Lock is a key Carver AI feature.

The system should allow the user to preserve or lock:

* House position.
* Koi pond shape and location.
* Rockery waterfall / hòn non bộ position.
* Pavilion / gazebo position.
* Driveway and walking paths.
* Courtyard paving.
* Gate, walls, fences, and boundary lines.
* Existing trees or planting zones.
* Camera angle and perspective.
* Object scale, elevation, and proportions.

When AI edits an image, it must distinguish clearly between:

* Editable area.
* Preserved area.
* Locked object.
* Reference image.
* Style instruction.
* Replacement instruction.

### Prompt Engine

The prompt engine turns rough user instructions into structured AI-ready prompts.

It should support:

* Intent detection.
* Canvas context collection.
* Selected region/object context.
* Preservation rules.
* Reference image roles.
* Style and material instructions.
* Planting instructions.
* Negative constraints.
* Output quality requirements.

The prompt engine should clarify and protect design constraints without over-filtering user creativity.

## Repository Ownership

Use these package boundaries:

* Web UI, canvas, landing page, and API routes: `apps/web`.
* AI state, prompt engine, intent routing, and graph nodes: `packages/ai`.
* Supabase clients, database types, SQL schema, and RLS policies: `packages/db`.
* Queue configuration and job contracts: `packages/queue`.
* Worker processors and background jobs: `apps/worker`.
* Shared types and constants: `packages/shared` if available.
* Shared UI components: `packages/ui` if available.

Keep changes inside the package that owns the behavior.

## Development Workflow

Before editing:

1. Read `context.md` first unless the task is extremely small.
2. Inspect the relevant files and package.
3. Understand the current product behavior.
4. Check whether the code is demo-only or production-intended.
5. Avoid changing unrelated packages.
6. Avoid large rewrites unless the task clearly requires it.

While editing:

1. Keep canvas data compatible with existing snapshots.
2. Keep server-only code out of client bundles.
3. Keep database logic out of React UI components when possible.
4. Keep AI orchestration logic out of UI components.
5. Prefer small, testable functions.
6. Delete unused demo code instead of building around it.
7. Use clear names instead of overly clever abstractions.

Before handoff, run when feasible:

```bash
npm run build
npm run typecheck
npm run lint
```

If a command cannot be run, mention it clearly in the final response.

## Frontend Guidelines

Canvas features may include:

* Image upload.
* Image paste from clipboard.
* Image-to-image connection lines.
* Pan.
* Zoom.
* Zoom to cursor.
* Object selection.
* Region selection or masking.
* Move and resize objects.
* Toolbar actions.
* Chat/context panel.
* Version preview.

Canvas rules:

* Do not break image aspect ratio.
* Do not stretch or blur canvas images.
* Preserve zoom and pan predictability.
* Keep object metadata serializable.
* Do not hardcode demo images as production data.
* Pasted images should have sensible fallback metadata such as `Pasted Image`.

UI direction:

* Clean, bright, modern interface.
* White or soft neutral background.
* Canvas-first layout.
* Lightweight floating toolbar.
* Clear panels.
* Minimal visual clutter.
* Professional design-tool feeling.

Avoid:

* Heavy dashboard clutter.
* Demo placeholder flows in production.
* Hidden important actions.
* UI that covers too much of the canvas.

## AI and Landscape Domain Guidelines

Carver AI should understand common landscape concepts such as:

* Vietnamese koi garden.
* Koi pond / hồ koi.
* Rockery waterfall / hòn non bộ.
* Bonsai.
* Tùng la hán / podocarpus.
* Vạn niên tùng.
* Mai chiếu thủy.
* Sung cảnh / ficus bonsai.
* Trúc quân tử / slender bamboo.
* Cau / areca palm.
* Cau đỏ / areca palm with red fruit.
* Dương xỉ / fern.
* Tropical shrubs.
* Gray grid courtyard paving.
* Traditional Vietnamese wooden house.
* Hexagonal pavilion / gazebo.
* Vietnamese, Korean, Japanese, Chinese, and tropical garden styles.

When building prompts for image generation or image editing, prefer this structure:

```md
Use Image A as the direct edit target.
Use Image B as the reference image.

MAIN GOAL
...

STRICT EDITING RULE
...

PRESERVE EXACTLY
...

CHANGE ONLY
...

STYLE / MATERIAL / PLANTING REQUIREMENTS
...

AVOID
...
```

Common preservation rules:

* Preserve original camera angle.
* Preserve original perspective.
* Preserve master layout.
* Preserve house position.
* Preserve pond shape and location.
* Preserve rockery position.
* Preserve pavilion/gazebo position.
* Preserve bridge position.
* Preserve driveway.
* Preserve courtyard.
* Preserve wall and fence positions.
* Preserve lawn island shapes.
* Preserve stepping stone path.
* Preserve object scale and proportions.

## Current Architecture Notes

Important current implementation details:

* `apps/web/app/canvas/hooks/useCanvasWorkspace.ts` is the center of canvas state and actions.
* `apps/web/app/canvas/utils/generationContext.ts` builds graph-aware generation context.
* `apps/web/app/canvas/components/library/LibrarySidebar.tsx` owns preset library and preset flyout UI.
* `apps/web/app/canvas/components/panels/EditorRightPanel.tsx` owns chat composer behavior, including linked canvas image context.
* `apps/web/lib/server/openaiChat.ts` and `apps/web/app/api/chat/route.ts` own OpenAI chat integration.

## Backend Guidelines

API routes must:

* Authenticate the user.
* Verify project ownership.
* Validate payloads.
* Never trust `user_id`, `owner_id`, or `project_id` from the client without checking ownership.
* Use Supabase server helpers for server-side access.
* Avoid running long AI work directly inside request/response routes when queue/worker is more appropriate.

AI jobs should be used for:

* Image generation.
* Image refinement.
* Image analysis.
* Complex prompt building.
* Export jobs.
* Multi-step design workflows.

AI job records should track:

* Job type.
* User ID.
* Project ID.
* Input snapshot ID if available.
* Input assets.
* Prompt or prompt reference.
* Status.
* Error message if failed.
* Output asset IDs.
* Output snapshot ID if available.

## Security Checklist

* Supabase Auth is the identity source.
* Do not create a parallel user identity system.
* Browser code must only use anon Supabase clients.
* Service-role access must stay server-side or worker-side only.
* API routes must check authenticated user before reading or mutating project data.
* Do not log access tokens, refresh tokens, service-role keys, signed URLs, private storage paths, sensitive prompts, or job payloads.
* Every user-owned table must have RLS enabled before production.
* Storage should be private by default.
* Signed URLs should be generated only when needed and should expire quickly.
* Validate uploaded file type and file size.
* Prevent cross-user access to projects, assets, chat messages, snapshots, jobs, and exports.

## Data Model Guide

Important MVP tables may include:

* `profiles`
* `projects`
* `landscape_briefs`
* `canvas_snapshots`
* `assets`
* `chat_threads`
* `chat_messages`
* `ai_jobs`
* `design_versions`
* `exports`
* `spatial_locks`
* `prompt_templates`

Recommended storage buckets:

* `project-uploads`
* `generated-assets`
* `exports`
* `temp-processing`

Storage rules:

* Store stable storage paths, not long-lived signed URLs.
* Generate signed URLs only when reading.
* Connect every asset to project ownership.
* Never expose another user's asset path.

## Handoff Format

When finishing a coding task, respond with:

1. Summary of changes.
2. Files changed.
3. How to test manually.
4. Commands run.
5. Commands not run.
6. Known risks or follow-up tasks.
7. Suggested commit content.

For tasks that changed files, always include a concise commit section at the end of the response. Include the exact `git add ...` commands for the files changed by the task and a recommended `git commit -m "..."` message. If the work contains unrelated goals, split the commit suggestions into multiple small commits. Do not say a commit was created unless `git commit` was actually run.

Always remember the identity check marker:

```md
Done, Nghĩa IT.
```
