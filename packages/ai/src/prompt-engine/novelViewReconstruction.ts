import type {
  CameraSpec,
  CameraShotDirective,
  ChangeAngleOperation,
  ImageGenerationRequest,
  ReconstructionRisk,
} from "@carver/shared";

export type CameraSemantic = {
  horizontalView: string;
  rotationDescription: string;
  verticalView: string;
  elevationDescription: string;
  perspectiveDescription: string;
  distanceDescription: string;
  raw: {
    azimuthDeg: number;
    elevationDeg: number;
    distanceM?: number;
    lensMm?: number;
  };
};

export type ChangeAnglePromptInput = {
  shot: ChangeAngleOperation["shot"];
  sceneName?: string;
  additionalUserInstruction?: string | null;
};

export function normalizeAngle(angle: number): number {
  let value = angle % 360;
  if (value > 180) value -= 360;
  if (value <= -180) value += 360;
  return value;
}

export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getHorizontalView(azimuth: number): string {
  const absolute = Math.abs(azimuth);
  if (absolute <= 10) return "front view";
  if (absolute <= 25) return azimuth < 0 ? "slightly front-left view" : "slightly front-right view";
  if (absolute <= 60) return azimuth < 0 ? "front-left three-quarter view" : "front-right three-quarter view";
  if (absolute <= 110) return azimuth < 0 ? "left-side view" : "right-side view";
  if (absolute < 165) return azimuth < 0 ? "rear-left three-quarter view" : "rear-right three-quarter view";
  return "rear view";
}

function getRotationDescription(azimuth: number): string {
  if (Math.abs(azimuth) <= 2) {
    return "aligned with the defined front direction";
  }
  const direction = azimuth < 0 ? "toward the left side" : "toward the right side";
  return `approximately ${Math.abs(Math.round(azimuth))}° around the scene center ${direction}`;
}

function getVerticalView(elevation: number): string {
  if (elevation <= -20) return "low-angle view";
  if (elevation < -5) return "slightly low-angle view";
  if (elevation <= 5) return "eye-level view";
  if (elevation <= 20) return "slightly elevated view";
  if (elevation <= 45) return "elevated oblique view";
  if (elevation < 75) return "high oblique view";
  return "near top-down view";
}

function getElevationDescription(elevation: number): string {
  if (elevation === 0) return "keep the camera nearly level with the scene";
  if (elevation > 0) {
    return `view the scene from approximately ${Math.abs(elevation)}° above the horizontal plane`;
  }
  return `view the scene from approximately ${Math.abs(elevation)}° below the horizontal plane`;
}

function getLensDescription(lens: number): string {
  if (lens <= 20) {
    return [
      `very wide architectural perspective comparable to a ${lens} mm full-frame lens`,
      "wide field of view",
      "avoid fisheye distortion",
    ].join(", ");
  }
  if (lens <= 28) {
    return [
      `wide architectural perspective comparable to a ${lens} mm full-frame lens`,
      "retain believable perspective depth",
      "avoid exaggerated edge distortion",
    ].join(", ");
  }
  if (lens <= 40) {
    return [
      `natural moderately wide architectural perspective comparable to a ${lens} mm full-frame lens`,
      "balanced depth",
      "limited perspective distortion",
    ].join(", ");
  }
  if (lens <= 60) {
    return [
      `natural perspective comparable to a ${lens} mm full-frame lens`,
      "realistic proportions",
      "moderate depth compression",
    ].join(", ");
  }
  return [
    `compressed perspective comparable to a ${lens} mm full-frame lens`,
    "limited field of view",
    "preserve realistic object proportions",
  ].join(", ");
}

function getDistanceDescription(distanceM?: number): string {
  if (distanceM == null) return "preserve a natural framing distance";
  if (distanceM <= 4) return "close camera framing";
  if (distanceM <= 10) return "medium-distance framing";
  if (distanceM <= 20) return "moderately distant framing";
  return "distant establishing framing";
}

