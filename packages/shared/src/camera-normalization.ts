import {
  CAMERA_NORMALIZATION_VERSION,
  CAMERA_SPEC_CONVENTION,
  CAMERA_SPEC_SCHEMA_VERSION,
  type CameraPose,
  type CameraProvenance,
  type CameraSpec,
  type CameraVector2,
  type CameraVector3,
  type LegacyCameraAdaptationOptions,
  type LegacyCameraShot,
  type LegacyPlanWorldSize,
} from "./novel-view";

const EPSILON = 0.000_001;
const ROUNDING_PRECISION = 1_000_000_000_000;
const DEFAULT_SENSOR_WIDTH_MM = 36;

export class CameraNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CameraNormalizationError";
  }
}

export type CameraSpecNormalizationInput = Omit<
  CameraSpec,
  "schemaVersion" | "normalizationVersion" | "convention" | "virtualScale"
> & {
  readonly schemaVersion?: number;
  readonly normalizationVersion?: string;
  readonly convention?: string;
  readonly virtualScale?: Partial<CameraSpec["virtualScale"]>;
};

const canonicalNumber = (value: number, field: string) => {
  if (!Number.isFinite(value)) {
    throw new CameraNormalizationError(`${field} must be a finite number.`);
  }

  const rounded = Math.round(value * ROUNDING_PRECISION) / ROUNDING_PRECISION;
  if (!Number.isFinite(rounded)) {
    throw new CameraNormalizationError(`${field} cannot be represented safely by the camera normalizer.`);
  }
  return Object.is(rounded, -0) ? 0 : rounded;
};

const requirePositive = (value: number, field: string) => {
  const normalized = canonicalNumber(value, field);
  if (normalized <= 0) {
    throw new CameraNormalizationError(`${field} must be greater than zero.`);
  }
  return normalized;
};

const normalizeVector3 = (vector: CameraVector3, field: string): CameraVector3 => {
  if (!Array.isArray(vector) || vector.length !== 3) {
    throw new CameraNormalizationError(`${field} must contain exactly three coordinates.`);
  }
  return [
    canonicalNumber(vector[0], `${field}[0]`),
    canonicalNumber(vector[1], `${field}[1]`),
    canonicalNumber(vector[2], `${field}[2]`),
  ];
};

const normalizeVector2 = (vector: CameraVector2, field: string): CameraVector2 => {
  if (!Array.isArray(vector) || vector.length !== 2) {
    throw new CameraNormalizationError(`${field} must contain exactly two coordinates.`);
  }
  return [canonicalNumber(vector[0], `${field}[0]`), canonicalNumber(vector[1], `${field}[1]`)];
};

const subtract = (left: CameraVector3, right: CameraVector3): CameraVector3 => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
];

const cross = (left: CameraVector3, right: CameraVector3): CameraVector3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const magnitude = (vector: CameraVector3) => Math.hypot(vector[0], vector[1], vector[2]);

const normalizeDirection = (vector: CameraVector3, field: string): CameraVector3 => {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length < EPSILON) {
    throw new CameraNormalizationError(`${field} must have a non-zero length.`);
  }

  return [
    canonicalNumber(vector[0] / length, `${field}[0]`),
    canonicalNumber(vector[1] / length, `${field}[1]`),
    canonicalNumber(vector[2] / length, `${field}[2]`),
  ];
};

const degreesToRadians = (value: number) => (value * Math.PI) / 180;

/** Returns a canonical azimuth in [-180, 180), making 0 and 360 identical. */
export const normalizeAzimuthDeg = (value: number) => {
  const finite = canonicalNumber(value, "azimuthDeg");
  const normalized = ((finite + 180) % 360 + 360) % 360 - 180;
  return canonicalNumber(normalized, "azimuthDeg");
};

export const focalLengthToHorizontalFov = (params: {
  focalLengthMm: number;
  sensorWidthMm?: number;
}) => {
  const focalLengthMm = requirePositive(params.focalLengthMm, "focalLengthMm");
  const sensorWidthMm = requirePositive(params.sensorWidthMm ?? DEFAULT_SENSOR_WIDTH_MM, "sensorWidthMm");
  return canonicalNumber(
    (2 * Math.atan(sensorWidthMm / (2 * focalLengthMm)) * 180) / Math.PI,
    "horizontalFovDeg",
  );
};

