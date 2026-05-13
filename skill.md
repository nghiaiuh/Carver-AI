---
name: carver-ai-development
description: Work on the Carver AI codebase, an AI landscape design canvas app using Next.js, Supabase, LangGraph, BullMQ, and Turborepo. Use for security reviews, Supabase schema/RLS work, canvas chat APIs, AI routing, project cleanup, and infrastructure guidance.
---

# Carver AI Development

## Mission
Build a Lovart-style AI landscape design workspace: authenticated users create projects, upload yard/reference images, chat with an AI agent, generate/refine concepts, and persist canvas snapshots in Supabase.

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
- Browser code imports only anon Supabase clients.
- Server routes and workers import service-role helpers only from `@carver/db/server`.
- Do not log raw prompts, private asset URLs, signed URLs, full job payloads, or tokens.
- Every user-owned table must be protected by RLS.
- Profile rows must include `plan_type` and `credits_amount`.
- Use one local `.env` file; do not create `.env.example`.

## Canvas Chat MVP
- `projects` owns user projects and points to the latest snapshot.
- `canvas_snapshots` stores versioned canvas JSON.
- `chat_threads` and `chat_messages` store the conversation.
- `assets` stores uploaded, generated, reference, and exported files.
- `ai_jobs` tracks generate/refine/analyze/export work.
- `landscape_briefs` stores property and style requirements for landscape design.
