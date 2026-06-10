---

name: carver-ai-development
description: Work on the Carver AI codebase, an AI Landscape Architect Co-Pilot for landscape/garden design. Use for Next.js App Router, Supabase, LangGraph, Turborepo, canvas UI, AI prompt engine, spatial locking, image/reference workflows, AI job routing, queue/worker guidance, security reviews, schema/RLS work, and product-level implementation planning.
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# Carver AI Development

## Mission

Build Carver AI as an AI Landscape Architect Co-Pilot that helps engineers, studios, and normal users design gardens and landscapes faster while preserving real-world layout constraints.

The MVP should let authenticated users create projects, upload site images or reference images, work on a visual canvas, chat with an AI assistant, generate or refine landscape concepts, lock important spatial elements, and persist versioned canvas snapshots in Supabase.

Carver AI must not behave like a generic image generator only. Its core value is controlled landscape design: keeping object positions, proportions, layout logic, camera angle, and user-defined constraints stable while AI improves the design.

## Product Principles

1. Preserve layout before beautifying.
2. Treat every image edit as a design operation with constraints.
3. Make AI useful for landscape workflows, not just visual generation.
4. Keep the canvas simple, direct, and engineer-friendly.
5. Let users combine sketches, site photos, reference images, and prompts into one controlled workflow.
6. Prioritize MVP reliability over over-engineered architecture.
7. Prefer clear product behavior over clever demo code.

## Core Product Concepts

### 1. Spatial Lock System

The Spatial Lock System is one of Carver AI's most important features.

Users should be able to lock or preserve key design elements such as:

* House position.
* Koi pond shape and location.
* Rockery waterfall position.
* Pavilion / gazebo position.
* Driveway and walking paths.
* Courtyard paving.
* Gate, walls, fences, and boundary lines.
* Existing trees or planting zones.
* Camera angle and perspective.
* Object scale, elevation, and proportions.

When a user asks AI to redesign an area, the system should clearly distinguish between:

* Objects that can change.
* Objects that must stay fixed.
* Areas selected for editing.
* Reference images used for style or replacement.

### 2. Canvas-first Workflow

The canvas is the main working surface of Carver AI.

Users should be able to:

* Upload or paste images.
* Add reference images.
* Click/select objects or regions.
* Mark areas for editing.
* Chat with AI while context is attached to the canvas.
* Generate design alternatives.
* Compare versions.
* Save snapshots.
* Export final results.

Canvas interactions should feel closer to a design tool than a chatbot.

### 3. Prompt Engine

The prompt engine should help transform rough user instructions into clear AI-ready prompts.

It should support:

* User intent detection.
* Region-specific editing.
* Layout preservation instructions.
* Reference image interpretation.
* Style constraints.
* Negative constraints.
* Output quality instructions.
* Multi-step prompt building.

The prompt engine should not over-filter user creativity. It should clarify, structure, and protect constraints without making the model less flexible or less intelligent.

### 4. AI Assistant Behavior

The AI assistant should help users with:

* Landscape concept generation.
* Plant recommendations.
* Garden style exploration.
* Material suggestions.
* Prompt refinement.
* Image edit planning.
* Layout-safe redesign instructions.
* Engineering/design reasoning.

The assistant should understand that Carver AI is especially focused on Vietnamese, Korean, Japanese, Chinese, and tropical garden workflows, including koi ponds, rockery waterfalls, bonsai, bamboo, areca palms, pavilions, courtyards, and refined residential landscapes.

### 5. Versioned Design Workflow

Every meaningful AI action should be traceable.

The app should support:

* Canvas snapshots.
* Design versions.
* Source image tracking.
* Reference image tracking.
* Prompt history.
* AI job status.
* Output asset records.
* Undo/redo or version restore later.

## Workflow

1. Inspect the relevant package before editing.
2. Understand the product behavior before changing code.
3. Keep changes inside the package boundary that owns the behavior.
4. Remove demo-only code before implementing production behavior.
5. Prefer Supabase-first data access for MVP persistence.
6. Keep AI jobs asynchronous when generation, refinement, analysis, or export may run longer than a request.
7. Keep canvas state serializable and versionable.
8. Avoid hidden state that cannot be restored from a saved project.
9. Run `npm run build`, `npm run typecheck`, and `npm run lint` before handoff when feasible.
10. When unable to run checks, clearly mention what was not verified.

## File Ownership

* Web UI, canvas, landing page, and API routes: `apps/web`.
* AI state, prompt engine, intent routing, and graph nodes: `packages/ai`.
* Supabase clients, DB types, SQL schema, and RLS policies: `packages/db`.
* Queue configuration and job contracts: `packages/queue`.
* Worker processors and background job execution: `apps/worker`.
* Shared types, constants, and product contracts: `packages/shared` if available.
* UI primitives and reusable components: `packages/ui` if available.

