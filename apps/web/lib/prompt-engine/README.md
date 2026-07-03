# Web Prompt Engine Compatibility Layer

This folder is no longer an implementation owner.

Prompt-engine logic now lives in:

- `packages/ai/src/prompt-engine`

`apps/web/lib/prompt-engine/index.ts` remains only as a thin compatibility re-export:

- old web imports can continue to resolve
- runtime prompt logic stays owned by `@carver/ai/prompt-engine`

Current flow:

1. UI sends prompt-enhance requests to `POST /api/prompt/enhance`.
2. That route imports prompt logic from `@carver/ai/prompt-engine`.
3. Generation requests create an `ai_job`.
4. The worker imports prompt logic from `@carver/ai/prompt-engine`.
5. The worker stores normalized `job_result` for web polling.

If more prompt-engine logic appears in `apps/web/lib/prompt-engine`, treat it as drift and move it back into `packages/ai`.
