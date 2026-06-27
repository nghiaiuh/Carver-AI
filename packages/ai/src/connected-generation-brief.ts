/*
 * Flow: Builds a graph-aware generation brief.
 * 1. Read the selected target and connected references from the canvas graph.
 * 2. Merge them with snapshot-aware preservation context.
 * 3. Return a concise AI-facing brief for generation jobs.
 */

import type { CanvasGenerationContext, CarverEditBrief } from "@carver/shared";

export const buildConnectedGenerationBrief = (
  snapshotBrief: CarverEditBrief,
  generationContext: CanvasGenerationContext,
): CarverEditBrief => {
  const imageReferenceLines = generationContext.imageReferences.map(
    (reference) => `${reference.role}:${reference.title}`,
  );
  const presetReferenceLines = generationContext.presetReferences.map((reference) =>
    `${reference.role}:${reference.category}:${reference.slot ?? "group"}:${reference.label}`,
  );

  return {
    ...snapshotBrief,
    goal: generationContext.target.prompt?.trim() || snapshotBrief.goal,
    preserveExactly: [
      `direct_edit_target:${generationContext.target.title}`,
      ...generationContext.preserveRules,
      ...snapshotBrief.preserveExactly,
    ],
    styleRequirements: [
      ...snapshotBrief.styleRequirements,
      ...imageReferenceLines,
      ...presetReferenceLines,
    ],
    avoid: Array.from(new Set(snapshotBrief.avoid)),
  };
};
