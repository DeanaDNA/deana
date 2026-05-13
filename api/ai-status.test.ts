import { afterEach, describe, expect, it } from "vitest";
import handler from "./ai-status.js";

const originalEnv = { ...process.env };

function statusRequest(): Request {
  return new Request("https://deana.test/api/ai-status", {
    method: "GET",
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function enableGatewayAuth(): void {
  process.env.AI_GATEWAY_API_KEY = "secret-key";
}

describe("AI status endpoint", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reports runtime model options without exposing secrets", async () => {
    enableGatewayAuth();
    process.env.VITE_DEANA_MODEL_LIST = "google/gemini-3-flash, openai/gpt-5-mini";

    const response = await handler(statusRequest());

    expect(response.status).toBe(200);
    await expect(responseBody(response)).resolves.toEqual({
      enabled: true,
      model: "google/gemini-3-flash",
      models: ["google/gemini-3-flash", "openai/gpt-5-mini"],
    });
  });

  it("hides the fallback model in production responses", async () => {
    enableGatewayAuth();
    process.env.VERCEL_ENV = "production";

    const response = await handler(statusRequest());
    const body = await responseBody(response);

    expect(body.enabled).toBe(true);
    expect(body.models).toEqual(expect.arrayContaining(["google/gemini-3-flash"]));
    expect(body).not.toHaveProperty("model");
  });
});
