import "server-only";

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { Database, Json } from "@carver/db";
import {
  chatRequestBodySchema,
  formatZodError,
} from "@carver/shared";
import type {
  CarverAiJobRecord,
  ChatRequestBody,
  CreateAiJobRequest,
  GeneratedCanvasImage,
} from "@carver/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestContext } from "../../app/api/_lib/authz";
import { isUuidLike, requireProjectOwner } from "../../app/api/_lib/authz";
import { AI_CREDIT_COSTS, reserveUserCredits, restoreUserCredits } from "../../app/api/_lib/credits";
import { badRequest } from "../../app/api/_lib/http";
import { normalizeOpenAIChatModel } from "../openaiChatModels";
import { createProjectAiJob } from "./aiJobService";
import { detectChatGenerationIntent } from "./chatGenerationIntent";
import { resolveProjectChatMessageAssetUrls } from "./assetService";
import { createChatCompletion, type ChatInputImage } from "./openaiChat";

type ChatRole = "user" | "assistant";

type ChatMessageRow = Database["public"]["Tables"]["chat_messages"]["Row"];
type ChatThreadRow = Database["public"]["Tables"]["chat_threads"]["Row"];

export type ProjectChatImageReference = {
  label?: string;
  source?: "attachment" | "canvas-target" | "canvas-reference" | "preset-reference";
};

export type ProjectChatHistoryRecord = {
  id: string;
  projectId: string;
  canvasId?: string;
  role: ChatRole;
  content: string;
  generatedImages?: GeneratedCanvasImage[];
  createdAt: string;
};

const DEFAULT_THREAD_TITLE = "Landscape design chat";

function asJsonObject(value: Json): Record<string, Json> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

function readCanvasId(metadata: Json): string | undefined {
  const candidate = asJsonObject(metadata)?.canvasId;
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : undefined;
}

function normalizeRole(role: ChatMessageRow["role"]): ChatRole | null {
  return role === "user" || role === "assistant" ? role : null;
}

function generatedImageValue(value: Json): GeneratedCanvasImage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const image = value as Record<string, Json>;
  const assetId = typeof image.assetId === "string" && image.assetId.trim() ? image.assetId.trim() : undefined;
  const title = typeof image.title === "string" && image.title.trim() ? image.title.trim() : "Generated concept";
  const imageUrl = typeof image.imageUrl === "string" ? image.imageUrl : "";
  const prompt = typeof image.prompt === "string" && image.prompt.trim() ? image.prompt.trim() : title;

  return {
    id: typeof image.id === "string" && image.id.trim() ? image.id.trim() : assetId ?? randomUUID(),
    title,
    imageUrl,
    width: typeof image.width === "number" ? image.width : null,
    height: typeof image.height === "number" ? image.height : null,
    prompt,
    assetId,
    mimeType: typeof image.mimeType === "string" ? image.mimeType : undefined,
    provider: typeof image.provider === "string" ? image.provider : undefined,
  };
}

function readGeneratedImages(
  metadata: Json,
  referencedAssetIds: string[] | null,
): GeneratedCanvasImage[] | undefined {
  const metadataObject = asJsonObject(metadata);
  const rawImages = metadataObject?.generatedImages;
  if (!Array.isArray(rawImages)) {
    return undefined;
  }

  const referencedIds = Array.isArray(referencedAssetIds) ? referencedAssetIds : [];
  const images = rawImages
    .map(generatedImageValue)
    .filter((image): image is GeneratedCanvasImage => image !== null)
    .map((image, index) => ({
      ...image,
      assetId: image.assetId ?? referencedIds[index],
    }));

  return images.length > 0 ? images : undefined;
}

function mapChatMessage(
  row: Pick<ChatMessageRow, "id" | "project_id" | "role" | "content" | "metadata" | "created_at" | "referenced_asset_ids">,
): ProjectChatHistoryRecord | null {
  const role = normalizeRole(row.role);
  if (!role) {
    return null;
  }

  const canvasId = readCanvasId(row.metadata);
  const generatedImages = readGeneratedImages(row.metadata, row.referenced_asset_ids);

  return {
    id: row.id,
    projectId: row.project_id,
    ...(canvasId ? { canvasId } : {}),
    role,
    content: row.content,
    ...(generatedImages ? { generatedImages } : {}),
    createdAt: row.created_at,
  } satisfies ProjectChatHistoryRecord;
}

