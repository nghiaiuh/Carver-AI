import type {
  PromptExecutionMode,
  PromptInterpreterOperationDraft,
  PromptInterpreterResult,
  RequestedReferenceRole,
  SpatialRelation,
} from "@carver/shared";

type JsonSchema = Record<string, unknown>;

const nullableStringSchema = {
  type: ["string", "null"],
} as const;

const nullableNumberSchema = {
  type: ["number", "null"],
} as const;

const stringArraySchema = {
  type: "array",
  items: { type: "string" },
} as const;

const spatialRelationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["relation", "contextId", "description"],
  properties: {
    relation: { type: "string" },
    contextId: nullableStringSchema,
    description: nullableStringSchema,
  },
} as const;

const operationItemProperties = {
  type: { type: "string" },
  objectCategory: nullableStringSchema,
  targetContextId: nullableStringSchema,
  replacementCategory: nullableStringSchema,
  referenceContextId: nullableStringSchema,
  material: nullableStringSchema,
  attribute: nullableStringSchema,
  value: nullableStringSchema,
  style: nullableStringSchema,
  spatialRelation: {
    anyOf: [spatialRelationSchema, { type: "null" }],
  },
  destination: {
    anyOf: [spatialRelationSchema, { type: "null" }],
  },
  dependsOn: stringArraySchema,
  executionGroup: nullableNumberSchema,
} as const;

const operationItemRequired = Object.keys(operationItemProperties);

const REQUESTED_REFERENCE_ROLES: RequestedReferenceRole[] = [
  "style",
  "material",
  "object",
  "layout",
  "composition",
  "unspecified",
];

const EXECUTION_MODES: Array<PromptExecutionMode | "unknown"> = [
  "text_to_image",
  "image_edit",
  "region_edit",
  "unknown",
];

export const PROMPT_INTERPRETATION_JSON_SCHEMA: JsonSchema = {
  name: "carver_prompt_interpretation_v2",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "executionMode",
      "targetHint",
      "operations",
      "references",
      "preserveRequests",
      "avoidRequests",
      "notes",
    ],
    properties: {
      executionMode: {
        type: "string",
        enum: EXECUTION_MODES,
      },
      targetHint: {
        type: ["string", "null"],
      },
      operations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: operationItemRequired,
          properties: operationItemProperties,
        },
      },
      references: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["contextId", "requestedRole"],
          properties: {
            contextId: { type: "string" },
            requestedRole: {
              type: "string",
              enum: REQUESTED_REFERENCE_ROLES,
            },
          },
        },
      },
      preserveRequests: {
        type: "array",
        items: { type: "string" },
      },
      avoidRequests: {
        type: "array",
        items: { type: "string" },
      },
      notes: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  strict: true,
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const spatialRelationValue = (value: unknown): SpatialRelation | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.relation !== "string") {
    return undefined;
  }

  return {
    relation: candidate.relation as SpatialRelation["relation"],
    contextId: typeof candidate.contextId === "string" ? candidate.contextId : undefined,
    description: typeof candidate.description === "string" ? candidate.description : undefined,
  };
};

const operationDraftValue = (value: unknown): PromptInterpreterOperationDraft | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type !== "string") {
    return null;
  }

  return {
    type: candidate.type,
    objectCategory: typeof candidate.objectCategory === "string" ? candidate.objectCategory : undefined,
    targetContextId: typeof candidate.targetContextId === "string" ? candidate.targetContextId : undefined,
    replacementCategory:
      typeof candidate.replacementCategory === "string" ? candidate.replacementCategory : undefined,
    referenceContextId:
      typeof candidate.referenceContextId === "string" ? candidate.referenceContextId : undefined,
    material: typeof candidate.material === "string" ? candidate.material : undefined,
    attribute: typeof candidate.attribute === "string" ? candidate.attribute : undefined,
    value: typeof candidate.value === "string" ? candidate.value : undefined,
    style: typeof candidate.style === "string" ? candidate.style : undefined,
    spatialRelation: spatialRelationValue(candidate.spatialRelation),
    destination: spatialRelationValue(candidate.destination),
    dependsOn: isStringArray(candidate.dependsOn) ? candidate.dependsOn : undefined,
    executionGroup: typeof candidate.executionGroup === "number" ? candidate.executionGroup : undefined,
  };
};

export const validatePromptInterpreterResult = (value: unknown): PromptInterpreterResult | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const executionMode =
    typeof candidate.executionMode === "string" &&
    EXECUTION_MODES.includes(candidate.executionMode as PromptExecutionMode | "unknown")
      ? (candidate.executionMode as PromptExecutionMode | "unknown")
      : "unknown";
  const operations = Array.isArray(candidate.operations)
    ? candidate.operations
        .map(operationDraftValue)
        .filter((operation): operation is PromptInterpreterOperationDraft => operation !== null)
    : [];
  const references = Array.isArray(candidate.references)
    ? candidate.references
        .map((reference) => {
          if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
            return null;
          }
          const current = reference as Record<string, unknown>;
          if (
            typeof current.contextId !== "string" ||
            typeof current.requestedRole !== "string" ||
            !REQUESTED_REFERENCE_ROLES.includes(current.requestedRole as RequestedReferenceRole)
          ) {
            return null;
          }
          return {
            contextId: current.contextId,
            requestedRole: current.requestedRole as RequestedReferenceRole,
          };
        })
        .filter((reference): reference is PromptInterpreterResult["references"][number] => reference !== null)
    : [];

  return {
    executionMode,
    targetHint: typeof candidate.targetHint === "string" ? candidate.targetHint : null,
    operations,
    references,
    preserveRequests: isStringArray(candidate.preserveRequests) ? candidate.preserveRequests : [],
    avoidRequests: isStringArray(candidate.avoidRequests) ? candidate.avoidRequests : [],
    notes: isStringArray(candidate.notes) ? candidate.notes : [],
  };
};