export const horizontalToVerticalFov = (params: {
  horizontalFovDeg: number;
  aspectRatio: number;
}) => {
  const horizontalFovDeg = canonicalNumber(params.horizontalFovDeg, "horizontalFovDeg");
  if (horizontalFovDeg <= 0 || horizontalFovDeg >= 180) {
    throw new CameraNormalizationError("horizontalFovDeg must be greater than 0 and less than 180.");
  }
  const aspectRatio = requirePositive(params.aspectRatio, "aspectRatio");
  return canonicalNumber(
    (2 * Math.atan(Math.tan(degreesToRadians(horizontalFovDeg) / 2) / aspectRatio) * 180) / Math.PI,
    "verticalFovDeg",
  );
};

/** Builds an orbit pose in the canonical right-handed, Y-up frame. */
export const orbitCamera = (params: {
  azimuthDeg: number;
  elevationDeg: number;
  distance: number;
}): CameraPose => {
  const azimuthDeg = normalizeAzimuthDeg(params.azimuthDeg);
  const elevationDeg = canonicalNumber(params.elevationDeg, "elevationDeg");
  if (elevationDeg <= -89.999 || elevationDeg >= 89.999) {
    throw new CameraNormalizationError("elevationDeg must stay between -89.999 and 89.999 degrees.");
  }
  const distance = requirePositive(params.distance, "distance");
  const azimuthRad = degreesToRadians(azimuthDeg);
  const elevationRad = degreesToRadians(elevationDeg);
  const cosElevation = Math.cos(elevationRad);

  return {
    position: [
      canonicalNumber(distance * Math.sin(azimuthRad) * cosElevation, "position[0]"),
      canonicalNumber(distance * Math.sin(elevationRad), "position[1]"),
      canonicalNumber(distance * Math.cos(azimuthRad) * cosElevation, "position[2]"),
    ],
    target: [0, 0, 0],
    up: [0, 1, 0],
  };
};

const normalizeProvenance = (provenance: CameraProvenance): CameraProvenance => {
  const origin = provenance.origin;
  if (!["user_authored", "captured", "model_estimate", "geometric_derivation", "generated"].includes(origin)) {
    throw new CameraNormalizationError("provenance.origin is invalid.");
  }
  const method = provenance.method.trim();
  const version = provenance.version.trim();
  if (!method || !version) {
    throw new CameraNormalizationError("provenance.method and provenance.version are required.");
  }
  const inputAssetIds = provenance.inputAssetIds.map((assetId) => assetId.trim()).filter(Boolean);
  if (inputAssetIds.length !== provenance.inputAssetIds.length) {
    throw new CameraNormalizationError("provenance.inputAssetIds cannot contain empty values.");
  }
  const assumptions = provenance.assumptions.map((assumption) => assumption.trim()).filter(Boolean);
  if (assumptions.length !== provenance.assumptions.length) {
    throw new CameraNormalizationError("provenance.assumptions cannot contain empty values.");
  }

  return { origin, inputAssetIds, method, version, assumptions };
};

const normalizeAuthored = (authored: CameraSpec["authored"]) => {
  if (!authored) return undefined;

  const result: {
    azimuthDeltaDeg?: number;
    elevationDeltaDeg?: number;
    distanceRatio?: number;
    focalLengthEquivalentMm?: number;
    rollDeg?: number;
  } = {};
  if (authored.azimuthDeltaDeg != null) result.azimuthDeltaDeg = normalizeAzimuthDeg(authored.azimuthDeltaDeg);
  if (authored.elevationDeltaDeg != null) result.elevationDeltaDeg = canonicalNumber(authored.elevationDeltaDeg, "authored.elevationDeltaDeg");
  if (authored.distanceRatio != null) result.distanceRatio = requirePositive(authored.distanceRatio, "authored.distanceRatio");
  if (authored.focalLengthEquivalentMm != null) result.focalLengthEquivalentMm = requirePositive(authored.focalLengthEquivalentMm, "authored.focalLengthEquivalentMm");
  if (authored.rollDeg != null) result.rollDeg = normalizeAzimuthDeg(authored.rollDeg);
  return result;
};

/**
 * Validates and canonicalizes a CameraSpec without inventing calibration.
 * Invalid inputs fail closed instead of producing a camera with NaN values.
 */
