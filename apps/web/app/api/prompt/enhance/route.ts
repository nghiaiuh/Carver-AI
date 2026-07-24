/*
 * Route: API enhance prompt.
 * Thuoc: module prompt engine.
 * Vai tro: bien prompt tho cua user thanh prompt co cau truc ro hon cho cac tac vu AI.
 * Chuc nang:
 * - `POST`: phan tich prompt, xac dinh intent / mode, va tra ve prompt da duoc lam ro.
 */

import { NextResponse } from "next/server";
import { mapEnhancedPromptResultV2ToLegacy, type EnhanceMode, type PromptEngineTrustedContext } from "@carver/ai/prompt-engine";
import { enhancePromptV2 } from "@carver/ai/prompt-engine/server";
import { requireProjectOwner, requireRequestContext, isUuidLike } from "../../_lib/authz";
import { AI_CREDIT_COSTS, reserveUserCredits, restoreUserCredits } from "../../_lib/credits";
import { apiFailure, badRequest, readJsonObject, stringValue } from "../../_lib/http";
import { enforceRateLimit } from "../../_lib/rateLimit";

const MODE_VALUES: EnhanceMode[] = [
  "image_generation",
  "image_editing",
  "design_analysis",
  "plant_recommendation",
  "material_change",
  "layout_preservation",
];

function booleanValue(body: Record<string, unknown>, key: string) {
  return typeof body[key] === "boolean" ? (body[key] as boolean) : undefined;
}

function objectValue(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function modeValue(body: Record<string, unknown>): EnhanceMode {
  const value = stringValue(body, "mode");
  return value && MODE_VALUES.includes(value as EnhanceMode) ? (value as EnhanceMode) : "image_editing";
}

function buildTrustedContext(params: {
  projectId?: string;
  projectContext?: Record<string, unknown>;
  mode: EnhanceMode;
}): PromptEngineTrustedContext {
  const lockedObjects = Array.isArray(params.projectContext?.lockedObjects)
    ? params.projectContext?.lockedObjects.filter((item): item is string => typeof item === "string")
    : [];

  return {
    projectId: params.projectId,
    contextRevision:
      typeof params.projectContext?.contextRevision === "number" ? params.projectContext.contextRevision : 0,
    snapshotId:
      typeof params.projectContext?.snapshotId === "string" ? params.projectContext.snapshotId : undefined,
    executionMode: params.mode === "image_generation" ? "text_to_image" : "image_edit",
    target: null,
    availableTargets: [],
    availableReferences: [],
    selectedObjectIds: [],
    selectedRegionIds: [],
    lockedObjectIds: lockedObjects,
    locks: lockedObjects.map((objectId, index) => ({
      id: `enhance-lock-${index + 1}`,
      targetType: "object" as const,
      targetId: objectId,
      type: "position" as const,
      strength: "hard" as const,
      reason: "Locked object from trusted project context.",
    })),
    mask: null,
    explicitConstraints: lockedObjects.length > 0
      ? {
          preserve: lockedObjects.map((objectId) => `Preserve locked object ${objectId}.`),
        }
      : undefined,
  };
}

export async function POST(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const rateLimit = await enforceRateLimit(context, {
    scope: "prompt-enhance",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return rateLimit.response;
  }

  const body = await readJsonObject(request);
  const rawPrompt = stringValue(body, "rawPrompt") ?? stringValue(body, "prompt");

  if (!rawPrompt) {
    return badRequest("prompt is required");
  }

  let reservedCredits = false;

  try {
    const projectId = stringValue(body, "projectId");
    const projectContext = objectValue(body, "projectContext");
    const nestedProjectId = typeof projectContext?.projectId === "string" ? projectContext.projectId.trim() : "";

    if (projectId && !isUuidLike(projectId)) {
      return badRequest("projectId is invalid");
    }

    if (nestedProjectId && !isUuidLike(nestedProjectId)) {
      return badRequest("projectContext.projectId is invalid");
    }

    const scopedProjectId = projectId ?? nestedProjectId;
    if (scopedProjectId) {
      const projectResult = await requireProjectOwner(context, scopedProjectId);
      if ("error" in projectResult) {
        return projectResult.error;
      }
    }

    const sanitizedProjectContext = projectContext
      ? (() => {
          const rest = { ...projectContext };
          delete (rest as { ownerId?: unknown }).ownerId;
          delete (rest as { userId?: unknown }).userId;
          delete (rest as { projectId?: unknown }).projectId;
          return scopedProjectId ? { ...rest, projectId: scopedProjectId } : rest;
        })()
      : undefined;

    const mode = modeValue(body);

    const creditOperationKey = `enhance:${context.requestId}`;
    const creditReservation = await reserveUserCredits(
      context,
      AI_CREDIT_COSTS.promptEnhance,
      creditOperationKey,
      "prompt_enhance",
    );
    if ("error" in creditReservation) {
      return creditReservation.error;
    }
    reservedCredits = creditReservation.applied;

    const enhanced = await enhancePromptV2({
      rawPrompt,
      trustedContext: buildTrustedContext({
        projectId: scopedProjectId,
        projectContext: sanitizedProjectContext,
        mode,
      }),
      useModel: booleanValue(body, "useAiFallback") ?? true,
      forceModel: booleanValue(body, "forceAiFallback") ?? false,
    });
    const compatibility = mapEnhancedPromptResultV2ToLegacy(enhanced, mode);

    // TODO: Persist enhance-prompt history here once the project adds dedicated prompt history storage.
    return NextResponse.json({
      success: true,
      data: {
        ...compatibility,
        engineVersion: "2",
        engineRunId: enhanced.engineRunId,
        parentEngineRunId: enhanced.parentEngineRunId ?? null,
        planHash: enhanced.planHash,
        contextRevision: enhanced.contextRevision,
        planPreview: enhanced.planPreview,
        decision: enhanced.decision,
        risk: enhanced.risk,
        warnings: enhanced.warnings,
        reviewReasons: enhanced.reviewReasons,
        degraded: enhanced.degraded,
        interpreter: enhanced.interpreter,
        creditsRemaining: creditReservation.creditsRemaining,
      },
    });
  } catch (error) {
    if (reservedCredits) {
      await restoreUserCredits(
        context,
        AI_CREDIT_COSTS.promptEnhance,
        `enhance:${context.requestId}`,
      ).catch(() => undefined);
    }
    return apiFailure(
      "PROMPT_ENHANCE_FAILED",
      "Unable to enhance prompt right now.",
      502,
      context.requestId,
    );
  }
}
