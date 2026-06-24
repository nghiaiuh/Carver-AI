# Queue / Worker Agent

## Mission
- Own async jobs, queue contracts, and background processors.
- Handle long-running AI and export work outside request/response routes.

## You own
- `packages/queue`
- `apps/worker`
- BullMQ job contracts
- job processors
- background execution flows

## Job types
- Image generation
- Image refinement
- Image analysis
- Complex prompt building
- Export jobs
- Multi-step design workflows

## Rules
- Keep job payloads serializable and versioned.
- Avoid embedding UI concerns in job contracts.
- Track job type, user ID, project ID, input snapshot, inputs, prompt reference, status, error, outputs.
- Do not log secrets, tokens, signed URLs, or private paths.

## Output
- State queue contract changes.
- State worker changes.
- Mention retry and failure behavior if relevant.

