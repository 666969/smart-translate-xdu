import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { MAX_CHAT_MESSAGE_CHARS, MAX_CHAT_MESSAGES } from "./studyLimits";

export class StudyApiError extends Error {
  constructor(message: string, readonly status = 400, readonly retryAfter?: number) {
    super(message);
  }
}

export function studyApiErrorResponse(error: unknown) {
  if (!(error instanceof StudyApiError)) return null;
  return NextResponse.json(
    { error: error.message },
    {
      status: error.status,
      headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
    }
  );
}

export function textProviderErrorResponse(status: number | undefined, fallback: string) {
  if (status === 401 || status === 403) {
    return NextResponse.json({ error: "文本模型鉴权失败，请检查服务端的模型密钥。" }, { status: 503 });
  }
  return NextResponse.json({ error: fallback }, { status: status === 429 ? 429 : 502 });
}

function boundedBody(request: Request, maxBytes: number) {
  const tooLarge = () => new StudyApiError("请求内容过大，请缩小文件或减少上传页数。", 413);
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) {
    throw tooLarge();
  }

  let bytes = 0;
  const stream = request.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        controller.error(tooLarge());
      } else {
        controller.enqueue(chunk);
      }
    },
  }));

  return new Response(stream, {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  });
}

export async function readStudyJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await boundedBody(request, maxBytes).json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch (error) {
    if (error instanceof StudyApiError) throw error;
  }
  throw new StudyApiError("请求内容必须是有效的 JSON 对象。");
}

export async function readStudyForm(request: Request, maxBytes: number) {
  try {
    return await boundedBody(request, maxBytes).formData();
  } catch (error) {
    if (error instanceof StudyApiError) throw error;
    throw new StudyApiError("无法读取上传内容，请重新选择文件。");
  }
}

export function readStudyMessages(value: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_CHAT_MESSAGES) {
    throw new StudyApiError("请提供有效的对话消息。");
  }
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new StudyApiError("对话消息格式不正确。");
    const { role, content } = entry as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" ||
        !content.trim() || content.length > MAX_CHAT_MESSAGE_CHARS) {
      throw new StudyApiError("对话消息格式不正确或内容过长。");
    }
    return { role, content };
  });
}

type Budget = "study" | "caption" | "speech";

const BUDGETS = {
  study: { client: 40, instance: 300 },
  caption: { client: 900, instance: 4_500 },
  speech: { client: 1_000, instance: 5_000 },
} satisfies Record<Budget, { client: number; instance: number }>;
const HOUR = 60 * 60 * 1000;

const processState = globalThis as typeof globalThis & {
  zhiyiStudyBudgets?: Map<string, { count: number; resetAt: number }>;
};
const usage = processState.zhiyiStudyBudgets ??= new Map();

export function consumeStudyBudget(request: Request, budget: Budget) {
  const now = Date.now();
  const rule = BUDGETS[budget];
  // Only trust a header overwritten by the hosting platform or a configured reverse proxy.
  const ipHeader = process.env.AI_TRUSTED_IP_HEADER ||
    (process.env.VERCEL ? "x-vercel-forwarded-for" : "");
  const ip = ipHeader ? request.headers.get(ipHeader)?.trim() : undefined;
  const keys: { key: string; limit: number }[] = [{ key: budget, limit: rule.instance }];
  if (ip && isIP(ip)) keys.push({ key: budget + ":" + ip, limit: rule.client });

  if (usage.size > 500) {
    for (const [key, entry] of usage) {
      if (entry.resetAt <= now) usage.delete(key);
    }
  }
  const entries = keys.map(({ key, limit }) => {
    const entry = usage.get(key);
    const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + HOUR };
    if (current.count >= limit) {
      throw new StudyApiError("试用额度已用完，请稍后再试。", 429, Math.ceil((current.resetAt - now) / 1000));
    }
    return { key, current };
  });
  for (const { key, current } of entries) usage.set(key, { ...current, count: current.count + 1 });
}
