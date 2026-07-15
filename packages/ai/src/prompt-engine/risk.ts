import type {
  PromptEngineTrustedContext,
  PromptOperation,
  PromptRiskAssessment,
  ReviewReason,
  RiskReason,
} from "@carver/shared";

const hasDestructiveOperation = (operations: PromptOperation[]) =>
  operations.some((operation) => operation.type === "remove_object" || operation.type === "replace_object");

export const assessPromptRisk = (params: {
  trustedContext: PromptEngineTrustedContext;
  operations: PromptOperation[];
  degraded: boolean;
  missingTarget: boolean;
  missingMask: boolean;
  missingRequiredReference: boolean;
}): {
  risk: PromptRiskAssessment;
  reviewReasons: ReviewReason[];
} => {
  const { trustedContext, operations, degraded, missingTarget, missingMask, missingRequiredReference } = params;
  const reasons: RiskReason[] = [];
  const reviewReasons: ReviewReason[] = [];

  if (hasDestructiveOperation(operations)) {
    reasons.push({
      code: "DESTRUCTIVE_OPERATION",
      source: "model_interpretation",
    });
  }

  if (!trustedContext.target && trustedContext.executionMode !== "text_to_image") {
    reasons.push({
      code: "AMBIGUOUS_DESTRUCTIVE_TARGET",
      source: "trusted_context",
    });
    reviewReasons.push({
      code: "TARGET_CONFIRMATION_REQUIRED",
      source: "trusted_context",
    });
  }

  if (missingTarget) {
    reasons.push({
      code: "STALE_EXECUTION_CONTEXT",
      source: "trusted_context",
      contextId: trustedContext.target?.contextId,
    });
  }

  if (missingMask) {
    reasons.push({
      code: "MISSING_MASK",
      source: "trusted_context",
    });
  }

  if (missingRequiredReference) {
    reasons.push({
      code: "MISSING_REQUIRED_REFERENCE",
      source: "trusted_context",
    });
    reviewReasons.push({
      code: "REFERENCE_ROLE_CONFIRMATION_REQUIRED",
      source: "trusted_context",
    });
  }

  if (degraded) {
    reasons.push({
      code: "DEGRADED_INTERPRETATION",
      source: "fallback",
    });
  }

  if (!trustedContext.target && trustedContext.executionMode === "text_to_image") {
    return {
      risk: {
        level: degraded ? "medium" : "low",
        reasons,
      },
      reviewReasons,
    };
  }

  if (missingTarget || missingMask) {
    return {
      risk: {
        level: "blocked",
        reasons,
      },
      reviewReasons,
    };
  }

  if (hasDestructiveOperation(operations) && trustedContext.lockedObjectIds.length > 0) {
    reasons.push({
      code: "LOCKED_OBJECT_CONFLICT",
      source: "trusted_context",
      contextId: trustedContext.lockedObjectIds[0],
    });
  }

  if (!trustedContext.target && hasDestructiveOperation(operations)) {
    return {
      risk: {
        level: "high",
        reasons,
      },
      reviewReasons,
    };
  }

  if (trustedContext.executionMode === "region_edit") {
    return {
      risk: {
        level: degraded ? "high" : "medium",
        reasons,
      },
      reviewReasons,
    };
  }

  if (trustedContext.executionMode === "image_edit") {
    return {
      risk: {
        level: degraded || hasDestructiveOperation(operations) ? "high" : "medium",
        reasons,
      },
      reviewReasons,
    };
  }

  return {
    risk: {
      level: degraded ? "medium" : "low",
      reasons,
    },
    reviewReasons,
  };
};
