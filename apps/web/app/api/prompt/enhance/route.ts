/*
 * Route: API enhance prompt.
 * Thuoc: module prompt engine.
 * Vai tro: bien prompt tho cua user thanh prompt co cau truc ro hon cho cac tac vu AI.
 * Chuc nang:
 * - `POST`: phan tich prompt, xac dinh intent / mode, va tra ve prompt da duoc lam ro.
 */

import { NextResponse } from "next/server";
import { enhancePrompt, type EnhanceMode } from "@carver/ai/prompt-engine";
import { requireProjectOwner, requireRequestContext, isUuidLike } from "../../_lib/authz";
import { AI_CREDIT_COSTS, reserveUserCredits, restoreUserCredits } from "../../_lib/credits";
import { apiFailure, badRequest, readJsonObject, stringValue } from "../../_lib/http";
import { checkRateLimit } from "../../_lib/rateLimit";

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

export async function POST(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const rateLimit = checkRateLimit({
    key: `prompt-enhance:${context.user.id}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return apiFailure("RATE_LIMITED", "Too many prompt enhance requests", 429, context.requestId);
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

    const creditReservation = await reserveUserCredits(context, AI_CREDIT_COSTS.promptEnhance);
    if ("error" in creditReservation) {
      return creditReservation.error;
    }
    reservedCredits = true;

    const enhanced = await enhancePrompt({
      prompt: rawPrompt,
      mode: modeValue(body),
      useAiFallback: booleanValue(body, "useAiFallback") ?? true,
      forceAiFallback: booleanValue(body, "forceAiFallback") ?? false,
      projectContext: sanitizedProjectContext,
    });

    // TODO: Persist enhance-prompt history here once the project adds dedicated prompt history storage.
    return NextResponse.json({
      success: true,
      data: {
        ...enhanced,
        creditsRemaining: creditReservation.creditsRemaining,
      },
    });
  } catch (error) {
    if (reservedCredits) {
      await restoreUserCredits(context, AI_CREDIT_COSTS.promptEnhance).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "Unable to enhance prompt right now.";
    return apiFailure("PROMPT_ENHANCE_FAILED", message, 500, context.requestId);
  }
}
