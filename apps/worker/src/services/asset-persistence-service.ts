/*
 * Flow: Uploads generated images and persists linked asset rows.
 * 1. Store the generated image in R2.
 * 2. Create the matching assets row for project ownership and history.
 * 3. Return a web-friendly generated image payload.
 */

import { randomUUID } from "node:crypto";
import type { EvaluationScore, PersistedGeneratedImage } from "@carver/shared";
import { createGeneratedAsset } from "../repositories/asset-repository";
import { getSupabaseAdmin } from "@carver/db/server";
import {
  deleteR2Objects,
  extensionForMimeType,
  getR2Bucket,
  getR2ObjectBuffer,
  uploadR2Object,
} from "@carver/storage";

const slugifyFileBase = (value: string) =>
  value
    .replace(/\.[^.]+$/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "generated-concept";

type PersistedGeneratedAsset = {
  id: string;
  storage_path: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  metadata: unknown;
};

export type PersistedGeneratedOutput = {
  assetId: string;
  generatedImage: PersistedGeneratedImage;
  candidate?: {
    invocationId: string;
    candidateId: string;
    candidateIndex: number;
  };
  evaluationScore?: EvaluationScore;
};

const imageMimeType = (value: string | null): "image/png" | "image/jpeg" | "image/webp" | null =>
  value === "image/png" || value === "image/jpeg" || value === "image/webp" ? value : null;

const generatedMetadata = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const cameraShotFromMetadata = (metadata: Record<string, unknown>): PersistedGeneratedImage["cameraShot"] => {
  const value = generatedMetadata(metadata.cameraShot);
  const mode = value.mode;
  if (
    typeof value.shotSetNodeId !== "string" ||
    typeof value.shotId !== "string" ||
    typeof value.shotName !== "string" ||
    typeof value.order !== "number" ||
    (mode !== "plan" && mode !== "orbit")
  ) {
    return undefined;
  }
  return {
    shotSetNodeId: value.shotSetNodeId,
    shotId: value.shotId,
    shotName: value.shotName,
    order: value.order,
    mode,
  };
};

const candidateFromMetadata = (metadata: Record<string, unknown>) => {
  const invocationId = typeof metadata.invocationId === "string" ? metadata.invocationId : "";
  const candidateId = typeof metadata.candidateId === "string" ? metadata.candidateId : "";
  const candidateIndex = metadata.candidateIndex;
  if (
    !invocationId
    || !candidateId
    || typeof candidateIndex !== "number"
    || !Number.isInteger(candidateIndex)
    || candidateIndex < 0
    || candidateIndex > 3
  ) {
    return undefined;
  }
  return { invocationId, candidateId, candidateIndex };
};

const evaluationFromMetadata = (metadata: Record<string, unknown>): EvaluationScore | undefined => {
  const value = generatedMetadata(metadata.evaluationScore);
  if (
    typeof value.candidateId !== "string" ||
    typeof value.evaluatorVersion !== "string" ||
    (value.decision !== "accept" && value.decision !== "reject" && value.decision !== "needs_review") ||
    !Array.isArray(value.hardGateFailures) ||
    !Array.isArray(value.metrics)
  ) return undefined;
  return value as unknown as EvaluationScore;
};

const toPersistedGeneratedOutput = async (data: PersistedGeneratedAsset): Promise<PersistedGeneratedOutput | null> => {
  if (!data.storage_path) return null;
  const mimeType = imageMimeType(data.mime_type);
  if (!mimeType || !data.width || !data.height) return null;
  try {
    await getR2ObjectBuffer(data.storage_path);
  } catch {
    return null;
  }
  const metadata = generatedMetadata(data.metadata);
  const title = typeof metadata.title === "string" && metadata.title.trim() ? metadata.title : "Generated concept";
  const prompt = typeof metadata.prompt === "string" ? metadata.prompt : "";
  const provider = typeof metadata.provider === "string" && metadata.provider.trim() ? metadata.provider : "carver-worker";
  return {
    assetId: data.id,
    generatedImage: {
      id: data.id,
      title,
      imageUrl: "",
      width: data.width,
      height: data.height,
      prompt,
      assetId: data.id,
      mimeType,
      provider,
      ...(cameraShotFromMetadata(metadata) ? { cameraShot: cameraShotFromMetadata(metadata) } : {}),
    },
    ...(candidateFromMetadata(metadata) ? { candidate: candidateFromMetadata(metadata) } : {}),
    ...(evaluationFromMetadata(metadata) ? { evaluationScore: evaluationFromMetadata(metadata) } : {}),
  };
};

export const findReusableGeneratedImageAssets = async (params: {
  jobId: string;
  projectId: string;
  ownerId: string;
}): Promise<PersistedGeneratedOutput[]> => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assets")
    .select("id, storage_path, mime_type, width, height, metadata")
    .eq("source_job_id", params.jobId)
    .eq("project_id", params.projectId)
    .eq("owner_id", params.ownerId)
    .eq("kind", "generated");
  if (error) throw error;
  const resolved = await Promise.all((data ?? []).map((asset) => toPersistedGeneratedOutput(asset as PersistedGeneratedAsset)));
  return resolved.filter((output): output is PersistedGeneratedOutput => output !== null);
};