export function compileCameraSemantic(shot: ChangeAngleOperation["shot"]): CameraSemantic {
  const azimuth = normalizeAngle(shot.azimuthDeg);
  const elevation = Math.abs(shot.elevationDeg) < 1 ? 0 : Math.round(shot.elevationDeg);
  const lens = shot.lensMm ?? 35;

  return {
    horizontalView: getHorizontalView(azimuth),
    rotationDescription: getRotationDescription(azimuth),
    verticalView: getVerticalView(elevation),
    elevationDescription: getElevationDescription(elevation),
    perspectiveDescription: getLensDescription(lens),
    distanceDescription: getDistanceDescription(shot.distanceM),
    raw: {
      azimuthDeg: round(azimuth, 1),
      elevationDeg: round(elevation, 1),
      distanceM: shot.distanceM == null ? undefined : round(shot.distanceM, 1),
      lensMm: lens,
    },
  };
}

export function getReconstructionRisk(azimuthDeg: number): ReconstructionRisk {
  const angle = Math.abs(normalizeAngle(azimuthDeg));
  if (angle <= 20) return "low";
  if (angle <= 45) return "moderate";
  if (angle <= 90) return "high";
  return "very_high";
}

export function buildNovelViewRiskInstruction(azimuthDeg: number): string {
  const risk = getReconstructionRisk(azimuthDeg);
  if (risk === "low") return "";
  if (risk === "moderate") {
    return [
      "The changed viewpoint exposes additional scene geometry.",
      "Preserve recognizable geometry carefully and avoid unnecessary completion.",
    ].join("\n");
  }
  if (risk === "high") {
    return [
      "A substantial viewpoint change is requested.",
      "",
      "Large portions of the scene may become newly visible.",
      "Reconstruct hidden geometry conservatively using only evidence available from the provided references.",
      "",
      "Do not invent additional landscape features to compensate for missing information.",
    ].join("\n");
  }
  return [
    "This is a major novel-view reconstruction.",
    "",
    "The source image does not provide complete visual evidence for every newly visible surface.",
    "",
    "Prioritize scene identity and conservative geometric continuation over decorative completeness.",
    "",
    "Do not invent new landscape design elements.",
    "",
    "If geometry is uncertain, prefer simple continuation of known nearby geometry and materials.",
  ].join("\n");
}

export function toChangeAngleOperation(params: {
  shot: CameraShotDirective;
  targetId: string;
  targetName?: string;
}): ChangeAngleOperation | null {
  if (params.shot.mode !== "orbit" || !params.shot.orbit) return null;
  return {
    operation: "novel_view_reconstruction",
    executionMode: "image_edit",
    shot: {
      id: params.shot.shotId,
      name: params.shot.shotName,
      mode: "orbit",
      azimuthDeg: params.shot.orbit.rotate,
      elevationDeg: params.shot.orbit.tilt,
      distanceM: params.shot.orbit.distance,
      lensMm: params.shot.orbit.lens,
      target: "scene_center",
    },
    scene: {
      targetId: params.targetId,
      targetName: params.targetName,
    },
  };
}

