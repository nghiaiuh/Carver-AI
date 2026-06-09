# Landscape Prompt Compiler

The prompt engine has two layers:

- `enhancePromptDraft()` runs before Generate when the user clicks Enhance Prompt.
- `compileFinalPrompt()` runs after Generate and silently converts the submitted prompt into the guarded model prompt.

Flow:

1. User writes `rawPrompt` in the normal prompt box.
2. Optional: user clicks Enhance Prompt and `/api/prompt/enhance` returns `enhancedDraft`.
3. User edits the draft or keeps writing naturally.
4. User clicks Generate and `/api/generate` runs `compileFinalPrompt()`.
5. Detect task type, edit scope, target area/object, risk level, preservation rules, and negative constraints.
6. Render a formula-based final prompt for the model.
7. Return `promptMeta` so the UI can later show an Edit Brief, Review mode, or Expert mode.

Default Generate API behavior should not expose the final prompt. It is only returned as `enhancedPromptVisible` when `promptMode` is `expert` or `debugPrompt` is `true`.

APIs:

- `POST /api/prompt/enhance`: returns `enhancedDraft` plus metadata for the pre-Generate button.
- `POST /api/generate`: compiles `prompt` into the final model prompt and returns generation metadata.

The current implementation is deterministic and rule-based. A future LLM rewriting layer can be inserted inside `enhanceLandscapePrompt()` after detection and before formula rendering.
