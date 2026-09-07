import { getSupabaseAdmin } from "@carver/db/server";
import type {
  CanvasGenerationImageReference,
  CanvasGenerationPresetReference,
  CarverAiJobPayload,
  ModelConditioning,
} from "@carver/shared";
import { parseDataUrlImage } from "@carver/storage/image-format";
import { getR2ObjectBuffer } from "@carver/storage/r2";
import type { ProviderImageInput } from "../providers/image-provider";

export type ResolvedGenerationImageSource = {
  buffer: Buffer;
  mimeType: string;
  assetId?: string;
};

export type ResolvedGenerationReferenceImage = ResolvedGenerationImageSource & {
  contextId: string;
  sourceNodeId: string;
  role: string;
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
  ];

  const resolved = await Promise.all(
    combined.map(async (reference) => {
      const source = await ("imageSrc" in reference
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
        })
      );
      if (!source) {
        throw new Error(`Generation reference ${reference.nodeId} could not be resolved from its persisted asset.`);
      }

      return {
        ...source,
        contextId: "imageSrc" in reference && reference.childId
          ? `${reference.nodeId}:${reference.childId}`
          : "sourcePresetChildId" in reference && reference.sourcePresetChildId
            ? `${reference.nodeId}:${reference.sourcePresetChildId}`
            : reference.nodeId,
        sourceNodeId: reference.nodeId,
        role: String(reference.role),
      } satisfies ResolvedGenerationReferenceImage;
    }),
  );

  return resolved;
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

const toProviderImage = (params: {
  role: ProviderImageInput["role"];
  source: ResolvedGenerationImageSource;
  assetId?: string;
  required: boolean;
}): ProviderImageInput => ({
  role: params.role,
  assetId: params.source.assetId ?? params.assetId ?? null,
  required: params.required,
  buffer: params.source.buffer,
  mimeType: params.source.mimeType,
});

const findResolvedReference = (params: {
  assetId: string;
  contextId: string;
  references: readonly ResolvedGenerationReferenceImage[];
}) =>
  params.references.find(
    (reference) => reference.assetId === params.assetId && reference.contextId === params.contextId,
  );

const assertResolvedEvidenceRole = (params: {
  role: "camera_guide" | "uncertainty_guide";
  assetId: string | undefined;
  evidenceImages: readonly ProviderImageInput[];
}) => {
  if (!params.assetId) return null;
  const image = params.evidenceImages.find(
    (candidate) => candidate.role === params.role && candidate.assetId === params.assetId,
  );
  if (!image) {
    throw new Error(`Conditioning ${params.role} asset is not resolved for the provider manifest.`);
  }
  return image;
};

/**
 * Converts resolved server-side bytes into the semantic input order requested
 * by ModelConditioning. No provider multipart names or URLs are introduced.
 */
export function buildProviderImageManifest(params: {
  conditioning?: ModelConditioning | null;
  targetImage: ResolvedGenerationImageSource | null;
  referenceImages: readonly ResolvedGenerationReferenceImage[];
  maskImage: ResolvedGenerationImageSource | null;
  evidenceImages?: readonly ProviderImageInput[];
}): ProviderImageInput[] {
  const evidenceImages = params.evidenceImages ?? [];
  if (!params.conditioning) {
    return [
      ...(params.targetImage
        ? [toProviderImage({ role: "authoritative_source", source: params.targetImage, required: true })]
        : []),
      ...params.referenceImages.map((reference) =>
        toProviderImage({ role: "reference", source: reference, required: true }),
      ),
      ...(params.maskImage
        ? [toProviderImage({ role: "protected_region", source: params.maskImage, required: true })]
        : []),
    ];
  }

  if (!params.targetImage) {
    throw new Error("Conditioning manifest requires its authoritative source bytes.");
  }
  const sourceAssetId = params.conditioning.authoritativeSource.image.assetId;
  if (params.targetImage.assetId !== sourceAssetId) {
    throw new Error("Resolved authoritative source bytes do not match the conditioning source asset.");
  }

  const cameraGuide = assertResolvedEvidenceRole({
    role: "camera_guide",
    assetId: params.conditioning.sceneEvidence.coarseCameraGuide?.assetId,
    evidenceImages,
  });
  const uncertaintyGuide = assertResolvedEvidenceRole({
    role: "uncertainty_guide",
    assetId: params.conditioning.sceneEvidence.uncertaintyMask?.assetId,
    evidenceImages,
  });
  const protectedMaskAssetId = params.conditioning.sceneEvidence.protectedRegionMask?.assetId;
  if (protectedMaskAssetId && params.maskImage?.assetId !== protectedMaskAssetId) {
    throw new Error("Conditioning protected-region mask is not resolved from its expected asset.");
  }
  if (params.maskImage && !protectedMaskAssetId) {
    throw new Error("A provider mask cannot be used unless it is represented in ModelConditioning.");
  }

  const references = params.conditioning.referenceImages.map((reference) => {
    const resolved = findResolvedReference({
      assetId: reference.image.assetId,
      contextId: reference.contextId,
      references: params.referenceImages,
    });
    if (!resolved) {
      throw new Error(`Conditioning reference ${reference.contextId} is not resolved for the provider manifest.`);
    }
    return toProviderImage({ role: "reference", source: resolved, assetId: reference.image.assetId, required: reference.required });
  });

  return [
    toProviderImage({
      role: "authoritative_source",
      source: params.targetImage,
      assetId: sourceAssetId,
      required: true,
    }),
    ...(cameraGuide ? [cameraGuide] : []),
    ...(uncertaintyGuide ? [uncertaintyGuide] : []),
    ...references,
    ...(params.maskImage
      ? [toProviderImage({
          role: "protected_region",
          source: params.maskImage,
          assetId: protectedMaskAssetId,
          required: true,
        })]
      : []),
  ];
}
