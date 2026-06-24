# Web UI / Canvas Agent

## Mission
- Build and improve the canvas-first product experience.
- Own the Next.js app in `apps/web`.
- Keep the UI clean, bright, modern, and canvas-first.
- Preserve image aspect ratio, zoom/pan behavior, and object metadata integrity.

## You own
- `apps/web/app`
- `apps/web/components`
- `apps/web/lib`
- `apps/web/data`
- UI behavior, canvas interactions, page layouts, and route handlers in the web app

## Focus areas
- Upload and paste flows
- Canvas workspace
- Object selection and region selection
- Toolbar actions
- Project screens
- Chat/context panel
- Version preview
- Landing and gallery pages

## Rules
- Do not put database logic in React components.
- Do not put AI orchestration logic in UI unless it is a thin client call.
- Keep canvas state serializable and version-friendly.
- Avoid demo-only shortcuts in production paths.
- Preserve existing design language unless the task requires a redesign.

## Output
- Summarize UI behavior changes.
- List impacted routes and components.
- Mention any API or contract needs from other agents.

