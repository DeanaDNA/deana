import { createGateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";
import { getGatewayApiKey, isSameOrigin } from "../src/lib/aiGatewayAuth.js";
import {
  buildGatewayProviderOptions,
  DEFAULT_BYOK_MODEL_ID,
  formatChatTitle,
  normalizeByokAiError,
  normalizeByokBaseUrl,
} from "../src/lib/aiChat.js";
import { TITLE_GENERATION_MODELS } from "../src/lib/ai/models.js";
import { runTextWithFallback } from "../src/lib/ai/run-with-fallback.js";

declare const process: {
  env: Record<string, string | undefined>;
};

export const config = {
  runtime: "edge",
};

const MAX_BODY_BYTES = 4_000;
const TITLE_SYSTEM_PROMPT = [
  "Create a short, specific Deana chat title from the user's first message only.",
  "Use two to six words.",
  "Preserve the main topic and intent, such as Baldness Risk, Cancer Risk, or Drug Response Takeaways.",
  "For example, 'Am I likely to go bald?' should become 'Investigating Male Pattern Baldness'.",
  "Do not return vague one-word titles like Genetic, Health, Report, Results, or Findings.",
  "Do not return demographic labels by themselves, such as Male or Female.",
  "Do not return New chat.",
  "Do not include punctuation unless needed inside a medical term.",
  "Do not include profile names, file names, or raw DNA details.",
  "Return only the title text.",
].join("\n");
const unusableTitlePattern = /^(new chat|chat|untitled|title)$/i;
const TITLE_MAX_OUTPUT_TOKENS = 512;

const titleRequestSchema = z.object({
  prompt: z.string().min(1).max(2_000),
  byokApiKey: z.string().max(300).optional(),
  byokBaseUrl: z.string().max(500).optional(),
  byokModelId: z.string().max(200).optional(),
});

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

function fallbackTitleFromPrompt(prompt: string): string {
  return formatChatTitle(prompt) || "New chat";
}

function usableTitleFromModel(text: string): string | null {
  const title = formatChatTitle(text);
  return title && !unusableTitlePattern.test(title) ? title : null;
}

function isOpenRouterBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === "openrouter.ai";
  } catch {
    return false;
  }
}

function withOpenRouterTitleReasoningDisabled(base: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    if (typeof init?.body !== "string") {
      return base(input, init);
    }

    try {
      const body = JSON.parse(init.body) as unknown;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return base(input, init);
      }

      return base(input, {
        ...init,
        body: JSON.stringify({
          ...body,
          include_reasoning: false,
        }),
      });
    } catch {
      return base(input, init);
    }
  };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  if (!isSameOrigin(request, process.env)) {
    return jsonResponse(403, { error: "Title requests must come from this Deana deployment." });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: "Title context is too large." });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." });
  }

  const parsed = titleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(400, { error: "Invalid title request." });
  }

  try {
    const byokApiKey = parsed.data.byokApiKey?.trim();
    if (byokApiKey) {
      const byokBaseUrl = normalizeByokBaseUrl(parsed.data.byokBaseUrl);
      if (byokBaseUrl === null) {
        return jsonResponse(400, { error: "Custom API base URL must be an HTTP(S) URL." });
      }

      const provider = createOpenAI({
        apiKey: byokApiKey,
        ...(byokBaseUrl ? { baseURL: byokBaseUrl } : {}),
        ...(byokBaseUrl && isOpenRouterBaseUrl(byokBaseUrl)
          ? { fetch: withOpenRouterTitleReasoningDisabled(fetch) }
          : {}),
      });
      const model = parsed.data.byokModelId?.trim() || DEFAULT_BYOK_MODEL_ID;
      const result = await generateText({
        model: provider.chat(model),
        system: TITLE_SYSTEM_PROMPT,
        prompt: parsed.data.prompt,
        maxOutputTokens: TITLE_MAX_OUTPUT_TOKENS,
      });
      const title = usableTitleFromModel(result.text);
      return jsonResponse(200, { title: title || fallbackTitleFromPrompt(parsed.data.prompt) });
    }

    const gateway = createGateway({
      apiKey: getGatewayApiKey(request, process.env),
    });

    const result = await runTextWithFallback({
      gateway,
      models: TITLE_GENERATION_MODELS,
      system: TITLE_SYSTEM_PROMPT,
      prompt: parsed.data.prompt,
      maxOutputTokens: TITLE_MAX_OUTPUT_TOKENS,
      providerOptionsFor: (model) => buildGatewayProviderOptions(model),
      taskName: "chat-title",
    });

    const title = usableTitleFromModel(result.text);
    return jsonResponse(200, { title: title || fallbackTitleFromPrompt(parsed.data.prompt) });
  } catch (error) {
    const isByok = Boolean(parsed.data.byokApiKey?.trim());
    const errorMessage = isByok
      ? normalizeByokAiError(error, "AI title generation is unavailable.")
      : "AI title generation is unavailable.";
    return jsonResponse(503, { error: errorMessage });
  }
}
