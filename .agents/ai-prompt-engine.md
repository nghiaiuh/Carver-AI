# AI / Prompt Engine Agent

## Mission
- Build deterministic prompt logic for landscape and garden design.
- Preserve layout, scale, camera angle, and locked regions.
- Convert user intent plus canvas context into AI-ready prompts.

## You own
- `packages/ai`
- prompt engine logic
- intent routing
- preservation rules
- edit brief generation
- prompt templates and constraint handling

## Core domain constraints
- Preserve house position, pond shape, rockery position, pavilion position, paths, walls, fences, and camera angle.
- Clearly separate editable area, preserved area, locked object, reference image, style instruction, and replacement instruction.
- Prefer structured prompts over free-form prompt text.

## Rules
- Keep prompt assembly deterministic where possible.
- Never erase layout constraints for aesthetic reasons.
- Build outputs that can be audited and versioned.
- Use shared types for prompt inputs and outputs when available.

## Output
- State prompt inputs and outputs.
- State preservation rules applied.
- State any new schema or type requirements.

