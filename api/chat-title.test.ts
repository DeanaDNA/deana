import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createGateway: vi.fn(),
  createOpenAI: vi.fn(),
  generateText: vi.fn(),
  openAiChat: vi.fn(),
  runTextWithFallback: vi.fn(),
}));

vi.mock("@ai-sdk/gateway", () => ({
  createGateway: mocks.createGateway,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mocks.createOpenAI,
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
}));

vi.mock("../src/lib/ai/run-with-fallback.js", () => ({
  runTextWithFallback: mocks.runTextWithFallback,
}));

import handler from "./chat-title.js";

function titleRequest(body: Record<string, unknown>): Request {
  return new Request("https://deana.test/api/chat-title", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://deana.test",
    },
    body: JSON.stringify(body),
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("chat title endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createGateway.mockReturnValue("gateway-provider");
    mocks.openAiChat.mockImplementation((model: string) => ({ provider: "openai", model }));
    mocks.createOpenAI.mockReturnValue({ chat: mocks.openAiChat });
    mocks.generateText.mockResolvedValue({ text: "BYOK Title" });
    mocks.runTextWithFallback.mockResolvedValue({ text: "Gateway Title", modelUsed: "google/gemma-4-31b-it", fallbackAttempts: 0 });
  });

  it("uses the supplied BYOK model for title generation", async () => {
    const response = await handler(titleRequest({
      prompt: "Will I go bald?",
      byokApiKey: " sk-test ",
      byokBaseUrl: "https://openrouter.ai/api/v1",
      byokModelId: "openai/gpt-4o-mini",
    }));

    expect(response.status).toBe(200);
    await expect(responseBody(response)).resolves.toEqual({ title: "BYOK Title" });
    expect(mocks.createOpenAI).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "sk-test",
      baseURL: "https://openrouter.ai/api/v1",
      fetch: expect.any(Function),
    }));
    expect(mocks.openAiChat).toHaveBeenCalledWith("openai/gpt-4o-mini");
    expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({
      model: { provider: "openai", model: "openai/gpt-4o-mini" },
      system: expect.stringContaining("Prefer the user's topic and intent over generic report terms."),
      prompt: "Will I go bald?",
      maxOutputTokens: 512,
    }));
    expect(mocks.runTextWithFallback).not.toHaveBeenCalled();
  });

  it("defaults BYOK title generation to gpt-4o-mini when no model is configured", async () => {
    const response = await handler(titleRequest({
      prompt: "Summarize my drug response findings",
      byokApiKey: "sk-test",
      byokModelId: " ",
    }));

    expect(response.status).toBe(200);
    expect(mocks.createOpenAI).toHaveBeenCalledWith({ apiKey: "sk-test" });
    expect(mocks.openAiChat).toHaveBeenCalledWith("gpt-4o-mini");
  });

  it("does not inject OpenRouter reasoning controls for other BYOK providers", async () => {
    const response = await handler(titleRequest({
      prompt: "Will I go bald?",
      byokApiKey: "sk-test",
      byokBaseUrl: "https://api.openai.com/v1",
      byokModelId: "gpt-4o-mini",
    }));

    expect(response.status).toBe(200);
    expect(mocks.createOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseURL: "https://api.openai.com/v1",
    });
  });

  it("falls back to the first prompt when a BYOK model returns a generic title", async () => {
    mocks.generateText.mockResolvedValueOnce({ text: "New chat" });

    const response = await handler(titleRequest({
      prompt: "Should I worry about factor v?",
      byokApiKey: "sk-test",
      byokBaseUrl: "https://openrouter.ai/api/v1",
      byokModelId: "openai/gpt-4o-mini",
    }));

    expect(response.status).toBe(200);
    await expect(responseBody(response)).resolves.toEqual({ title: "Should I worry about factor v?" });
    expect(mocks.generateText).toHaveBeenCalled();
    expect(mocks.runTextWithFallback).not.toHaveBeenCalled();
  });

  it("falls back to the first prompt when a BYOK model returns no title text", async () => {
    mocks.generateText.mockResolvedValueOnce({ text: "" });

    const response = await handler(titleRequest({
      prompt: "Compare my statin response findings",
      byokApiKey: "sk-test",
    }));

    expect(response.status).toBe(200);
    await expect(responseBody(response)).resolves.toEqual({ title: "Compare my statin response findings" });
  });

  it("rejects invalid BYOK base URLs", async () => {
    const response = await handler(titleRequest({
      prompt: "Check my report",
      byokApiKey: "sk-test",
      byokBaseUrl: "file:///tmp/provider",
    }));

    expect(response.status).toBe(400);
    await expect(responseBody(response)).resolves.toEqual({ error: "Custom API base URL must be an HTTP(S) URL." });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.runTextWithFallback).not.toHaveBeenCalled();
  });

  it("keeps using Gateway fallback for non-BYOK title generation", async () => {
    const response = await handler(titleRequest({
      prompt: "Explain my cancer risk findings",
    }));

    expect(response.status).toBe(200);
    await expect(responseBody(response)).resolves.toEqual({ title: "Gateway Title" });
    expect(mocks.createGateway).toHaveBeenCalledWith({ apiKey: undefined });
    expect(mocks.runTextWithFallback).toHaveBeenCalledWith(expect.objectContaining({
      gateway: "gateway-provider",
      models: ["google/gemma-4-31b-it"],
      prompt: "Explain my cancer risk findings",
      maxOutputTokens: 512,
      taskName: "chat-title",
    }));
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
