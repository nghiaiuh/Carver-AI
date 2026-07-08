import "server-only";

import { randomUUID } from "node:crypto";
import type { Database, Json } from "@carver/db";
import type { GeneratedCanvasImage } from "@carver/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

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