/**
 * Provider calls are not transactional with R2 or Postgres. When an earlier
 * attempt persisted a deterministic output successfully but failed later in
 * the chat/job-status flow, reuse that verified output rather than paying for
 * another generation on BullMQ retry.
 */
export const findReusableGeneratedImageAsset = async (params: {
  jobId: string;
  projectId: string;
  ownerId: string;
}): Promise<PersistedGeneratedOutput | null> => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assets")
    .select("id, storage_path, mime_type, width, height, metadata")
    .eq("id", params.jobId)
    .eq("source_job_id", params.jobId)
    .eq("project_id", params.projectId)
    .eq("owner_id", params.ownerId)
    .eq("kind", "generated")
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? toPersistedGeneratedOutput(data as PersistedGeneratedAsset) : null;
};

export const persistGeneratedImageAsset = async (params: {
  jobId: string;
  projectId: string;
  ownerId: string;
  prompt: string;
  title: string;
  assetId?: string;
  outputIndex?: number;
  cameraShot?: PersistedGeneratedImage["cameraShot"];
  invocationId?: string;
  candidateId?: string;
  candidateIndex?: number;
  conditioningHash?: string | null;
  evaluationScore?: EvaluationScore;
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  provider: string;
}): Promise<PersistedGeneratedOutput> => {
  const assetId = params.assetId ?? (params.outputIndex && params.outputIndex > 0 ? randomUUID() : params.jobId);
  const fileExtension = extensionForMimeType(params.mimeType);
  const fileBase =
    params.outputIndex && params.outputIndex > 0
      ? `${params.title}-${params.outputIndex + 1}`
      : params.title;
  const storagePath = [
    "users",
    params.ownerId,
    "projects",
    params.projectId,
    "jobs",
    params.jobId,
    `${slugifyFileBase(fileBase)}.${fileExtension}`,
  ].join("/");

  await uploadR2Object({
    key: storagePath,
    body: params.buffer,
    contentType: params.mimeType,
  });

  let asset: Awaited<ReturnType<typeof createGeneratedAsset>>;
  try {
    asset = await createGeneratedAsset({
      assetId,
      projectId: params.projectId,
      ownerId: params.ownerId,
      storageBucket: getR2Bucket(),
      storagePath,
      mimeType: params.mimeType,
      width: params.width,
      height: params.height,
      sizeBytes: params.buffer.length,
      sourceJobId: params.jobId,
      metadata: {
        title: params.title,
        prompt: params.prompt,
        provider: params.provider,
        ...(params.cameraShot ? { cameraShot: params.cameraShot } : {}),
        ...(params.invocationId ? { invocationId: params.invocationId } : {}),
        ...(params.candidateId ? { candidateId: params.candidateId } : {}),
        ...(typeof params.candidateIndex === "number" ? { candidateIndex: params.candidateIndex } : {}),
        ...(params.conditioningHash ? { conditioningHash: params.conditioningHash } : {}),
        ...(params.evaluationScore ? { evaluationScore: params.evaluationScore } : {}),
      },
    });
  } catch (error) {
    // The output path is deterministic. Keep it only when a matching asset row
    // survived from an earlier retry; otherwise avoid leaving an orphan binary.
    const supabase = getSupabaseAdmin();
    let persistedAsset: { storage_path: string } | null = null;
    try {
      const { data } = await supabase
        .from("assets")
        .select("storage_path")
        .eq("id", assetId)
        .maybeSingle();
      persistedAsset = data;
    } catch {
      // The scheduled orphan pass handles a storage cleanup miss if the
      // metadata lookup itself is unavailable.
    }
    if (persistedAsset?.storage_path !== storagePath) {
      await deleteR2Objects([storagePath]).catch(() => undefined);
    }
    throw error;
  }

  const generatedImage: PersistedGeneratedImage = {
    id: asset.id ?? assetId,
    title: params.title,
    imageUrl: "",
    width: params.width,
    height: params.height,
    prompt: params.prompt,
    assetId: asset.id,
    mimeType: params.mimeType,
    provider: params.provider,
    ...(params.cameraShot ? { cameraShot: params.cameraShot } : {}),
  };

  return {
    assetId: asset.id,
    generatedImage,
    ...(params.invocationId && params.candidateId && typeof params.candidateIndex === "number"
      ? { candidate: { invocationId: params.invocationId, candidateId: params.candidateId, candidateIndex: params.candidateIndex } }
      : {}),
    ...(params.evaluationScore ? { evaluationScore: params.evaluationScore } : {}),
  };
};