## Frontend Guidelines

### Canvas UI

The canvas should support:

* Image upload.
* Image paste from clipboard.
* Drag/move canvas objects.
* Zoom to cursor.
* Pan.
* Object selection.
* Region selection or masking.
* Reference image attachment.
* Chat/context panel.
* Version preview.
* Toolbar actions.

When implementing canvas features:

* Keep zoom and pan behavior predictable.
* Preserve cursor-centered zoom where applicable.
* Avoid breaking image aspect ratio.
* Avoid blurry or stretched canvas assets.
* Keep canvas object data serializable.
* Store enough metadata to restore the canvas later.
* Do not hardcode demo images as production data.
* Pasted images should have sensible fallback metadata such as `Pasted Image` and empty prompt/model fields.

### UI/UX Direction

Carver AI should feel modern, clean, bright, and professional.

Preferred UI direction:

* White or soft neutral interface.
* Clear canvas workspace.
* Floating toolbar where useful.
* Lightweight panels.
* Strong visual hierarchy.
* Minimal clutter.
* Product feel closer to Lovart / Vizmaker style, but focused on landscape design.

Avoid:

* Overloaded dashboard UI.
* Dark, confusing canvas controls.
* Demo-only placeholder flows.
* UI that hides the main image/design.
* Excessive decorative effects that hurt usability.

## AI / Prompt Guidelines

### Prompt Generation

When creating or improving prompts, include:

* Direct edit target.
* Reference image roles.
* Main goal.
* Strict editing rules.
* Preserve list.
* Editable region.
* Style direction.
* Material and planting requirements.
* Camera/perspective constraints.
* Negative constraints.
* Output quality requirements.

Example structure:

