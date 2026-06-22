/*
 * Flow: Handles an HTTP API route for Carver AI.
 * 1. Read and validate the incoming request.
 * 2. Run the route-specific server logic.
 * 3. Return a typed JSON response for the frontend.
 */

import { NextResponse } from "next/server";
import { buildSnapshotAwareEditBrief } from "@carver/ai";
import { compileFinalPrompt, type PromptMode } from "@carver/ai/prompt-engine";
import { coerceCanvasSnapshotDocument, isCanvasSnapshotDocument } from "@carver/shared";
import { getRequestContext } from "../_lib/auth";
import { badRequest, readJsonObject, stringValue } from "../_lib/http";

const promptModes: PromptMode[] = ["auto", "review", "expert"];

const promptModeValue = (value: unknown): PromptMode =>
  typeof value === "string" && promptModes.includes(value as PromptMode) ? (value as PromptMode) : "auto";

const arrayValue = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const snapshotValue = (value: unknown) => (isCanvasSnapshotDocument(value) ? coerceCanvasSnapshotDocument(value) : undefined);

export async function POST(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = await readJsonObject(request);
  const rawPrompt = stringValue(body, "prompt") ?? stringValue(body, "rawPrompt");
  const originalRawPrompt = stringValue(body, "originalRawPrompt");

  if (!rawPrompt) {
    return badRequest("prompt is required");
  }

  const promptMode = promptModeValue(body.promptMode);
  const debugPrompt = body.debugPrompt === true;
  const snapshot = snapshotValue(body.snapshot ?? body.canvasSnapshot);

  const compiledPrompt = compileFinalPrompt({
    rawPrompt,
    projectContext: body.projectContext,
    imageContext: body.imageContext,
    referenceImages: arrayValue(body.referenceImages),
    userStylePreset: stringValue(body, "userStylePreset"),
    generationMode: stringValue(body, "generationMode"),
    promptMode,
  });

  const snapshotAwareBrief = snapshot
    ? buildSnapshotAwareEditBrief({
        jobType: "generate_concept",
        prompt: rawPrompt,
        snapshot,
      })
    : undefined;

  const promptMeta = {
    userSubmittedPrompt: rawPrompt,
    originalRawPrompt,
    wasEnhanced: body.wasEnhanced === true,
    taskType: compiledPrompt.taskType,
    editScope: compiledPrompt.editScope,
    riskLevel: compiledPrompt.riskLevel,
    targetArea: compiledPrompt.targetArea,
    targetObject: compiledPrompt.targetObject,
    preserveRules: compiledPrompt.preserveRules,
    negativeConstraints: compiledPrompt.negativeConstraints,
    formulaUsed: compiledPrompt.formulaUsed,
    editBrief: compiledPrompt.editBrief,
    snapshotAwareBrief,
    shouldShowReview: compiledPrompt.shouldShowReview,
    ...(promptMode === "expert" || debugPrompt ? { enhancedPromptVisible: compiledPrompt.enhancedPrompt } : {}),
  };

  // Generation model integration point:
  // send `compiledPrompt.enhancedPrompt` to the image/design model here.
  // The current MVP has no server-side generation provider wired yet, so this
  // route preserves the response contract needed by the future generator.
  return NextResponse.json({
    result: null,
    promptMeta,
  });
}
