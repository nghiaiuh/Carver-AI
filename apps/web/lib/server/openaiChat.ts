import "server-only";

import type { ChatHistoryRecord } from "./chatHistory";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5-mini";

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

export async function createChatCompletion(params: {
  message: string;
  history: ChatHistoryRecord[];
  canvasId?: string;
  projectId?: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Add it to your environment before using canvas chat.");
  }

  const conversation = [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: SYSTEM_PROMPT,
        },
      ],
    },
    ...params.history.slice(-16).map((entry) => ({
      role: entry.role,
      content: [
        {
          type: "input_text",
          text: entry.content,
        },
      ],
    })),
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: params.message,
        },
      ],
    },
  ];

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: conversation,
    }),
  });

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