export function buildChangeAnglePrompt(input: ChangeAnglePromptInput): string {
  const camera = compileCameraSemantic(input.shot);
  const { azimuthDeg, elevationDeg, distanceM, lensMm } = camera.raw;
  const cameraMetadata = [
    `azimuth ${azimuthDeg}°`,
    `elevation ${elevationDeg}°`,
    distanceM == null ? null : `virtual distance ${distanceM} m`,
    lensMm == null ? null : `${lensMm} mm lens equivalent`,
  ].filter(Boolean).join(", ");
  const riskInstruction = buildNovelViewRiskInstruction(input.shot.azimuthDeg);
  const additionalInstruction = input.additionalUserInstruction?.trim()
    ? [
        "ADDITIONAL USER INSTRUCTION",
        "",
        input.additionalUserInstruction.trim(),
        "",
        "The additional instruction must not override the camera definition or preservation rules unless Carver's policy layer explicitly authorizes such changes.",
      ].join("\n")
    : "";

  return `
TASK

Create a novel camera view of the exact same physical site shown in the provided source image.

This is a VIEWPOINT RECONSTRUCTION task.
It is not a landscape redesign, restyling task, or scene replacement.


SOURCE OF TRUTH

Treat the provided source image as the authoritative visual anchor for:

- scene identity
- architecture
- site layout
- hardscape
- paths
- water features
- rocks
- planting areas
- vegetation
- object identity
- relative object positions
- proportions
- scale relationships
- materials
- colors
- texture character
- lighting character
- time-of-day appearance

The output must represent the same physical property and the same landscape design.

TARGET CAMERA VIEW

Reconstruct the scene from a ${camera.horizontalView}.

Move the viewpoint ${camera.rotationDescription}.

Use a ${camera.verticalView} and ${camera.elevationDescription}.

Use ${camera.distanceDescription}.

Use a ${camera.perspectiveDescription}.

Aim the camera toward the same visual center of the scene.

Carver camera metadata:
${cameraMetadata}

Use the semantic camera description above as the primary visual instruction.
The numeric camera metadata expresses the intended virtual camera state and should not be interpreted as requiring exact 3D rendering.


VIEWPOINT TRANSFORMATION

Reconstruct how the SAME physical environment would appear when photographed from the requested camera position.

Apply realistic:

- perspective change
- parallax
- foreground/background displacement
- depth relationships
- visibility changes
- occlusion changes
- framing changes

Do not simulate the new viewpoint by rearranging the scene.

The SITE remains fixed.
Only the CAMERA moves.


PRESERVATION PRIORITY

Highest priority:

1. Preserve architecture identity and structural geometry.
2. Preserve the site layout and overall footprint.
3. Preserve major objects and their relative positions.
4. Preserve proportions and scale relationships.

High priority:

5. Preserve paths, paving, ponds, rocks, walls, planting beds, and other hardscape.
6. Preserve vegetation locations and recognizable plant character.
7. Preserve materials, colors, and texture identity.
8. Preserve the overall lighting and environmental character.

Secondary priority:

9. Preserve small foliage details whenever observable.
10. Approximate only details that cannot be determined from the source image.


NEWLY REVEALED AREAS

Changing camera position may reveal surfaces or areas that were hidden in the source image.

For these areas:

Infer only the MINIMUM plausible continuation required to produce a physically coherent view of the same site.

Extend nearby visible geometry, materials, surfaces, architecture, paving, and planting patterns conservatively and consistently.

Do not introduce a new design concept.

Do not add decorative elements simply to fill empty or newly visible regions.

When uncertain, prefer conservative reconstruction over creative completion.
${riskInstruction ? `\n${riskInstruction}\n` : ""}

DO NOT

Unless a directly approved operation in ADDITIONAL USER INSTRUCTION requires it, do not:

- redesign the landscape
- restyle the property
- replace objects
- move existing objects
- resize objects without perspective justification
- add new landscape features
- remove existing landscape features
- mirror the scene
- rotate the entire site
- rotate objects to imitate the requested camera angle
- relocate paths
- relocate vegetation
- relocate buildings
- alter the site footprint
- invent new structures
- change materials unnecessarily
- change the scene into another property
- alter the environment merely to improve composition


CAMERA CONSISTENCY

The camera instruction controls viewpoint, perspective, parallax, visibility, occlusion, and framing.

It does NOT authorize changes to the physical site.

The new image should appear as if a photographer physically moved around the SAME real-world landscape and took another photograph.


MINIMUM-CHANGE PRINCIPLE

Make only the visual changes required by the new camera viewpoint.

If an element can remain unchanged while still being geometrically plausible from the new view, preserve it.

When source information is insufficient, make the smallest plausible inference.


SUCCESS CRITERIA

A successful result should look like:

"Another photograph of the exact same site taken from the requested camera position."

It should NOT look like:

"A newly generated landscape inspired by the source image."


${additionalInstruction}
`.trim();
}

export function buildNovelViewGenerationRequest(params: {
  operation: ChangeAngleOperation;
  sourceImageId: string;
  prompt: string;
  cameraSpec?: CameraSpec;
}): ImageGenerationRequest {
  return {
    operation: "novel_view_reconstruction",
    sourceImageId: params.sourceImageId,
    shotId: params.operation.shot.id,
    camera: {
      mode: "orbit",
      azimuthDeg: params.operation.shot.azimuthDeg,
      elevationDeg: params.operation.shot.elevationDeg,
      distanceM: params.operation.shot.distanceM,
      lensMm: params.operation.shot.lensMm,
      target: "scene_center",
    },
    cameraSpec: params.cameraSpec,
    prompt: params.prompt,
    policy: {
      preserveSceneIdentity: true,
      preserveLayout: true,
      preserveObjectPositions: true,
      preserveMaterials: true,
      allowRedesign: false,
      allowRelocation: false,
      allowMirroring: false,
    },
  };
}
