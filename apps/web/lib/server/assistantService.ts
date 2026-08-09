import "server-only";

import { formatZodError, assistantCardRequestBodySchema, type AssistantCardRequestBody } from "@carver/shared";
import { createSafeLogger } from "@carver/shared";
import type { RequestContext } from "../../app/api/_lib/authz";
import { requireProjectOwner } from "../../app/api/_lib/authz";
import { AI_CREDIT_COSTS, reserveUserCredits, restoreUserCredits } from "../../app/api/_lib/credits";
import { apiFailure, badRequest } from "../../app/api/_lib/http";
import { enforceRateLimit } from "../../app/api/_lib/rateLimit";
import { normalizeOpenAIChatModel } from "../openaiChatModels";
import { createOpenAITextResponse } from "./openaiChat";
import { extractAssetIdFromGatewayUrl, resolveOwnedAssetUrls } from "./assetService";
import { parseDataUrlImage } from "@carver/storage/image-format";

const logger = createSafeLogger("web.assistant-card");

type AssistantServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

function buildAssistantCardSystemPrompt(outputFormat: AssistantCardRequestBody["outputFormat"]) {
  return [
    "You are Carver AI, an AI landscape architect co-pilot embedded inside a canvas assistant card.",
    "Help with landscape, garden, and outdoor design workflows.",
    "Use connected text and image references as supporting context only.",
    "Do not invent hidden site facts or claim certainty beyond the provided prompt and references.",
    "If image references imply layout, camera, or preserved objects, respect those constraints in your advice.",
    outputFormat === "list"
      ? "Return a concise structured list when helpful."
      : "Return concise prose unless the user clearly asks for a list.",
  ].join(" ");
}

function buildAssistantCardUserText(body: AssistantCardRequestBody) {
  const textReferenceSection =
    body.context.textReferences.length > 0
      ? body.context.textReferences
          .map((reference, index) => `${index + 1}. ${reference.title}: ${reference.content}`)
          .join("\n")
      : "None";

  return [
    "ASSISTANT CARD TASK",
    body.prompt,
    "",
    "CANVAS CONTEXT SUMMARY",
    body.context.connectionSummary || "No connected references.",
    "",
    "CONNECTED TEXT REFERENCES",
    textReferenceSection,
    "",
    "OUTPUT FORMAT",
    body.outputFormat === "list" ? "Structured list" : "Text",
  ].join("\n");
}

function buildAssistantImageReferenceLabel(
  reference: AssistantCardRequestBody["context"]["imageReferences"][number],
  index: number,
) {
  const title = reference.childLabel ?? reference.title;
  const role = reference.role ? `role: ${reference.role}` : "role: generic_reference";
  const source = reference.sourceKind === "preset" ? "preset reference" : "canvas image reference";

  return `Image reference ${index + 1}: ${title} (${source}, ${role}).`;
}

async function readAssistantInputImages(params: {
  body: AssistantCardRequestBody;
  context: RequestContext;
  requestUrl: string;
  projectId: string;
}) {
  const pendingImages = params.body.context.imageReferences;
  const assetIds = pendingImages.map((image) => image.assetId ?? extractAssetIdFromGatewayUrl(image.imageUrl));
  const ownedUrls = await resolveOwnedAssetUrls({
    requestUrl: params.requestUrl,
    supabase: params.context.supabase,
    userId: params.context.user.id,
    projectId: params.projectId,
    assetIds,
  });

  return pendingImages.map((image, index) => {
    if (image.imageUrl?.startsWith("data:image/")) {
      parseDataUrlImage(image.imageUrl, 6 * 1024 * 1024);
      return {
        imageUrl: image.imageUrl,
        label: buildAssistantImageReferenceLabel(image, index),
      };
    }

    const assetId = image.assetId ?? extractAssetIdFromGatewayUrl(image.imageUrl);
    if (assetId) {
      const owned = ownedUrls.get(assetId);
      if (!owned) {
        if (/^https?:\/\//i.test(image.imageUrl)) {
          return {
            imageUrl: image.imageUrl,
            label: buildAssistantImageReferenceLabel(image, index),
          };
        }

        throw new Error("Referenced assistant image was not found.");
      }

      return {
        imageUrl: owned.originalUrl,
        label: buildAssistantImageReferenceLabel(image, index),
      };
    }

    if (/^https?:\/\//i.test(image.imageUrl)) {
      return {
        imageUrl: image.imageUrl,
        label: buildAssistantImageReferenceLabel(image, index),
      };
    }

    throw new Error("Assistant images must be owned assets, absolute image URLs, or inline image data.");
  });
}

