import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const ALLOWED_PATHS = new Set(["chat/completions"]);

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

async function proxyDeepSeekRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const apiKey = process.env.OPENAI_API_KEY;
  const authorization = request.headers.get("authorization");

  if (!apiKey || authorization !== `Bearer ${apiKey}`) {
    return unauthorized();
  }

  const { path } = await context.params;
  const upstreamPath = path.join("/");

  if (!ALLOWED_PATHS.has(upstreamPath)) {
    return Response.json({ error: "Unsupported proxy path" }, { status: 404 });
  }

  const upstream = await fetch(`${DEEPSEEK_BASE_URL}/${upstreamPath}`, {
    method: request.method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": request.headers.get("content-type") || "application/json",
    },
    body: await request.arrayBuffer(),
    cache: "no-store",
    signal: request.signal,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const POST = proxyDeepSeekRequest;
