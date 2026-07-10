/*
 * Route: API chat cho canvas editor.
 * Thuoc: module tro ly AI / hoi thoai theo canvas.
 * Vai tro: lam dau moi doc, ghi va xoa lich su chat gan voi project hien tai.
 * Chuc nang:
 * - `GET`: lay lich su chat hien co.
 * - `POST`: gui prompt + anh tham chieu den AI hoac enqueue generation job neu prompt muon tao/chinh anh.
 * - `DELETE`: xoa lich su chat cua project hien tai.
 */

import { NextResponse } from "next/server";
import type { CreateAiJobRequest } from "@carver/shared";
import { isUuidLike, requireProjectOwner, requireRequestContext } from "../_lib/authz";
import { badRequest, readJsonObject, stringValue } from "../_lib/http";
import { AI_CREDIT_COSTS, reserveUserCredits, restoreUserCredits } from "../_lib/credits";
import {
  appendProjectChatExchange,
  appendProjectUserMessage,
  clearProjectChatMessages,
  listProjectChatMessages,
} from "../../../lib/server/projectChatHistory";
import { createProjectAiJob } from "../../../lib/server/aiJobService";
import { resolveProjectChatMessageAssetUrls } from "../../../lib/server/chatMessageAssets";
import { normalizeOpenAIChatModel } from "../../../lib/openaiChatModels";
import { detectChatGenerationIntent } from "../../../lib/server/chatGenerationIntent";
import { createChatCompletion, type ChatInputImage } from "../../../lib/server/openaiChat";

function buildChatDebugHeaders(params: {
  mode: "chat" | "generation";
  requestId: string;
  generationIntent: boolean;
  jobId?: string;
}) {
  const headers = new Headers();
  headers.set("x-carver-request-id", params.requestId);
  headers.set("x-carver-chat-mode", params.mode);
  headers.set("x-carver-generation-intent", params.generationIntent ? "true" : "false");
  if (params.jobId) {
    headers.set("x-carver-job-id", params.jobId);
  }
  return headers;
}

function readChatInputImages(body: Record<string, unknown>) {
  const value = body.images;
  if (!Array.isArray(value)) {
    return [] as ChatInputImage[];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const imageUrl = typeof candidate.imageUrl === "string" ? candidate.imageUrl.trim() : "";
    const label = typeof candidate.label === "string" ? candidate.label.trim() : undefined;
    const source =
      candidate.source === "attachment" ||
      candidate.source === "canvas-target" ||
      candidate.source === "canvas-reference" ||
      candidate.source === "preset-reference"
        ? candidate.source
        : undefined;

    if (!imageUrl) {
      return [];
    }

    return [{ imageUrl, label, source } satisfies ChatInputImage];
  });
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getProjectIdFromUrl(request: Request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("projectId")?.trim() || undefined;
}

function buildChatGenerationBody(params: {
  projectId: string;
  prompt: string;
  canvasId: string;
  body: Record<string, unknown>;
  threadId: string;
  executionMode: CreateAiJobRequest["executionMode"];
  jobType: CreateAiJobRequest["jobType"];
}) {
  const payload: Record<string, unknown> = {
    projectId: params.projectId,
    prompt: params.prompt,
    rawPrompt: params.prompt,
    canvasId: params.canvasId,
    threadId: params.threadId,
    executionMode: params.executionMode,
    jobType: params.jobType,
  };

  const optionalKeys = ["idempotencyKey", "snapshot", "canvasSnapshot", "targetNodeId", "canvasGraphContext"];
  optionalKeys.forEach((key) => {
    if (key in params.body) {
      payload[key] = params.body[key];
    }
  });

  return payload;
}

