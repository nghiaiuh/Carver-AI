import { getSupabaseAdmin } from "@carver/db/server";
import type {
  CanvasGenerationImageReference,
  CanvasGenerationPresetReference,
  CanvasGenerationTarget,
  CarverAiJobPayload,
} from "@carver/shared";
import { getR2ObjectBuffer, parseDataUrlImage } from "@carver/storage";

type ResolvedGenerationImageSource = {
  buffer: Buffer;
  mimeType: string;
  assetId?: string;
};

async function resolveAssetBackedImage(params: {
  ownerId: string;
  projectId: string;
  assetId: string;
}): Promise<ResolvedGenerationImageSource | null> {
  const supabase = getSupabaseAdmin();

  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .select("id, owner_id, project_id, storage_path, mime_type")
    .eq("id", params.assetId)
    .eq("owner_id", params.ownerId)
    .eq("project_id", params.projectId)
    .maybeSingle();

  if (assetError) {
    throw assetError;
  }

  if (asset?.storage_path) {
    return {
      buffer: await getR2ObjectBuffer(asset.storage_path),
      mimeType: asset.mime_type ?? "image/png",
      assetId: asset.id,
    };
  }

  const { data: libraryAsset, error: libraryError } = await supabase
    .from("library_assets")
    .select("id, owner_id, original_storage_path, mime_type")
    .eq("id", params.assetId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();

  if (libraryError) {
    throw libraryError;
  }

  if (!libraryAsset?.original_storage_path) {
    return null;
  }

  return {
    buffer: await getR2ObjectBuffer(libraryAsset.original_storage_path),
    mimeType: libraryAsset.mime_type ?? "image/png",
    assetId: libraryAsset.id,
  };
}

async function resolveImageSource(params: {
  ownerId: string;
  projectId: string;
  assetId?: string;
  imageUrl?: string;
}): Promise<ResolvedGenerationImageSource | null> {
  if (params.assetId) {
    return resolveAssetBackedImage({
      ownerId: params.ownerId,
      projectId: params.projectId,
      assetId: params.assetId,
    });
  }

  if (params.imageUrl?.startsWith("data:")) {
    const parsed = parseDataUrlImage(params.imageUrl);
    return {
      buffer: parsed.buffer,
      mimeType: parsed.mimeType,
    };
  }

  return null;
}

export async function resolveGenerationTargetImage(job: CarverAiJobPayload) {
  const target = job.canvasGraphContext?.target;
  if (!target) {
    return null;
  }

  return resolveImageSource({
    ownerId: job.userId,
    projectId: job.projectId,
    assetId: target.assetId,
    imageUrl: target.imageUrl,
  });
}

export async function resolveGenerationReferenceImages(job: CarverAiJobPayload) {
  const imageReferences = job.canvasGraphContext?.imageReferences ?? [];
  const presetReferences = job.canvasGraphContext?.presetReferences ?? [];
  const combined: Array<CanvasGenerationImageReference | CanvasGenerationPresetReference> = [
    ...imageReferences,
    ...presetReferences,
  ].slice(0, 4);

  const resolved = await Promise.all(
    combined.map((reference) =>
      "imageSrc" in reference
        ? resolveImageSource({
            ownerId: job.userId,
            projectId: job.projectId,
            assetId: reference.assetId,
            imageUrl: reference.imageSrc,
          })
        : resolveImageSource({
            ownerId: job.userId,
            projectId: job.projectId,
            assetId: reference.assetId,
            imageUrl: reference.imageUrl,
          }),
    ),
  );

  return resolved.filter((item): item is ResolvedGenerationImageSource => item !== null);
}

export async function resolveGenerationMaskImage(job: CarverAiJobPayload) {
  if (!job.maskAssetId) {
    return null;
  }

  return resolveAssetBackedImage({
    ownerId: job.userId,
    projectId: job.projectId,
    assetId: job.maskAssetId,
  });
}
