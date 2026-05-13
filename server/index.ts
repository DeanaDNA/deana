import { stat } from "node:fs/promises";
import path from "node:path";
import aiStatusHandler from "../api/ai-status.js";
import chatHandler from "../api/chat.js";
import chatTitleHandler from "../api/chat-title.js";

const host = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "8080", 10);
const distRoot = path.resolve(import.meta.dir, "../dist");
const immutableCache = "public, max-age=31536000, immutable";
const indexCache = "no-cache, no-store, must-revalidate";

type ApiHandler = (request: Request) => Response | Promise<Response>;

const apiRoutes: Record<string, ApiHandler> = {
  "/api/ai-status": aiStatusHandler,
  "/api/chat": chatHandler,
  "/api/chat-title": chatTitleHandler,
};

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

function cacheControlForPath(pathname: string): string {
  if (pathname.startsWith("/assets/") || pathname.startsWith("/evidence-packs/")) {
    return immutableCache;
  }
  if (pathname === "/" || pathname === "/index.html") {
    return indexCache;
  }
  return "public, max-age=300";
}

function staticPathForRequest(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded.includes("\0")) return null;

  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(distRoot, relativePath);
  return resolved === distRoot || resolved.startsWith(`${distRoot}${path.sep}`) ? resolved : null;
}

async function fileResponse(
  request: Request,
  filePath: string,
  cacheControl: string,
): Promise<Response | null> {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return null;
  } catch {
    return null;
  }

  const file = Bun.file(filePath);

  const headers = new Headers({
    "Cache-Control": cacheControl,
  });
  if (file.type) headers.set("Content-Type", file.type);

  return new Response(request.method === "HEAD" ? null : file, {
    headers,
  });
}

async function serveStaticOrSpaFallback(request: Request, pathname: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonError(405, "Method not allowed.");
  }

  const staticPath = staticPathForRequest(pathname);
  if (!staticPath) {
    return jsonError(400, "Bad request.");
  }

  const staticResponse = await fileResponse(request, staticPath, cacheControlForPath(pathname));
  if (staticResponse) return staticResponse;

  const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;
  const hasFileExtension = path.extname(pathname) !== "";
  if (hasFileExtension && !acceptsHtml) {
    return jsonError(404, "Not found.");
  }

  const indexPath = path.resolve(distRoot, "index.html");
  return await fileResponse(request, indexPath, indexCache)
    ?? jsonError(500, "Application build is missing.");
}

Bun.serve({
  hostname: host,
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }

    const apiHandler = apiRoutes[url.pathname];
    if (apiHandler) {
      return apiHandler(request);
    }

    return serveStaticOrSpaFallback(request, url.pathname);
  },
});

console.log(`Deana container server listening on http://${host}:${port}`);
