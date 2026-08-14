import { z } from "zod";

/** Output modes persisted by the canvas Assistant card. */
export const ASSISTANT_CARD_OUTPUT_FORMATS = ["list", "text"] as const;

export type AssistantCardOutputFormat = (typeof ASSISTANT_CARD_OUTPUT_FORMATS)[number];

const assistantCardModelOutputSchema = z
  .object({
    format: z.enum(ASSISTANT_CARD_OUTPUT_FORMATS),
    items: z.array(z.string().trim().min(1).max(1_200)).max(12),
    text: z.string().trim().max(6_000),
  })
  .strict();

export type AssistantCardModelOutput = z.infer<typeof assistantCardModelOutputSchema>;

/**
 * Responses API structured-output schema. The requested mode is verified again
 * after parsing so an incorrect provider response can never become canvas state.
 */
export const ASSISTANT_CARD_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    format: { type: "string", enum: ASSISTANT_CARD_OUTPUT_FORMATS },
    items: {
      type: "array",
      items: { type: "string" },
      maxItems: 12,
    },
    text: { type: "string" },
  },
  required: ["format", "items", "text"],
} as const;

export function getAssistantCardOutputInstruction(format: AssistantCardOutputFormat) {
  if (format === "list") {
    return [
      "Return exactly one JSON object and no markdown or prose outside it.",
      "Use this exact shape: {\"format\":\"list\",\"items\":[\"content\"],\"text\":\"\"}.",
      "Put each concise list entry in items. Do not include numeric prefixes inside item strings.",
    ].join(" ");
  }

  return [
    "Return exactly one JSON object and no markdown or prose outside it.",
    "Use this exact shape: {\"format\":\"text\",\"items\":[],\"text\":\"concise response\"}.",
    "Keep text concise and natural. Do not return a numbered or bulleted list.",
  ].join(" ");
}

export function renderAssistantCardOutput(params: {
  raw: string;
  expectedFormat: AssistantCardOutputFormat;
}) {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(params.raw);
  } catch {
    throw new Error("Assistant returned an invalid structured response.");
  }

  const parsed = assistantCardModelOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("Assistant returned an invalid structured response.");
  }

  if (parsed.data.format !== params.expectedFormat) {
    throw new Error("Assistant returned an unexpected output format.");
  }

  if (params.expectedFormat === "list") {
    if (parsed.data.items.length === 0) {
      throw new Error("Assistant returned an empty list.");
    }

    return parsed.data.items.map((item, index) => `${index + 1}. ${item}`).join("\n");
  }

  if (!parsed.data.text) {
    throw new Error("Assistant returned empty text.");
  }

  return parsed.data.text;
}
