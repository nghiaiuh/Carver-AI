/*
 * Flow: Defines the worker-only provider adapter boundary.
 * 1. Receive an ordered semantic image manifest with bytes resolved server-side.
 * 2. Let each provider map roles into its own multipart/API conventions.
 * 3. Keep provider transport fields out of shared ModelConditioning contracts.
 */

import type { CarverImageExecutionMode, ConditioningImageRole } from "@carver/shared";

export type ProviderImageInput = {
  readonly role: ConditioningImageRole;
  readonly assetId: string | null;
  readonly required: boolean;
  readonly buffer: Buffer;
  readonly mimeType: string;
};

export type ProviderImageGenerationRequest = {
  readonly prompt: string;
  readonly mode: CarverImageExecutionMode;
  readonly model?: string;
  readonly size?: string;
  readonly outputCount?: number;
  readonly imageManifest: readonly ProviderImageInput[];
};

export type ProviderGeneratedImage = {
  readonly buffer: Buffer;
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
  readonly width: number;
  readonly height: number;
  readonly revisedPrompt: string | null;
  /** The exact resolved model used for this invocation. */
  readonly provider: string;
};

export type ImageProvider = {
  readonly id: string;
  generateImages(request: ProviderImageGenerationRequest): Promise<ProviderGeneratedImage[]>;
};