```md
Use Image A as the direct edit target.
Use Image B as the architectural or landscape reference.

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

### Common Landscape Constraints

The AI should frequently preserve:

* Original camera angle.
* Original perspective.
* Master layout.
* House positions.
* Pond shape.
* Rockery position.
* Pavilion/gazebo position.
* Bridge position.
* Driveway.
* Courtyard.
* Walls and fences.
* Lawn island shapes.
* Stepping stone path.
* Existing object scale.
* Lighting direction when requested.

### Common Landscape Features

Carver AI should understand these common elements:

* Vietnamese koi garden.
* Rockery waterfall / hòn non bộ.
* Koi pond.
* Bonsai.
* Tùng la hán / podocarpus.
* Vạn niên tùng.
* Mai chiếu thủy.
* Sung cảnh / ficus bonsai.
* Trúc quân tử / slender bamboo.
* Cau / areca palm.
* Cau đỏ / areca palm with red fruit.
* Fern clusters.
* Spider plants.
* Tropical shrubs.
* Courtyard paving.
* Gray grid square tiles.
* Wooden pavilion.
* Hexagonal gazebo.
* Traditional Vietnamese house.
* Korean / Japanese / Chinese garden influence.

## Backend Guidelines

### API Routes

API routes must:

* Authenticate the user.
* Check project ownership.
* Validate payloads.
* Avoid trusting client-supplied owner IDs.
* Use server-side Supabase helpers.
* Return clear errors.
* Keep long AI work out of request/response when needed.

### AI Jobs

Use background jobs for:

* Image generation.
* Image refinement.
* Image analysis.
* Export rendering.
* Multi-step design generation.
* Expensive prompt analysis.

AI jobs should store:

* Job type.
* User ID.
* Project ID.
* Input snapshot ID when available.
* Input assets.
* Prompt or prompt reference.
* Status.
* Error message if failed.
* Output asset IDs.
* Output snapshot ID when applicable.

Do not log sensitive prompt payloads or signed URLs.

## Security Checklist

* Supabase Auth is the identity source.
* Do not create a parallel user identity system.
* Browser code uses only anon Supabase clients with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
* Server routes and workers import service-role helpers only from `@carver/db/server`.
* API routes must check the authenticated user before reading or mutating project data.
* Never trust `user_id`, `owner_id`, or `project_id` from the client without verifying ownership.
* Do not log prompts, uploaded image URLs, storage paths with signed tokens, job payloads, access tokens, refresh tokens, or service-role keys.
* Every user-owned table must have RLS enabled before production use.
* Storage access should be private by default.
* Use signed URLs only when needed and keep expiry short.
* Keep service role keys out of browser bundles.
* Validate uploaded file type and size.
* Prevent cross-user access to projects, assets, chat messages, snapshots, and exports.

## Data Model: MVP

Recommended MVP tables:

* `profiles`

  * User profile, plan type, credits, onboarding state.

* `projects`

  * Project owner, title, status, current snapshot, metadata.

* `landscape_briefs`

  * Site/design requirements, style goals, constraints, user notes.

* `canvas_snapshots`

  * Versioned canvas JSON, camera state, object state, lock state.

* `canvas_objects`

  * Optional normalized canvas object records if snapshots become too large.

* `assets`

  * User uploads, pasted images, generated outputs, reference images, exports.

* `chat_threads`

  * Project-level conversations.

* `chat_messages`

  * User and assistant messages, attached context, asset references.

* `ai_jobs`

  * Generate, refine, analyze, prompt-build, export, and background work.

* `design_versions`

  * Source snapshots, output snapshots, prompt references, AI result metadata.

* `exports`

  * Export records, file paths, format, status.

* `spatial_locks`

  * Optional table for locked regions, objects, masks, and preservation constraints.

* `prompt_templates`

  * Optional table for reusable prompt structures.

## Storage Buckets

Recommended buckets:

* `project-uploads`

  * User uploaded site images and references.

* `generated-assets`

  * AI-generated or AI-refined outputs.

* `exports`

  * Exported images, PDFs, or design files.

* `temp-processing`

  * Optional short-lived files used by workers.

Storage rules:

* Keep project assets private by default.
* Store stable storage paths, not signed URLs.
* Generate signed URLs only at read time.
* Keep asset ownership connected to project ownership.
* Never expose another user's asset path.

## LangGraph / AI Architecture

Use LangGraph or equivalent orchestration for multi-step AI flows such as:

1. Parse user intent.
2. Identify target canvas region or selected object.
3. Determine preservation constraints.
4. Attach project context and reference images.
5. Build final prompt.
6. Route to correct model/provider.
7. Create async job if needed.
8. Store output asset.
9. Create new design version.
10. Update current canvas snapshot if user accepts result.

Keep graph nodes small and testable.

Potential nodes:

* `intentClassifier`
* `contextCollector`
* `spatialConstraintBuilder`
* `referenceImageInterpreter`
* `promptBuilder`
* `modelRouter`
* `jobCreator`
* `resultPersister`
* `versionCreator`

## MVP Implementation Priority

### Phase 1: Clean Production Foundation

* Remove demo-only code.
* Stabilize project structure.
* Confirm Supabase auth.
* Confirm project CRUD.
* Confirm image upload/paste.
* Confirm canvas image rendering.
* Confirm snapshot saving.
* Confirm lint/type/build health.

### Phase 2: Canvas Editing Core

* Pan and zoom.
* Zoom to cursor.
* Object selection.
* Image move/resize.
* Canvas object metadata.
* Versioned snapshots.
* Basic toolbar.
* Chat panel connected to project context.

### Phase 3: Prompt Engine MVP

* User instruction input.
* Prompt clarification/structuring.
* Preserve-list generation.
* Reference image role handling.
* Region/object context.
* Prompt preview or hidden prompt build.
* Save prompt with chat/design version.

### Phase 4: AI Job Pipeline

* Create AI job from canvas/chat action.
* Queue long-running jobs.
* Worker executes provider call.
* Store generated output.
* Attach result to project.
* Create design version.
* Show status in UI.

### Phase 5: Spatial Lock MVP

* Allow user to mark locked objects/regions.
* Store lock metadata.
* Include locks in prompt generation.
* Show lock indicators in canvas.
* Prevent accidental edits to locked objects.

### Phase 6: Product Polish

* Better landing page.
* Better project dashboard.
* Export flow.
* Version comparison.
* More landscape-specific templates.
* Better onboarding for engineers and normal users.

## Coding Standards

* Prefer TypeScript strictness.
* Avoid large untyped objects for core canvas data.
* Use shared types for project, asset, snapshot, AI job, and canvas object contracts.
* Keep UI components small and composable.
* Avoid mixing AI logic directly inside React components.
* Avoid mixing database logic directly inside UI components.
* Keep server-only code out of client bundles.
* Use clear names over clever abstractions.
* Delete unused demo code instead of working around it.
* Add comments only when they explain product logic or non-obvious constraints.

## Handoff Checklist

Before handoff, provide:

* What changed.
* Files changed.
* How to test manually.
* Commands run.
* Commands not run.
* Any known risks.
* Any follow-up tasks.

Run when feasible:

```bash
npm run build
npm run typecheck
npm run lint
```

If the repo uses package-level commands, run the closest relevant package checks instead.

## Commit Message Style

Use short, clear commit messages.

Examples:

```bash
feat: add zoom to cursor on canvas
feat: add spatial lock metadata
feat: connect canvas prompt engine
fix: prevent canvas image distortion
fix: preserve pasted image aspect ratio
fix: secure project asset access
refactor: remove demo canvas data
chore: clean up prompt engine scaffolding
```
