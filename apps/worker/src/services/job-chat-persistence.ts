import { getSupabaseAdmin } from "@carver/db/server";
import type { CanvasGenerationAssistantMessage, GeneratedCanvasImage } from "@carver/shared";

const DEFAULT_THREAD_TITLE = "Landscape design chat";

async function getOrCreateThreadId(projectId: string, threadId?: string | null) {
  const supabase = getSupabaseAdmin();

  if (threadId) {
    const { data: existingThread, error } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("id", threadId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (existingThread) {
      return existingThread.id;
    }
  }

  const { data: firstThread, error: threadError } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (threadError) {
    throw threadError;
  }

  if (firstThread) {
    return firstThread.id;
  }

  const { data: createdThread, error: createError } = await supabase
    .from("chat_threads")
    .insert({
      project_id: projectId,
      title: DEFAULT_THREAD_TITLE,
    })
    .select("id")
    .single();

  if (createError || !createdThread) {
    throw new Error(createError?.message || "Unable to create project chat thread.");
  }

  return createdThread.id;
}

function toPersistedGeneratedImages(images: GeneratedCanvasImage[]) {
  return images.map((image) => ({
    id: image.id,
    title: image.title,
    imageUrl: "",
    width: image.width,
    height: image.height,
    prompt: image.prompt,
    assetId: image.assetId,
    mimeType: image.mimeType,
    provider: image.provider,
  }));
}

const findExistingGeneratedAssistantMessage = async (params: {
  projectId: string;
  threadId: string;
  jobId: string;
}) => {
  const { data, error } = await getSupabaseAdmin()
    .from("chat_messages")
    .select("id, content, created_at")
    .eq("project_id", params.projectId)
    .eq("thread_id", params.threadId)
    .contains("metadata", { source: "ai-job", jobId: params.jobId })
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export async function persistGeneratedAssistantMessage(params: {
  jobId: string;
  projectId: string;
  threadId?: string | null;
  content: string;
  generatedImages: GeneratedCanvasImage[];
}) {
  const supabase = getSupabaseAdmin();
  const resolvedThreadId = await getOrCreateThreadId(params.projectId, params.threadId);
  const persistedImages = toPersistedGeneratedImages(params.generatedImages);
  const referencedAssetIds = persistedImages
    .map((image) => image.assetId)
    .filter((assetId): assetId is string => typeof assetId === "string" && assetId.length > 0);

  const existingMessage = await findExistingGeneratedAssistantMessage({
    projectId: params.projectId,
    threadId: resolvedThreadId,
    jobId: params.jobId,
  });

  if (existingMessage) {
    return {
      id: existingMessage.id,
      role: "assistant",
      content: existingMessage.content,
      createdAt: existingMessage.created_at,
      generatedImages: persistedImages,
    } satisfies CanvasGenerationAssistantMessage;
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: resolvedThreadId,
      project_id: params.projectId,
      role: "assistant",
      content: params.content,
      referenced_asset_ids: referencedAssetIds,
      metadata: {
        source: "ai-job",
        jobId: params.jobId,
        kind: "assistant-generated-image",
        generatedImages: persistedImages,
      } as never,
    })
    .select("id, created_at")
    .single();

  if (error?.code === "23505") {
    const messageCreatedByConcurrentAttempt = await findExistingGeneratedAssistantMessage({
      projectId: params.projectId,
      threadId: resolvedThreadId,
      jobId: params.jobId,
    });
    if (messageCreatedByConcurrentAttempt) {
      return {
        id: messageCreatedByConcurrentAttempt.id,
        role: "assistant",
        content: messageCreatedByConcurrentAttempt.content,
        createdAt: messageCreatedByConcurrentAttempt.created_at,
        generatedImages: persistedImages,
      } satisfies CanvasGenerationAssistantMessage;
    }
  }

  if (error || !data) {
    throw new Error(error?.message || "Unable to persist generated assistant message.");
  }

  await supabase
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", resolvedThreadId);

  return {
    id: data.id,
    role: "assistant",
    content: params.content,
    createdAt: data.created_at,
    generatedImages: persistedImages,
  } satisfies CanvasGenerationAssistantMessage;
}
