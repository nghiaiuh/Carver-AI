/*
 * Flow: Handles an HTTP API route for Carver AI.
 * 1. Read and validate the incoming request.
 * 2. Run the route-specific server logic.
 * 3. Return a typed JSON response for the frontend.
 */

import { NextResponse } from "next/server";
import { enhancePrompt, type EnhanceMode } from "@carver/ai/prompt-engine";
import { badRequest, readJsonObject, stringValue } from "../../_lib/http";

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
  const body = await readJsonObject(request);
  const rawPrompt = stringValue(body, "rawPrompt") ?? stringValue(body, "prompt");

  if (!rawPrompt) {
    return badRequest("prompt is required");
  }

  try {
    const enhanced = await enhancePrompt({
      prompt: rawPrompt,
      mode: modeValue(body),
      useAiFallback: booleanValue(body, "useAiFallback") ?? true,
      forceAiFallback: booleanValue(body, "forceAiFallback") ?? false,
      projectContext: objectValue(body, "projectContext"),
    });

    // TODO: Persist enhance-prompt history here once the project adds dedicated prompt history storage.
    return NextResponse.json({
      success: true,
      data: enhanced,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to enhance prompt right now.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