export const normalizeCameraSpec = (input: CameraSpecNormalizationInput): CameraSpec => {
  if (input.schemaVersion != null && input.schemaVersion !== CAMERA_SPEC_SCHEMA_VERSION) {
    throw new CameraNormalizationError(`Unsupported CameraSpec schema version: ${input.schemaVersion}.`);
  }
  if (input.normalizationVersion != null && input.normalizationVersion !== CAMERA_NORMALIZATION_VERSION) {
    throw new CameraNormalizationError(`Unsupported camera normalization version: ${input.normalizationVersion}.`);
  }
  if (input.convention != null && input.convention !== CAMERA_SPEC_CONVENTION) {
    throw new CameraNormalizationError(`Unsupported camera convention: ${input.convention}.`);
  }
  if (input.coordinateSpace !== "source_relative" && input.coordinateSpace !== "plan_world") {
    throw new CameraNormalizationError("coordinateSpace must be source_relative or plan_world.");
  }

  const position = normalizeVector3(input.pose.position, "pose.position");
  const target = normalizeVector3(input.pose.target, "pose.target");
  const up = normalizeDirection(normalizeVector3(input.pose.up, "pose.up"), "pose.up");
  const forward = normalizeDirection(subtract(target, position), "camera forward direction");
  if (magnitude(cross(forward, up)) < EPSILON) {
    throw new CameraNormalizationError("pose.up cannot be parallel to the camera forward direction.");
  }

  const horizontalFovDeg = canonicalNumber(input.projection.horizontalFovDeg, "projection.horizontalFovDeg");
  if (horizontalFovDeg <= 0 || horizontalFovDeg >= 180) {
    throw new CameraNormalizationError("projection.horizontalFovDeg must be greater than 0 and less than 180.");
  }
  const aspectRatio = requirePositive(input.projection.aspectRatio, "projection.aspectRatio");
  const principalPointUv = normalizeVector2(input.projection.principalPointUv, "projection.principalPointUv");
  if (principalPointUv.some((coordinate) => coordinate < 0 || coordinate > 1)) {
    throw new CameraNormalizationError("projection.principalPointUv must stay within [0, 1].");
  }
  if (input.projection.model !== "pinhole") {
    throw new CameraNormalizationError("projection.model must be pinhole.");
  }
  if (!["preserve_subject", "preserve_footprint", "custom"].includes(input.framingMode)) {
    throw new CameraNormalizationError("framingMode is invalid.");
  }

  const expectedReference = input.coordinateSpace === "source_relative" ? "source_frame" : "plan_frame";
  if (
    input.virtualScale &&
    (input.virtualScale.unit !== "relative" ||
      input.virtualScale.calibration !== "uncalibrated" ||
      input.virtualScale.reference !== expectedReference)
  ) {
    throw new CameraNormalizationError("virtualScale must explicitly remain uncalibrated relative units for its coordinate space.");
  }

  return {
    schemaVersion: CAMERA_SPEC_SCHEMA_VERSION,
    normalizationVersion: CAMERA_NORMALIZATION_VERSION,
    convention: CAMERA_SPEC_CONVENTION,
    coordinateSpace: input.coordinateSpace,
    pose: { position, target, up },
    projection: {
      model: "pinhole",
      horizontalFovDeg,
      aspectRatio,
      principalPointUv,
    },
    framingMode: input.framingMode,
    virtualScale: {
      unit: "relative",
      calibration: "uncalibrated",
      reference: expectedReference,
    },
    authored: normalizeAuthored(input.authored),
    provenance: normalizeProvenance(input.provenance),
  };
};

const normalizePlanWorldSize = (size: LegacyPlanWorldSize | undefined): LegacyPlanWorldSize => {
  if (!size) {
    throw new CameraNormalizationError("Legacy plan shots require an explicit planWorldSize.");
  }
  return {
    width: requirePositive(size.width, "planWorldSize.width"),
    depth: requirePositive(size.depth, "planWorldSize.depth"),
  };
};

const planPointToLegacyWorld = (params: { u: number; v: number; elevation: number; size: LegacyPlanWorldSize }): CameraVector3 => [
  canonicalNumber((canonicalNumber(params.u, "plan.u") - 0.5) * params.size.width, "legacyPlan.position.x"),
  canonicalNumber((0.5 - canonicalNumber(params.v, "plan.v")) * params.size.depth, "legacyPlan.position.y"),
  canonicalNumber(params.elevation, "legacyPlan.position.z"),
];

/** Preserves handedness while adapting the legacy Three.js Z-up plan frame. */
const legacyPlanZUpToCanonicalYUp = (point: CameraVector3): CameraVector3 => [point[0], point[2], -point[1]];

const buildLegacyProvenance = (params: {
  options: LegacyCameraAdaptationOptions;
  method: string;
  assumptions: string[];
}): CameraProvenance => ({
  origin: params.options.provenance?.origin ?? "geometric_derivation",
  inputAssetIds: params.options.provenance?.inputAssetIds ?? params.options.inputAssetIds ?? [],
  method: params.options.provenance?.method ?? params.method,
  version: params.options.provenance?.version ?? CAMERA_NORMALIZATION_VERSION,
  assumptions: [
    ...(params.options.provenance?.assumptions ?? []),
    ...params.assumptions,
  ],
});

