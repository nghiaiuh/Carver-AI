# Carver AI Operating Guide

Carver AI is a solo-user MVP for AI landscape design: users create a project, upload yard/reference images, chat with an AI agent, and save generated or refined concepts on an infinite canvas.

## Fast Startup

Read `context.md` at the repo root before doing broad exploration.

It summarizes:
- the current product direction
- package ownership
- preset-group and graph context architecture
- chat image-input flow
- the shortest file-reading path for common tasks

## Architecture
- Monorepo: npm workspaces with Turborepo.
- Web/API: `apps/web` with Next.js App Router, Tailwind, and server route handlers.
- AI core: `packages/ai` with LangGraph state, router, and future generation/refinement nodes.
- Database: `packages/db` with Supabase clients, generated-style TypeScript types, and SQL migrations.
- Queue: `packages/queue` and `apps/worker` for long-running AI/image jobs.

Current implementation notes:
- The canvas now includes graph-like nodes and edges for image/preset context.
- Presets are represented on the canvas through `presetGroup` nodes.
- Chat can send selected canvas images and local attachments to OpenAI as image inputs.
- Shared snapshot contracts already include graph state.

## Security Rules
- Supabase Auth is the identity source. Do not create a parallel user table.
- The browser may only use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` belongs only in server routes and workers. Import it from `@carver/db/server`, never from browser code.
- All user-owned tables must have RLS enabled before production use.
- Do not log prompts, uploaded image URLs, storage paths with signed tokens, job payloads, access tokens, refresh tokens, or service-role keys.
- API routes must check the authenticated user before reading or mutating project data.

## Database Rules
- Supabase is the source of truth for the MVP.
- Canvas state is persisted as versioned rows in `canvas_snapshots`.
- Active realtime collaboration can be added later with Liveblocks/tldraw, but Supabase snapshots remain canonical.
- SQL schema and RLS policies live in `packages/db/sql`.
- After applying SQL to Supabase, regenerate `packages/db/src/types.ts` from the real project when available.

## Environment
Use one local `.env` file only. It is intentionally ignored by git.

Required server/client variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional infrastructure variables:
- `DATABASE_URL`
- `DIRECT_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_USERNAME`
- `REDIS_PASSWORD`

## Development Commands
- `npm run dev`: run all dev tasks through Turbo.
- `npm run build`: build all packages/apps.
- `npm run typecheck`: run TypeScript checks for all packages/apps.
- `npm run lint`: run lint/static checks for all packages/apps.

## Implementation Notes
- Keep TypeScript strict. Avoid `any`; prefer typed JSON aliases or narrow interfaces.
- Server Components are the default in Next.js. Use `"use client"` only for interactive canvas/account UI.
- API routes belong in `apps/web/app/api`.
- Shared DB access belongs in `packages/db`.
- AI state and routing changes belong in `packages/ai/src`.
- Long-running image generation/refinement belongs in the worker, not the request path.

High-value files for most tasks:
- `apps/web/app/canvas/hooks/useCanvasWorkspace.ts`
- `apps/web/app/canvas/components/core/CanvasWorkspace.tsx`
- `apps/web/app/canvas/components/core/CanvasBoard.tsx`
- `apps/web/app/canvas/components/library/LibrarySidebar.tsx`
- `apps/web/app/canvas/components/panels/EditorRightPanel.tsx`
- `apps/web/lib/server/openaiChat.ts`
