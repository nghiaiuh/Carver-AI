# Carver AI Agents

This directory contains the Codex agent prompts for Carver AI.
`.agents/manifest.json` is the discovery index for the agent suite.
Every agent inherits `.agents/shared.md` and uses `.agents/handoff-template.md` for cross-agent handoffs.

## Files
- `shared.md`: common rules used by every agent.
- `orchestrator.md`: task decomposition and handoff coordination.
- `web-ui-canvas.md`: Next.js app, canvas UI, and route work.
- `ai-prompt-engine.md`: prompt engine, intent routing, and layout-preserving AI logic.
- `db-security.md`: schema, RLS, ownership checks, and server-side data access.
- `queue-worker.md`: queue contracts and background jobs.
- `shared-contracts.md`: shared types, constants, and framework-agnostic helpers.
- `qa-integration.md`: validation, build checks, and merge safety.
- `handoff-template.md`: standard format for agent-to-agent handoffs.

## Usage
- Start with `shared.md` plus the relevant agent file.
- Use `handoff-template.md` whenever work crosses package boundaries.
- Keep implementation inside the owning package unless a contract change is required.