export async function GET(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const projectId = getProjectIdFromUrl(request);
  if (!projectId) {
    return badRequest("projectId is required");
  }

  if (!isUuidLike(projectId)) {
    return badRequest("projectId is invalid");
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult.error;
  }

  try {
    const messages = await listProjectChatMessages(context.supabase, projectResult.project.id);

    return NextResponse.json({
      messages: resolveProjectChatMessageAssetUrls(request.url, messages),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load chat history right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = await readJsonObject(request);
  const rawPrompt = stringValue(body, "rawPrompt");
  const content = stringValue(body, "content");
  const canvasId = stringValue(body, "canvasId") ?? "canvas-main";
  const projectId = stringValue(body, "projectId") ?? getProjectIdFromUrl(request);
  const model = normalizeOpenAIChatModel(stringValue(body, "model"));
  const images = readChatInputImages(body);
  const messageContent =
    content ??
    rawPrompt ??
    (images.length > 0 ? "Describe these image references for landscape design context." : undefined);

  if (!messageContent && images.length === 0) {
    return badRequest("content or images are required");
  }

  if (!projectId) {
    return badRequest("projectId is required");
  }

  if (!isUuidLike(projectId)) {
    return badRequest("projectId is invalid");
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult.error;
  }

  const generationContext = objectValue(body.canvasGraphContext);
  const imageReferenceCount =
    (Array.isArray(generationContext?.imageReferences) ? generationContext.imageReferences.length : 0) +
    (Array.isArray(generationContext?.presetReferences) ? generationContext.presetReferences.length : 0);
  const generationIntent = detectChatGenerationIntent({
    prompt: rawPrompt ?? messageContent ?? "",
    hasTargetImage: Boolean(generationContext?.target),
    attachmentCount: images.filter((image) => image.source === "attachment").length,
    referenceImageCount: imageReferenceCount,
  });

  if (generationIntent.shouldGenerate) {
    try {
      const { threadId, userMessage } = await appendProjectUserMessage(
        context.supabase,
        projectResult.project.id,
        {
          canvasId,
          images: images.map((image) => ({
            label: image.label,
            source: image.source,
          })),
          userMessage: messageContent ?? rawPrompt ?? "",
        },
      );

      const jobResult = await createProjectAiJob({
        request,
        context,
        projectId: projectResult.project.id,
        body: buildChatGenerationBody({
          projectId: projectResult.project.id,
          prompt: rawPrompt ?? messageContent ?? "",
          canvasId,
          body,
          threadId,
          executionMode: generationIntent.executionMode,
          jobType: generationIntent.jobType,
        }),
      });

      if (!jobResult.ok) {
        return jobResult.response;
      }

      return NextResponse.json({
        mode: "generation",
        userMessage,
        job: jobResult.data.job,
        creditsRemaining: jobResult.data.creditsRemaining ?? null,
      }, {
        headers: buildChatDebugHeaders({
          mode: "generation",
          requestId: context.requestId,
          generationIntent: true,
          jobId: jobResult.data.job.id,
        }),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Carver AI could not queue image generation right now.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  let reservedCredits = false;
  let creditsRemaining: number | null = null;

  try {
    const history = await listProjectChatMessages(context.supabase, projectResult.project.id);

    const creditReservation = await reserveUserCredits(context, AI_CREDIT_COSTS.chat);
    if ("error" in creditReservation) {
      return creditReservation.error;
    }
    reservedCredits = true;
    creditsRemaining = creditReservation.creditsRemaining;

    const assistantContent = await createChatCompletion({
      message: messageContent ?? "Describe these image references for landscape design context.",
      history,
      images,
      model,
    });
    const { userMessage, assistantMessage } = await appendProjectChatExchange(
      context.supabase,
      projectResult.project.id,
      {
        canvasId,
        images: images.map((image) => ({
          label: image.label,
          source: image.source,
        })),
        userMessage: messageContent ?? "Describe these image references for landscape design context.",
        assistantMessage: assistantContent,
      },
    );

    return NextResponse.json({
      mode: "chat",
      userMessage,
      assistantMessage,
      creditsRemaining,
    }, {
      headers: buildChatDebugHeaders({
        mode: "chat",
        requestId: context.requestId,
        generationIntent: generationIntent.shouldGenerate,
      }),
    });
  } catch (error) {
    if (reservedCredits) {
      await restoreUserCredits(context, AI_CREDIT_COSTS.chat).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "Carver AI could not answer right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const projectId = getProjectIdFromUrl(request);
  if (!projectId) {
    return badRequest("projectId is required");
  }

  if (!isUuidLike(projectId)) {
    return badRequest("projectId is invalid");
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult.error;
  }

  try {
    await clearProjectChatMessages(context.supabase, projectResult.project.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to clear chat history right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
