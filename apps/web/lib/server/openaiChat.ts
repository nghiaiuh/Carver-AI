import "server-only";

import { DEFAULT_OPENAI_CHAT_MODEL } from "../openaiChatModels";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_CHAT_TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = [
  "You are Carver AI, an AI landscape architect co-pilot.",
  "Help users refine landscape and garden ideas while respecting layout constraints, camera perspective, and preserved objects.",
  "Be concise, practical, and collaborative.",
  "Prefer structured guidance when the user asks for design direction.",
].join(" ");

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

export type OpenAIResponseTextFormat = {
  type: "json_schema";
  name: string;
  description: string;
  schema: Record<string, unknown>;
  strict: true;
};

type OpenAIInputTextBlock = {
  type: "input_text";
  text: string;
};

type OpenAIInputImageBlock = {
  type: "input_image";
  image_url: string;
};

type OpenAIOutputTextBlock = {
  type: "output_text";
  text: string;
};

type OpenAIInputBlock = OpenAIInputTextBlock | OpenAIInputImageBlock;
type OpenAIAssistantBlock = OpenAIOutputTextBlock;

export type ChatInputImage = {
  imageUrl: string;
  label?: string;
  source?: "attachment" | "canvas-target" | "canvas-reference" | "preset-reference";
};

export type ChatHistoryEntry = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

function getAssistantText(payload: OpenAIResponse) {
  if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => (content.type === "output_text" || content.type === "text" ? content.text ?? "" : ""))
    .join("")
    .trim();

  return text && text.length > 0 ? text : null;
}

export async function createOpenAITextResponse(params: {
  model?: string;
  responseFormat?: OpenAIResponseTextFormat;
  input: Array<{
    role: "system" | "user" | "assistant";
    content: OpenAIInputBlock[] | OpenAIAssistantBlock[];
  }>;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Add it to your environment before using OpenAI-powered features.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_CHAT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: params.model ?? DEFAULT_OPENAI_CHAT_MODEL,
        input: params.input,
        text: params.responseFormat
          ? { format: params.responseFormat }
          : { format: { type: "text" } },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenAI chat request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => ({}))) as OpenAIResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI could not answer right now.");
  }

  const assistantText = getAssistantText(payload);

  if (!assistantText) {
    throw new Error("OpenAI returned an empty response.");
  }

  return assistantText;
}

export async function createChatCompletion(params: {
  message: string;
  history: ChatHistoryEntry[];
  images?: ChatInputImage[];
  model?: string;
}) {
  const conversation: Array<{
    role: "system" | "user" | "assistant";
    content: OpenAIInputBlock[] | OpenAIAssistantBlock[];
  }> = [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: SYSTEM_PROMPT,
        },
      ],
    },
    ...params.history.slice(-16).map(
      (entry): {
        role: "user" | "assistant";
        content: OpenAIInputBlock[] | OpenAIAssistantBlock[];
      } => ({
        role: entry.role,
        content:
          entry.role === "assistant"
            ? [
                {
                  type: "output_text",
                  text: entry.content,
                },
              ]
            : [
                {
                  type: "input_text",
                  text: entry.content,
                },
              ],
      }),
    ),
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: params.message,
        },
        ...(params.images ?? []).map(
          (image): OpenAIInputImageBlock => ({
            type: "input_image",
            image_url: image.imageUrl,
          }),
        ),
      ],
    },
  ];

  return createOpenAITextResponse({
    model: params.model ?? DEFAULT_OPENAI_CHAT_MODEL,
    input: conversation,
  });
}
