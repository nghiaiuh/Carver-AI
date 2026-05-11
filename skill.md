# Carver AI Developer Skills & Guidelines

You are an AI coding assistant working on **Carver AI**, a collaborative ChatCanvas application (similar to Lovart.ai).
This file contains the "skills" and context you need to successfully navigate and develop within this codebase.

## 1. Project Context & Objectives
- **Goal:** Build an infinite canvas app with real-time collaboration where users can chat with an AI agent to edit images, generate content, and add annotations.
- **Key Features:**
  - Real-time collaborative canvas (tldraw + Liveblocks).
  - AI Orchestration (LangGraph routing intents: edit, generate, annotate, chat).
  - Asynchronous Processing (BullMQ workers for heavy image processing).
  - Cloud Storage (Cloudflare R2).
  - Database (PostgreSQL + Prisma).

## 2. Architecture & Tech Stack
- **Monorepo:** Turborepo (npm workspaces)
- **Frontend/API:** Next.js 14 (App Router), TailwindCSS, TypeScript.
- **Canvas:** `tldraw` integrated with `Liveblocks` for real-time multiplayer.
- **AI Agent:** `@langchain/langgraph` defining a state graph for routing intents.
- **Database Layer:** Prisma ORM.
- **Background Worker:** BullMQ + Redis, running on a separate Node.js service (Railway).
- **Image Processing:** Replicate (Flux Fill, Flux Schnell).

## 3. Monorepo Structure Map
- `/apps/web`: Next.js frontend, API route handlers (chat streaming, canvas auth), UI components.
- `/apps/worker`: BullMQ processors for long-running AI tasks (e.g., Flux inpainting).
- `/packages/ai`: LangGraph definitions, nodes, state schema, and tools.
- `/packages/db`: Prisma schema, migrations, and typed database client.
- `/packages/queue`: Shared BullMQ types, queue names, and job interfaces.
- `/packages/config`: Shared configurations (ESLint, TSConfig).

## 4. Coding Standards & Guidelines
- **TypeScript Only:** Use strict TypeScript. Avoid `any`.
- **Server vs Client Components:** In Next.js 14, strictly define `"use client"` for interactive components (e.g., `CarverCanvas`). Use Server Components by default.
- **Shared Packages:** When adding a database model, do it in `/packages/db/prisma/schema.prisma` and run `prisma generate`. Don't redefine models in `apps/web`.
- **Environment Variables:** Use `process.env` safely. For client-side envs in Next.js, use `NEXT_PUBLIC_` prefix.
- **Tool Calls:** When building LangGraph nodes in `/packages/ai`, ensure tool calls emit state updates that can be streamed to the client via Server Sent Events (SSE).

## 5. Development Workflow
- **Adding an AI Feature:**
  1. Define the input/output state in `packages/ai/src/state.ts`.
  2. Add a new node or update the router in `packages/ai/src/graph.ts`.
  3. Update `apps/web/app/api/chat/route.ts` if the stream payload structure changes.
- **Adding a Canvas Tool:**
  1. Create a custom tool in `apps/web/components/canvas/`.
  2. Register the tool in the `<Tldraw>` configuration.
  3. Use Liveblocks mutations to broadcast custom events if necessary.

## 6. Useful Commands
- `npm run dev`: Starts all dev servers via Turbo.
- `npm run build`: Builds the monorepo.
- `cd packages/db && npx prisma db push`: Pushes database schema changes.

**Always refer to these principles when suggesting code modifications.**
