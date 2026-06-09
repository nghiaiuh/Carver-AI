/*
 * Flow: Handles an HTTP API route for Carver AI.
 * 1. Read and validate the incoming request.
 * 2. Run the route-specific server logic.
 * 3. Return a typed JSON response for the frontend.
 */

import { NextResponse } from "next/server";
import { enhancePromptDraft } from "../../../../lib/prompt-engine";
import { badRequest, readJsonObject, stringValue } from "../../_lib/http";

const arrayValue = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const rawPrompt = stringValue(body, "rawPrompt") ?? stringValue(body, "prompt");

  if (!rawPrompt) {
    return badRequest("rawPrompt is required");
  }

  const enhanced = enhancePromptDraft({
    rawPrompt,
    projectContext: body.projectContext,
    imageContext: body.imageContext,
    referenceImages: arrayValue(body.referenceImages),
    userStylePreset: stringValue(body, "userStylePreset"),
  });

  return NextResponse.json({
    rawPrompt: enhanced.rawPrompt,
    enhancedDraft: enhanced.enhancedDraft,
    promptMeta: {
      taskType: enhanced.taskType,
      editScope: enhanced.editScope,
      riskLevel: enhanced.riskLevel,
      targetArea: enhanced.targetArea,
      targetObject: enhanced.targetObject,
      formulaUsed: enhanced.formulaUsed,
      editBrief: enhanced.editBrief,
      shouldShowReview: enhanced.shouldShowReview,
    },
  });
}

