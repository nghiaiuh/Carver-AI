# Carver AI Project Instructions

This file provides system instructions and context for Claude when working on the **Carver AI** project. 

## Project Architecture
- **Type**: Monorepo managed by Turborepo and npm workspaces.
- **Frontend/API**: `apps/web` (Next.js 14 App Router, Tailwind, tldraw, Liveblocks).
- **Background Worker**: `apps/worker` (BullMQ, Redis, Node.js).
- **AI Core**: `packages/ai` (LangGraph agent, state schema, intent router).
- **Database**: `packages/db` (PostgreSQL, Prisma).
- **Shared Queue Logic**: `packages/queue` (BullMQ jobs, types).

## Tech Stack Rules
1. **TypeScript**: Strictly typed. No `any` without explicit justification.
2. **Next.js**: Use Server Components where possible. Use `"use client"` only for files that need browser APIs or React hooks (like tldraw canvas).
3. **Database**: All Prisma models must go into `packages/db/prisma/schema.prisma`. 
4. **AI Orchestration**: Follow LangGraph node structures. Input and Output states must match `CarverState` in `packages/ai/src/state.ts`.
5. **Realtime**: Canvas operations should use `Liveblocks` for synchronizing state to multiple users.

## Common Tasks & Where They Go
- **UI/Components**: `apps/web/components/`
- **API Endpoints**: `apps/web/app/api/`
- **Adding AI Intent**: `packages/ai/src/nodes/` and update `packages/ai/src/graph.ts`
- **Updating Database**: `packages/db/prisma/schema.prisma` -> then run `npx prisma db push`
- **Long-running Tasks**: `apps/worker/src/processors/`

## Style Guidelines
- Use modern ES6+ syntax.
- Write modular, testable code.
- Provide inline documentation for complex logic (e.g., LangGraph routing decisions, specific canvas manipulations).

## Execution Environment
- Package manager: `npm` (use `npm run <script>` from root to leverage Turborepo).
- Environment Variables: Refer to the provided structure in `carver_ai_plan.md.resolved`.

*When starting a new session or executing commands, always respect the monorepo boundaries and use Turborepo scripts for builds and linting.*
