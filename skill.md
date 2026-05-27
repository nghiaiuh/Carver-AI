---
name: carver-ai-development
description: Work on the Carver AI codebase, a solo-user AI landscape design canvas app using Next.js App Router, Supabase, LangGraph, and Turborepo. Use for security reviews, Supabase schema/RLS work, canvas chat APIs, AI routing, and queue/worker guidance.
---

# Carver AI Development

## Mission

Build the Carver AI MVP: authenticated users create projects, upload yard/reference images, chat with an AI agent, generate/refine concepts, and persist versioned canvas snapshots in Supabase.

## Workflow

1. Inspect the relevant package before editing.
2. Keep changes inside the package boundary that owns the behavior.
3. Prefer Supabase-first data access for MVP persistence.
4. Keep AI jobs asynchronous when generation/refinement may run longer than a request.
5. Run `npm run build`, `npm run typecheck`, and `npm run lint` before handoff when feasible.

## File Ownership

- Web UI and API routes: `apps/web`.
- AI state, intent routing, and graph nodes: `packages/ai`.
- Supabase clients, DB types, SQL schema, and RLS policies: `packages/db`.
- Queue configuration and job contracts: `packages/queue`.
- Worker processors and background job execution: `apps/worker`.

## Security Checklist

- Supabase Auth is the identity source; do not create a parallel user table.
- Browser code uses only anon Supabase clients with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Server routes and workers import service-role helpers only from `@carver/db/server`.
- API routes must check the authenticated user before reading or mutating project data.
- Do not log prompts, uploaded image URLs, storage paths with signed tokens, job payloads, access tokens, refresh tokens, or service-role keys.
- Every user-owned table must have RLS enabled before production use.

## Data Model (MVP)

- `profiles` (plan type, credits, onboarding state).
- `projects` (owner, status, current snapshot).
- `landscape_briefs` (project requirements).
- `canvas_snapshots` (versioned canvas JSON).
- `assets` (uploads, generated, reference, exports).
- `chat_threads` and `chat_messages` (conversation history).
- `ai_jobs` (generate/refine/analyze/export work).
- `design_versions` (source and output snapshots).
- `exports` (export records).

## Storage Buckets

- `project-uploads` (user uploads).
- `generated-assets` (AI outputs).
- `exports` (exported files).