function buildMessageMetadata(params: {
  canvasId?: string;
  images?: ProjectChatImageReference[];
  kind: "user" | "assistant";
}): Json {
  const metadata: Record<string, Json> = {
    source: "api-chat",
    kind: params.kind,
  };

  if (params.canvasId) {
    metadata.canvasId = params.canvasId;
  }

  const imageReferences = (params.images ?? [])
    .map((image) => {
      const reference: Record<string, Json> = {};

      if (image.label) {
        reference.label = image.label;
      }

      if (image.source) {
        reference.source = image.source;
      }

      return Object.keys(reference).length > 0 ? reference : null;
    })
    .filter((reference): reference is Record<string, Json> => reference !== null);

  if (imageReferences.length > 0) {
    metadata.imageCount = imageReferences.length;
    metadata.imageReferences = imageReferences;
  }

  return metadata;
}

async function selectCanonicalProjectThread(
  supabase: SupabaseClient<Database>,
  projectId: string,
) {
  const { data, error } = await supabase
    .from("chat_threads")
    .select("id, project_id, title, created_at, updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getOrCreateProjectChatThread(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<ChatThreadRow> {
  const existingThread = await selectCanonicalProjectThread(supabase, projectId);
  if (existingThread) {
    return existingThread;
  }

  const { data: createdThread, error: insertError } = await supabase
    .from("chat_threads")
    .insert({
      project_id: projectId,
      title: DEFAULT_THREAD_TITLE,
    })
    .select("id, project_id, title, created_at, updated_at")
    .single();

  if (insertError || !createdThread) {
    throw new Error(insertError?.message || "Unable to create the default chat thread.");
  }

  return createdThread;
}

export async function listProjectChatMessages(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<ProjectChatHistoryRecord[]> {
  const thread = await getOrCreateProjectChatThread(supabase, projectId);

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, project_id, role, content, referenced_asset_ids, metadata, created_at")
    .eq("project_id", projectId)
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const mappedMessages = (data ?? [])
    .map(mapChatMessage)
    .filter((message): message is ProjectChatHistoryRecord => message !== null);

  return mappedMessages;
}

export async function appendProjectChatExchange(
  supabase: SupabaseClient<Database>,
  projectId: string,
  params: {
    canvasId?: string;
    images?: ProjectChatImageReference[];
    userMessage: string;
    assistantMessage: string;
  },
) {
  const thread = await getOrCreateProjectChatThread(supabase, projectId);

  const { data, error } = await supabase
    .from("chat_messages")
    .insert([
      {
        thread_id: thread.id,
        project_id: projectId,
        role: "user",
        content: params.userMessage,
        metadata: buildMessageMetadata({
          canvasId: params.canvasId,
          images: params.images,
          kind: "user",
        }),
      },
      {
        thread_id: thread.id,
        project_id: projectId,
        role: "assistant",
        content: params.assistantMessage,
        metadata: buildMessageMetadata({
          canvasId: params.canvasId,
          images: params.images,
          kind: "assistant",
        }),
      },
    ])
    .select("id, project_id, role, content, referenced_asset_ids, metadata, created_at");

  if (error || !data) {
    throw new Error(error?.message || "Unable to save the chat exchange.");
  }

  await supabase
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", thread.id);

  const mappedMessages = data
    .map(mapChatMessage)
    .filter((message): message is ProjectChatHistoryRecord => message !== null);
  const userMessage = mappedMessages.find((message) => message.role === "user");
  const assistantMessage = mappedMessages.find((message) => message.role === "assistant");

  if (!userMessage || !assistantMessage) {
    throw new Error("The chat exchange was saved incompletely.");
  }

  return {
    userMessage,
    assistantMessage,
  };
}

export async function appendProjectUserMessage(
  supabase: SupabaseClient<Database>,
  projectId: string,
  params: {
    canvasId?: string;
    images?: ProjectChatImageReference[];
    userMessage: string;
  },
) {
  const thread = await getOrCreateProjectChatThread(supabase, projectId);

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: thread.id,
      project_id: projectId,
      role: "user",
      content: params.userMessage,
      metadata: buildMessageMetadata({
        canvasId: params.canvasId,
        images: params.images,
        kind: "user",
      }),
    })
    .select("id, project_id, role, content, referenced_asset_ids, metadata, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to save the user chat message.");
  }

  await supabase
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", thread.id);

  const userMessage = mapChatMessage(data);
  if (!userMessage || userMessage.role !== "user") {
    throw new Error("The user chat message was saved incompletely.");
  }

  return {
    threadId: thread.id,
    userMessage,
  };
}

