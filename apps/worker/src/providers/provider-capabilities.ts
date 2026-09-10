/*
 * Flow: Benchmarks provider adapters against one immutable conditioning packet.
 * It is intentionally capability-only: adding a provider never changes the
 * source, prompt, evidence, or candidate-selection contracts used for another.
 */

import type {
  ConditioningImageRole,
  ModelConditioning,
  ProviderConditioningBenchmark,
  ProviderConditioningCapability,
} from "@carver/shared";

export const OPENAI_IMAGE_PROVIDER_CAPABILITY: ProviderConditioningCapability = {
  providerId: "openai-images",
  supportsImageEdit: true,
  supportsOrderedImageRoles: true,
  supportsNativeProtectedMask: true,
  maximumInputImages: 16,
  maximumCandidatesPerRequest: 4,
};

/** A deterministic local adapter profile used only by contract/benchmark tests. */
export const FIXTURE_MULTIMODAL_PROVIDER_CAPABILITY: ProviderConditioningCapability = {
  providerId: "fixture-multimodal",
  supportsImageEdit: true,
  supportsOrderedImageRoles: true,
  supportsNativeProtectedMask: false,
  maximumInputImages: 16,
  maximumCandidatesPerRequest: 4,
};

export const benchmarkProviderConditioning = (params: {
  conditioning: Pick<ModelConditioning, "conditioningHash">;
  orderedRoles: readonly ConditioningImageRole[];
  candidates: number;
  providers: readonly ProviderConditioningCapability[];
}): ProviderConditioningBenchmark[] =>
  [...params.providers]
    .sort((left, right) => left.providerId.localeCompare(right.providerId))
    .map((provider) => {
      const unsupportedRequirements = [
        ...(provider.supportsImageEdit ? [] : ["image_edit"]),
        ...(provider.supportsOrderedImageRoles ? [] : ["ordered_image_roles"]),
        ...(params.orderedRoles.includes("protected_region") && !provider.supportsNativeProtectedMask
          ? ["protected_region_mask"]
          : []),
        ...(params.orderedRoles.length > provider.maximumInputImages ? ["input_image_limit"] : []),
        ...(params.candidates > provider.maximumCandidatesPerRequest ? ["candidate_limit"] : []),
      ];
      return {
        providerId: provider.providerId,
        conditioningHash: params.conditioning.conditioningHash,
        supported: unsupportedRequirements.length === 0,
        unsupportedRequirements,
      };
    });
