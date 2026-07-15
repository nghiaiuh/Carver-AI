import type {
  DecisionSource,
  PromptEngineTrustedContext,
  PromptWarning,
  RequestedReferenceRole,
  ValidatedReference,
} from "@carver/shared";

const GRAPH_ROLE_TO_ALLOWED_ROLES: Record<string, RequestedReferenceRole[]> = {
  direct_edit_target: ["object", "layout", "composition", "unspecified"],
  layout_reference: ["layout", "composition", "unspecified"],
  style_reference: ["style", "composition", "unspecified"],
  material_reference: ["material", "composition", "unspecified"],
  plant_reference: ["object", "style", "composition", "unspecified"],
  architecture_reference: ["object", "layout", "composition", "unspecified"],
  generic_reference: ["composition", "unspecified", "style", "object"],
};

const unique = <T>(items: T[]) => Array.from(new Set(items));

export const resolveAllowedRoles = (graphRole: string | null | undefined): RequestedReferenceRole[] =>
  graphRole
    ? unique(GRAPH_ROLE_TO_ALLOWED_ROLES[graphRole] ?? ["composition", "unspecified"])
    : ["composition", "unspecified"];

export const validateReferences = (params: {
  trustedContext: PromptEngineTrustedContext;
  requestedReferences: Array<{
    contextId: string;
    requestedRole: RequestedReferenceRole;
  }>;
  warnings: PromptWarning[];
}): ValidatedReference[] => {
  const { trustedContext, requestedReferences, warnings } = params;
  const validatedReferences: ValidatedReference[] = [];

  for (const reference of requestedReferences) {
    const trusted = trustedContext.availableReferences.find((candidate) => candidate.contextId === reference.contextId);
    if (!trusted) {
      warnings.push({
        code: "UNKNOWN_REFERENCE_REMOVED",
        message: `Reference ${reference.contextId} is not available in trusted context.`,
        contextId: reference.contextId,
      });
      continue;
    }

    if (trusted.allowedRoles.includes(reference.requestedRole)) {
      validatedReferences.push({
        contextId: trusted.contextId,
        requestedRole: reference.requestedRole,
        effectiveRole: reference.requestedRole,
        graphRole: trusted.graphRole ?? null,
        source: "trusted_context" satisfies DecisionSource,
        validation: "trusted_graph_match",
        evidence: [
          `trusted-reference:${trusted.contextId}`,
          `requested-role:${reference.requestedRole}`,
        ],
      });
      continue;
    }

    const adjustedRole = trusted.allowedRoles[0] ?? "unspecified";
    warnings.push({
      code: "INVALID_REFERENCE_ROLE",
      message: `Reference ${reference.contextId} cannot be used as ${reference.requestedRole}; using ${adjustedRole}.`,
      contextId: reference.contextId,
    });

    validatedReferences.push({
      contextId: trusted.contextId,
      requestedRole: reference.requestedRole,
      effectiveRole: adjustedRole,
      graphRole: trusted.graphRole ?? null,
      source: "trusted_context" satisfies DecisionSource,
      validation: "role_adjusted",
      evidence: [
        `trusted-reference:${trusted.contextId}`,
        `requested-role:${reference.requestedRole}`,
        `effective-role:${adjustedRole}`,
      ],
    });
  }

  return validatedReferences;
};
