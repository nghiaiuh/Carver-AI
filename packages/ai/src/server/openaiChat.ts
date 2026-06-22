import "server-only";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5-mini";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

const getAssistantText = (payload: OpenAIResponse) => {
  if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => (content.type === "output_text" || content.type === "text" ? content.text ?? "" : ""))
    .join("")
    .trim();

  return text && text.length > 0 ? text : null;
};

export async function createOpenAITextResponse(params: {
  model?: string;
  input: Array<{
    role: "system" | "user" | "assistant";
    content: Array<{
      type: "input_text";
      text: string;
    }>;
  }>;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Add it to your environment before using OpenAI-powered features.");
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.model ?? OPENAI_MODEL,
      input: params.input,
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
