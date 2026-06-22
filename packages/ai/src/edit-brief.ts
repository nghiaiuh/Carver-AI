/*
 * Flow: Builds a snapshot-aware edit brief for AI jobs.
 * 1. Read selection and spatial lock context from the snapshot.
 * 2. Combine it with the user's prompt intent.
 * 3. Return a compact brief shared by routes and workers.
 */

import type { CarverAiJobPayload, CarverEditBrief, CarverEditIntent } from "@carver/shared";

const intentByJobType: Record<CarverAiJobPayload["jobType"], CarverEditIntent> = {
  analyze_reference: "analyze",
  export: "generate",
  generate_concept: "generate",
  refine_concept: "refine",
};

const fallbackGoalByJobType: Record<CarverAiJobPayload["jobType"], string> = {
  analyze_reference: "Analyze the provided landscape reference.",
  export: "Prepare the selected design output for export.",
  generate_concept: "Generate a landscape concept from the current canvas state.",
  refine_concept: "Refine the current landscape concept while preserving locked layout elements.",
};

export const buildSnapshotAwareEditBrief = (
  payload: Pick<CarverAiJobPayload, "jobType" | "prompt" | "snapshot">,
): CarverEditBrief => {
  const { snapshot } = payload;

  return {
    goal: payload.prompt.trim() || fallbackGoalByJobType[payload.jobType],
    intent: intentByJobType[payload.jobType],
    preserveExactly: snapshot.locks.map((lock) =>
      lock.targetId ? `${lock.type}:${lock.targetId}:${lock.strength}` : `${lock.type}:${lock.strength}`,
    ),
    changeOnly: snapshot.regions
      .filter((region) => region.editable !== false)
      .map((region) => region.label),
    styleRequirements: snapshot.references.map((reference) => `${reference.role}:${reference.label}`),
    avoid: snapshot.locks
      .filter((lock) => lock.strength === "hard")
      .map((lock) => `Do not alter locked ${lock.type}${lock.targetId ? ` ${lock.targetId}` : ""}`),
    selectedObjectIds: snapshot.selection.objectIds,
    selectedRegionIds: snapshot.selection.regionIds,
    lockSummaries: snapshot.locks.map((lock) =>
      [lock.targetType, lock.type, lock.strength, lock.reason].filter(Boolean).join(": "),
    ),
  };
};
