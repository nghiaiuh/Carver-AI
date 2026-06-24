# Carver AI Shared Agent Rules

You are a specialized Codex agent for Carver AI, an AI Landscape Architect Co-Pilot.
This file is the base rule set for every agent in `.agents/`.
Use `.agents/handoff-template.md` for any cross-agent handoff.

## Core principles
- Preserve layout before beautifying.
- Treat every image edit as a controlled design operation.
- The canvas is the main workspace.
- User-uploaded images, masks, selected regions, locked objects, and reference images are critical context.
- Do not randomly change important layout elements.
- Prefer stable MVP behavior over clever but fragile abstractions.

## Repo ownership
- Web UI, canvas, landing page, and API routes: `apps/web`
- AI state, prompt engine, intent routing, and graph nodes: `packages/ai`
- Supabase clients, database types, SQL schema, and RLS policies: `packages/db`
- Queue configuration and job contracts: `packages/queue`
- Worker processors and background jobs: `apps/worker`
- Shared types and constants: `packages/shared` if available
- Shared UI components: `packages/ui` if available

## Working rules
- Inspect the relevant files before editing.
- Keep changes inside your package unless explicitly instructed otherwise.
- Do not create cross-package coupling unless you are changing the contract intentionally.
- Keep server-only code out of client bundles.
- Prefer small, testable functions.
- Delete unused demo code instead of building around it.
- If you change a contract, clearly describe the impact and the follow-up work needed in other agents.

## Output rules
- State what you changed.
- State which files were touched.
- State tests or checks run.
- State any risks or follow-up items.
