# Landscape Prompt Engine

This folder now has two active groups.

Pre-submit enhance prompt:
- `enhance-prompt/enhancePrompt.ts`
- `enhance-prompt/enhanceTypes.ts`
- `enhance-prompt/landscapeDictionaries.ts`
- `enhance-prompt/landscapeRules.ts`
- `enhance-prompt/promptScoring.ts`
- `enhance-prompt/promptTemplates.ts`
- `enhance-prompt/openAiEnhanceFallback.ts`
- `enhance-prompt/enhancePrompt.test.ts`

Post-submit compile/generate prompt:
- `generate/compileFinalPrompt.ts`
- `generate/enhanceLandscapePrompt.ts`
- `generate/types.ts`
- `generate/detectTaskType.ts`
- `generate/detectEditScope.ts`
- `generate/detectRiskLevel.ts`
- `generate/detectTargetArea.ts`
- `generate/preserveRules.ts`
- `generate/negativeConstraints.ts`
- `generate/stylePresets.ts`
- `generate/formulas.ts`
- `generate/buildEditBrief.ts`
- `generate/enhanceLandscapePrompt.test.ts`

Shared support files:
- `index.ts`
- `README.md`

Flow:

1. User writes `rawPrompt` in the normal prompt box.
2. Optional: user clicks Enhance Prompt and `/api/prompt/enhance` returns `{ success: true, data: EnhancePromptResult }`.
3. The pre-submit flow builds a rule scaffold first, then lets OpenAI refine it while preserving the user's original request.
4. User edits the enhanced prompt or keeps writing naturally.
5. User clicks Generate and the web app creates an `ai_job`.
6. The worker runs `compileFinalPrompt()` and silently converts the submitted prompt into the guarded final model prompt.
7. The worker stores `job_result` so the UI can later show an Edit Brief, Review mode, or Expert mode.

Default Generate API behavior should not expose the final prompt. It is only returned as `enhancedPromptVisible` when `promptMode` is `expert` or `debugPrompt` is `true`.

APIs:

- `POST /api/prompt/enhance`: builds a rule-based scaffold from the user's request, then asks OpenAI to refine that scaffold into the final enhanced prompt when AI enhancement is enabled.
- `POST /api/projects/[projectId]/ai-jobs`: creates a generation job that the worker executes.

The current Enhance Prompt implementation is hybrid:
- rule-based detection and scaffolding preserve structure, constraints, and the user's original ask
- OpenAI refinement turns that scaffold into a more natural final prompt
- if AI enhancement fails, the scaffold-backed deterministic prompt is returned instead of silently inventing a different request

Removed as unused in the current flow:

- `enhancePromptDraft.ts`: old pre-submit draft enhancer, no longer used by UI or API after the hybrid `enhancePrompt()` flow replaced it
