/** Shared Image Generator aspect-ratio contracts and deterministic geometry. */

export const IMAGE_GENERATOR_ASPECT_RATIO_VALUES = [
  "auto",
  "1:1",
  "21:9",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "4:5",
  "5:4",
  "3:2",
  "2:3",
] as const;

export type ImageGeneratorAspectRatio = (typeof IMAGE_GENERATOR_ASPECT_RATIO_VALUES)[number];
export type ResolvedImageGeneratorAspectRatio = Exclude<ImageGeneratorAspectRatio, "auto">;

type ImageGeneratorAspectRatioDefinition = {
  value: ResolvedImageGeneratorAspectRatio;
  width: number;
  height: number;
  providerSize: "1024x1024" | "1536x1024" | "1024x1536";
};

const ASPECT_RATIO_DEFINITIONS: readonly ImageGeneratorAspectRatioDefinition[] = [
  { value: "1:1", width: 1, height: 1, providerSize: "1024x1024" },
  { value: "21:9", width: 21, height: 9, providerSize: "1536x1024" },
  { value: "16:9", width: 16, height: 9, providerSize: "1536x1024" },
  { value: "9:16", width: 9, height: 16, providerSize: "1024x1536" },
  { value: "4:3", width: 4, height: 3, providerSize: "1536x1024" },
  { value: "3:4", width: 3, height: 4, providerSize: "1024x1536" },
  { value: "4:5", width: 4, height: 5, providerSize: "1024x1536" },
  { value: "5:4", width: 5, height: 4, providerSize: "1536x1024" },
  { value: "3:2", width: 3, height: 2, providerSize: "1536x1024" },
  { value: "2:3", width: 2, height: 3, providerSize: "1024x1536" },
];

export const IMAGE_GENERATOR_ASPECT_RATIO_OPTIONS = [
  { value: "auto", label: "Auto" },
  ...ASPECT_RATIO_DEFINITIONS.map(({ value }) => ({ value, label: value })),
] as const satisfies readonly { value: ImageGeneratorAspectRatio; label: string }[];

export const IMAGE_GENERATOR_DEFAULT_SHORT_SIDE = 520;
export const IMAGE_GENERATOR_MIN_SHORT_SIDE = 360;
export const IMAGE_GENERATOR_MAX_LONG_SIDE = 850;

export function isImageGeneratorAspectRatio(value: unknown): value is ImageGeneratorAspectRatio {
  return typeof value === "string" && IMAGE_GENERATOR_ASPECT_RATIO_VALUES.includes(value as ImageGeneratorAspectRatio);
}

export function getImageGeneratorAspectRatioValue(ratio: ResolvedImageGeneratorAspectRatio) {
  const definition = ASPECT_RATIO_DEFINITIONS.find((item) => item.value === ratio);
  return definition ? definition.width / definition.height : 1;
}

export function getImageGeneratorProviderSize(ratio: ResolvedImageGeneratorAspectRatio) {
  return ASPECT_RATIO_DEFINITIONS.find((item) => item.value === ratio)?.providerSize ?? "1024x1024";
}

export function resolveImageGeneratorAspectRatio(params: {
  requested: ImageGeneratorAspectRatio | null | undefined;
  inputWidth?: number | null;
  inputHeight?: number | null;
}): ResolvedImageGeneratorAspectRatio {
  if (params.requested && params.requested !== "auto" && isImageGeneratorAspectRatio(params.requested)) {
    return params.requested;
  }

  const width = params.inputWidth ?? 0;
  const height = params.inputHeight ?? 0;
  if (width <= 0 || height <= 0) return "1:1";

  const inputRatio = width / height;
  return ASPECT_RATIO_DEFINITIONS.reduce((closest, candidate) => {
    const candidateDistance = Math.abs(Math.log(inputRatio / (candidate.width / candidate.height)));
    const closestDistance = Math.abs(
      Math.log(inputRatio / (closest.width / closest.height)),
    );
    return candidateDistance < closestDistance ? candidate : closest;
  }).value;
}

export function getImageGeneratorCardSize(params: {
  ratio: ResolvedImageGeneratorAspectRatio;
  shortSide?: number;
}) {
  const definition = ASPECT_RATIO_DEFINITIONS.find((item) => item.value === params.ratio) ?? ASPECT_RATIO_DEFINITIONS[0];
  const shortUnits = Math.min(definition.width, definition.height);
  const longUnits = Math.max(definition.width, definition.height);
  const requestedShortSide = params.shortSide ?? IMAGE_GENERATOR_DEFAULT_SHORT_SIDE;
  const minScale = Math.ceil(IMAGE_GENERATOR_MIN_SHORT_SIDE / shortUnits);
  const maxScale = Math.floor(IMAGE_GENERATOR_MAX_LONG_SIDE / longUnits);
  const scale = Math.min(
    Math.max(Math.round(requestedShortSide / shortUnits), minScale),
    maxScale,
  );

  return { width: definition.width * scale, height: definition.height * scale };
}

export function getImageGeneratorRatioLockedSize(params: {
  ratio: ResolvedImageGeneratorAspectRatio;
  startWidth: number;
  startHeight: number;
  deltaX: number;
  deltaY: number;
}) {
  const proposedWidth = params.startWidth + params.deltaX;
  const proposedHeight = params.startHeight + params.deltaY;
  const scaleFromWidth = proposedWidth / Math.max(params.startWidth, 1);
  const scaleFromHeight = proposedHeight / Math.max(params.startHeight, 1);
  const scale = Math.abs(scaleFromWidth - 1) >= Math.abs(scaleFromHeight - 1)
    ? scaleFromWidth
    : scaleFromHeight;
  const ratioValue = getImageGeneratorAspectRatioValue(params.ratio);
  const startingShortSide = ratioValue >= 1 ? params.startHeight : params.startWidth;
  const requestedShortSide = startingShortSide * scale;
  return getImageGeneratorCardSize({ ratio: params.ratio, shortSide: requestedShortSide });
}

export function shouldCreateImageOutputGallery(assetIds: readonly (string | null | undefined)[]) {
  return assetIds.filter((assetId) => typeof assetId === "string" && assetId.trim().length > 0).length >= 2;
}
