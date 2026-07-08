const DEFAULT_MODEL_OPTIONS = [
  "gpt-5-mini",
  "gpt-5",
];

export type OpenAIChatModelOption = {
  value: string;
  label: string;
};

function prettifyOpenAIChatModelLabel(model: string) {
  return model
    .replace(/^gpt-/i, "GPT ")
    .replaceAll("-", " ")
    .replace(/\bmini\b/i, "Mini")
    .trim();
}

function parseModelOption(entry: string): OpenAIChatModelOption | null {
  const trimmedEntry = entry.trim();
  if (!trimmedEntry) {
    return null;
  }

  const [valuePart, labelPart] = trimmedEntry.split("|");
  const value = valuePart?.trim();
  if (!value) {
    return null;
  }

  return {
    value,
    label: labelPart?.trim() || prettifyOpenAIChatModelLabel(value),
  };
}

function buildModelOptions() {
  const configuredModels = process.env.NEXT_PUBLIC_OPENAI_CHAT_MODELS
    ?.split(",")
    .map(parseModelOption)
    .filter((option): option is OpenAIChatModelOption => option !== null);

  if (configuredModels && configuredModels.length > 0) {
    return configuredModels;
  }

  return DEFAULT_MODEL_OPTIONS.map((model) => ({
    value: model,
    label: prettifyOpenAIChatModelLabel(model),
  }));
}

export const OPENAI_CHAT_MODEL_OPTIONS = buildModelOptions();
export const DEFAULT_OPENAI_CHAT_MODEL = OPENAI_CHAT_MODEL_OPTIONS[0]?.value ?? "gpt-5-mini";

export function normalizeOpenAIChatModel(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_OPENAI_CHAT_MODEL;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return DEFAULT_OPENAI_CHAT_MODEL;
  }

  return OPENAI_CHAT_MODEL_OPTIONS.some((option) => option.value === normalizedValue)
    ? normalizedValue
    : DEFAULT_OPENAI_CHAT_MODEL;
}