export async function clearProjectChatMessages(
  supabase: SupabaseClient<Database>,
  projectId: string,
) {
  await getOrCreateProjectChatThread(supabase, projectId);

  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("project_id", projectId);

  if (error) {
    throw new Error(error.message);
  }
}

type ChatServiceResult<T> =
  | { ok: true; data: T; headers?: Headers; status?: number }
  | { ok: false; response: NextResponse };

type ChatApiImageReference = {
  label?: string;
  source?: ProjectChatImageReference["source"];
  imageUrl: string;
};

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

function readChatInputImages(body: ChatRequestBody) {
  return (body.images ?? []).map(
    (image) =>
      ({
        imageUrl: image.imageUrl,
        label: image.label,
        source: image.source,
      }) satisfies ChatInputImage,
  );
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getProjectIdFromUrl(requestUrl: string) {
  const { searchParams } = new URL(requestUrl);
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

async function requireOwnedChatProject(context: RequestContext, projectId: string | undefined) {
  if (!projectId) {
    return { error: badRequest("projectId is required") };
  }

  if (!isUuidLike(projectId)) {
    return { error: badRequest("projectId is invalid") };
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult;
  }

  return projectResult;
}

const toChatImageReferences = (images: ChatApiImageReference[]) =>
  images.map((image) => ({
    label: image.label,
    source: image.source,
  }));

export async function loadProjectChatHistory(params: {
  context: RequestContext;
  requestUrl: string;
  projectId?: string;
}): Promise<ChatServiceResult<{ messages: ProjectChatHistoryRecord[] }>> {
  const projectResult = await requireOwnedChatProject(params.context, params.projectId);
  if ("error" in projectResult) {
    return { ok: false, response: projectResult.error };
  }

  try {
    const messages = await listProjectChatMessages(params.context.supabase, projectResult.project.id);

    return {
      ok: true,
      data: {
        messages: resolveProjectChatMessageAssetUrls(params.requestUrl, messages),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load chat history right now.";
    return { ok: false, response: NextResponse.json({ error: message }, { status: 500 }) };
  }
}

export async function enqueueChatGeneration(params: {
  request: Request;
  context: RequestContext;
  projectId: string;
  canvasId: string;
  body: Record<string, unknown>;
  prompt: string;
  images: ChatApiImageReference[];
  executionMode: CreateAiJobRequest["executionMode"];
  jobType: CreateAiJobRequest["jobType"];
}): Promise<ChatServiceResult<{
  mode: "generation";
  userMessage: ProjectChatHistoryRecord;
  job: CarverAiJobRecord;
  creditsRemaining: number | null;
}>> {
  try {
    const { threadId, userMessage } = await appendProjectUserMessage(
      params.context.supabase,
      params.projectId,
      {
        canvasId: params.canvasId,
        images: toChatImageReferences(params.images),
        userMessage: params.prompt,
      },
    );

    const jobResult = await createProjectAiJob({
      request: params.request,
      context: params.context,
      projectId: params.projectId,
      body: buildChatGenerationBody({
        projectId: params.projectId,
        prompt: params.prompt,
        canvasId: params.canvasId,
        body: params.body,
        threadId,
        executionMode: params.executionMode,
        jobType: params.jobType,
      }),
    });

    if (!jobResult.ok) {
      return { ok: false, response: jobResult.response };
    }

    return {
      ok: true,
      data: {
        mode: "generation",
        userMessage,
        job: jobResult.data.job,
        creditsRemaining: jobResult.data.creditsRemaining ?? null,
      },
      headers: buildChatDebugHeaders({
        mode: "generation",
        requestId: params.context.requestId,
        generationIntent: true,
        jobId: jobResult.data.job.id,
      }),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Carver AI could not queue image generation right now.";
    return { ok: false, response: NextResponse.json({ error: message }, { status: 500 }) };
  }
}

export async function sendChatMessage(params: {
  request: Request;
  context: RequestContext;
  body: Record<string, unknown>;
}): Promise<ChatServiceResult<{
  mode: "chat" | "generation";
  userMessage: ProjectChatHistoryRecord;
  assistantMessage?: ProjectChatHistoryRecord;
  job?: CarverAiJobRecord;
  creditsRemaining: number | null;
}>> {
  const parsedBody = chatRequestBodySchema.safeParse(params.body);
  if (!parsedBody.success) {
    return { ok: false, response: badRequest(formatZodError(parsedBody.error)) };
  }

  const body = parsedBody.data;
  const rawPrompt = body.rawPrompt;
  const content = body.content;
  const canvasId = body.canvasId ?? "canvas-main";
  const projectId = body.projectId ?? getProjectIdFromUrl(params.request.url);
  const model = normalizeOpenAIChatModel(body.model);
  const images = readChatInputImages(body);
  const messageContent =
    content ??
    rawPrompt ??
    (images.length > 0 ? "Describe these image references for landscape design context." : undefined);

  const projectResult = await requireOwnedChatProject(params.context, projectId);
  if ("error" in projectResult) {
    return { ok: false, response: projectResult.error };
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
    return enqueueChatGeneration({
      request: params.request,
      context: params.context,
      projectId: projectResult.project.id,
      canvasId,
      body,
      prompt: rawPrompt ?? messageContent ?? "",
      images,
      executionMode: generationIntent.executionMode,
      jobType: generationIntent.jobType,
    });
  }

  let reservedCredits = false;
  let creditsRemaining: number | null = null;

  try {
    const history = await listProjectChatMessages(params.context.supabase, projectResult.project.id);

    const creditReservation = await reserveUserCredits(params.context, AI_CREDIT_COSTS.chat);
    if ("error" in creditReservation) {
      return { ok: false, response: creditReservation.error };
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
      params.context.supabase,
      projectResult.project.id,
      {
        canvasId,
        images: toChatImageReferences(images),
        userMessage: messageContent ?? "Describe these image references for landscape design context.",
        assistantMessage: assistantContent,
      },
    );

    return {
      ok: true,
      data: {
        mode: "chat",
        userMessage,
        assistantMessage,
        creditsRemaining,
      },
      headers: buildChatDebugHeaders({
        mode: "chat",
        requestId: params.context.requestId,
        generationIntent: generationIntent.shouldGenerate,
      }),
    };
  } catch (error) {
    if (reservedCredits) {
      await restoreUserCredits(params.context, AI_CREDIT_COSTS.chat).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "Carver AI could not answer right now.";
    return { ok: false, response: NextResponse.json({ error: message }, { status: 500 }) };
  }
}

export async function clearProjectChatHistory(params: {
  context: RequestContext;
  projectId?: string;
}): Promise<ChatServiceResult<{ ok: true }>> {
  const projectResult = await requireOwnedChatProject(params.context, params.projectId);
  if ("error" in projectResult) {
    return { ok: false, response: projectResult.error };
  }

  try {
    await clearProjectChatMessages(params.context.supabase, projectResult.project.id);

    return { ok: true, data: { ok: true } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to clear chat history right now.";
    return { ok: false, response: NextResponse.json({ error: message }, { status: 500 }) };
  }
}
