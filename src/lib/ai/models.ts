export const AVAILABLE_MODELS = [
  "google/gemini-3-flash",
  "openai/gpt-5.4-nano",
  "openai/gpt-5-mini",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
] as const;

export type AvailableModel = (typeof AVAILABLE_MODELS)[number];

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "google/gemini-3-flash": "Gemini 3 Flash",
  "openai/gpt-5.4-nano": "GPT-5.4 Nano",
  "openai/gpt-5-mini": "GPT-5 Mini",
  "deepseek/deepseek-v4-flash": "DeepSeek v4 Flash",
  "deepseek/deepseek-v4-pro": "DeepSeek v4 Pro",
};

export const DEANA_MODELS = {
  cheap: "google/gemma-4-31b-it",
  default: AVAILABLE_MODELS[0],
  strongFallback: "openai/gpt-5.4-mini",
} as const;

export const TITLE_GENERATION_MODELS = [DEANA_MODELS.cheap] as const;

export function availableModelsFromEnv(env: Record<string, string | undefined>): string[] {
  const list = env.VITE_DEANA_MODEL_LIST?.trim();
  if (list) {
    const parsed = list.split(",").map((m) => m.trim()).filter(Boolean);
    if (parsed.length > 0) return parsed;
  }
  return [...AVAILABLE_MODELS];
}

export function modelDisplayName(modelId: string): string {
  return MODEL_DISPLAY_NAMES[modelId] ?? modelId.split("/").pop() ?? modelId;
}

export function chatModelFromEnv(env: Record<string, string | undefined>): string {
  const model = env.DEANA_LLM_MODEL?.trim();
  return model || DEANA_MODELS.default;
}
