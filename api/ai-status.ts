import { hasGatewayAuth } from "../src/lib/aiGatewayAuth.js";
import { availableModelsFromEnv, chatModelFromEnv } from "../src/lib/ai/models.js";

declare const process: {
  env: Record<string, string | undefined>;
};

interface AiStatusResponse {
  enabled: boolean;
  model?: string;
  models: string[];
}

export const config = {
  runtime: "edge",
};

let cachedModelsEnv: string | undefined;
let cachedModels: string[] | null = null;

function statusModelsFromEnv(env: Record<string, string | undefined>): string[] {
  const modelListEnv = env.VITE_DEANA_MODEL_LIST;
  if (cachedModels && cachedModelsEnv === modelListEnv) {
    return cachedModels;
  }

  cachedModelsEnv = modelListEnv;
  cachedModels = availableModelsFromEnv(env);
  return cachedModels;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }

  const body: AiStatusResponse = {
    enabled: hasGatewayAuth(request, process.env),
    models: statusModelsFromEnv(process.env),
  };
  if (process.env.VERCEL_ENV !== "production") {
    body.model = chatModelFromEnv(process.env);
  }

  return Response.json(
    body,
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