/**
 * Converts the existing plan/orbit shot payload into a versioned CameraSpec.
 * It intentionally records source-relative virtual scale rather than metres.
 */
export const adaptLegacyCameraShot = (
  shot: LegacyCameraShot,
  options: LegacyCameraAdaptationOptions = {},
): CameraSpec => {
  const aspectRatio = requirePositive(options.aspectRatio ?? 1, "aspectRatio");
  const framingMode = options.framingMode ?? (shot.mode === "plan" ? "preserve_footprint" : "preserve_subject");

  if (shot.mode === "orbit") {
    if (!shot.orbit || shot.plan) {
      throw new CameraNormalizationError("Legacy orbit shots must contain only an orbit transform.");
    }
    const orbit = shot.orbit;
    const pose = orbitCamera({
      azimuthDeg: orbit.rotate,
      elevationDeg: orbit.tilt,
      distance: orbit.distance,
    });
    const focalLengthEquivalentMm = requirePositive(orbit.lens, "orbit.lens");
    return normalizeCameraSpec({
      coordinateSpace: "source_relative",
      pose,
      projection: {
        model: "pinhole",
        horizontalFovDeg: focalLengthToHorizontalFov({ focalLengthMm: focalLengthEquivalentMm }),
        aspectRatio,
        principalPointUv: [0.5, 0.5],
      },
      framingMode,
      authored: {
        azimuthDeltaDeg: normalizeAzimuthDeg(orbit.rotate),
        elevationDeltaDeg: canonicalNumber(orbit.tilt, "orbit.tilt"),
        distanceRatio: requirePositive(orbit.distance, "orbit.distance"),
        focalLengthEquivalentMm,
      },
      provenance: buildLegacyProvenance({
        options,
        method: "adapt_legacy_orbit_camera_shot",
        assumptions: [
          "Legacy orbit distance is a source-relative virtual unit and is not calibrated in metres.",
          "The legacy orbit target is the source scene center.",
        ],
      }),
    });
  }

  if (!shot.plan || shot.orbit) {
    throw new CameraNormalizationError("Legacy plan shots must contain only a plan transform.");
  }
  const plan = shot.plan;
  const size = normalizePlanWorldSize(options.planWorldSize);
  const camera = planPointToLegacyWorld({
    u: plan.u,
    v: plan.v,
    elevation: canonicalNumber(plan.height, "plan.height"),
    size,
  });
  const targetOnPlan = planPointToLegacyWorld({
    u: plan.targetU,
    v: plan.targetV,
    elevation: 0,
    size,
  });
  const horizontalDistance = Math.hypot(targetOnPlan[0] - camera[0], targetOnPlan[1] - camera[1]);
  const targetElevation = plan.targetHeight == null
    ? canonicalNumber(
        camera[2] + Math.tan(degreesToRadians(canonicalNumber(plan.pitch, "plan.pitch"))) * horizontalDistance,
        "plan.derivedTargetHeight",
      )
    : canonicalNumber(plan.targetHeight, "plan.targetHeight");
  const target: CameraVector3 = [targetOnPlan[0], targetOnPlan[1], targetElevation];
  const focalLengthEquivalentMm = requirePositive(plan.lens, "plan.lens");

  return normalizeCameraSpec({
    coordinateSpace: "plan_world",
    pose: {
      position: legacyPlanZUpToCanonicalYUp(camera),
      target: legacyPlanZUpToCanonicalYUp(target),
      up: [0, 1, 0],
    },
    projection: {
      model: "pinhole",
      horizontalFovDeg: focalLengthToHorizontalFov({ focalLengthMm: focalLengthEquivalentMm }),
      aspectRatio,
      principalPointUv: [0.5, 0.5],
    },
    framingMode,
    authored: {
      focalLengthEquivalentMm,
      rollDeg: plan.roll == null ? 0 : normalizeAzimuthDeg(plan.roll),
    },
    provenance: buildLegacyProvenance({
      options,
      method: "adapt_legacy_plan_camera_shot",
      assumptions: [
        "Applied the handedness-preserving legacy plan transform (x, y, z) -> (x, z, -y).",
        `Legacy plan viewDirection=${plan.viewDirection} is represented by the normalized pose target.`,
        "Legacy plan distances are plan-frame virtual units and are not calibrated in metres.",
      ],
    }),
  });
};