export async function runAssistantCard(params: {
  request: Request;
  context: RequestContext;
  projectId: string;
  body: Record<string, unknown>;
}): Promise<AssistantServiceResult<{
  response: string;
  model: string;
  nodeId: string;
  lastRunAt: string;
  contextSummary: string;
  usedImageCount: number;
  usedTextCount: number;
  creditsRemaining: number | null;
}>> {
  const parsedBody = assistantCardRequestBodySchema.safeParse({
    ...params.body,
    projectId: params.body.projectId ?? params.projectId,
  });
  if (!parsedBody.success) {
    return { ok: false, response: badRequest(formatZodError(parsedBody.error)) };
  }

  const body = parsedBody.data;
  if (body.projectId && body.projectId !== params.projectId) {
    return {
      ok: false,
      response: apiFailure("BAD_REQUEST", "projectId does not match the route.", 400, params.context.requestId),
    };
  }

  if (body.context.nodeId !== body.nodeId) {
    return {
      ok: false,
      response: apiFailure("BAD_REQUEST", "Assistant context is invalid.", 400, params.context.requestId),
    };
  }

  const projectResult = await requireProjectOwner(params.context, params.projectId);
  if ("error" in projectResult) {
    return { ok: false, response: projectResult.error };
  }

  const rateLimit = await enforceRateLimit(params.context, {
    scope: "chat",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return { ok: false, response: rateLimit.response };
  }

  let reservedCredits = false;
  let creditsRemaining: number | null = null;

  try {
    const assistantImages = await readAssistantInputImages({
      body,
      context: params.context,
      requestUrl: params.request.url,
      projectId: projectResult.project.id,
    });

    const creditOperationKey = `assistant-card:${params.context.requestId}`;
    const creditReservation = await reserveUserCredits(
      params.context,
      AI_CREDIT_COSTS.chat,
      creditOperationKey,
      "chat",
    );
    if ("error" in creditReservation) {
      return { ok: false, response: creditReservation.error };
    }

    reservedCredits = creditReservation.applied;
    creditsRemaining = creditReservation.creditsRemaining;

    const assistantText = await createOpenAITextResponse({
      model: normalizeOpenAIChatModel(body.model),
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: buildAssistantCardSystemPrompt(body.outputFormat),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildAssistantCardUserText(body),
            },
            ...assistantImages.flatMap((image) => [
              {
                type: "input_text" as const,
                text: image.label,
              },
              {
                type: "input_image" as const,
                image_url: image.imageUrl,
              },
            ]),
          ],
        },
      ],
    });

    const lastRunAt = new Date().toISOString();
    return {
      ok: true,
      data: {
        response: assistantText,
        model: normalizeOpenAIChatModel(body.model),
        nodeId: body.nodeId,
        lastRunAt,
        contextSummary: body.context.connectionSummary || "No connected references.",
        usedImageCount: body.context.imageReferences.length,
        usedTextCount: body.context.textReferences.length,
        creditsRemaining,
      },
    };
  } catch (error) {
    if (reservedCredits) {
      await restoreUserCredits(
        params.context,
        AI_CREDIT_COSTS.chat,
        `assistant-card:${params.context.requestId}`,
      ).catch(() => undefined);
    }

    logger.error("assistant card run failed", {
      requestId: params.context.requestId,
      userId: params.context.user.id,
      projectId: params.projectId,
      nodeId: typeof params.body.nodeId === "string" ? params.body.nodeId : null,
      error,
    });

    return {
      ok: false,
      response: apiFailure(
        "ASSISTANT_RUN_FAILED",
        "Carver AI could not answer in this assistant card right now.",
        502,
        params.context.requestId,
      ),
    };
  }
}
