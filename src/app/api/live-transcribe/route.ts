import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || "180000");
const HAS_DEDICATED_TRANSCRIBE_API = Boolean(
  process.env.OPENAI_TRANSCRIBE_API_KEY ||
    process.env.OPENAI_TRANSCRIBE_BASE_URL
);
const TRANSCRIBE_API_KEY =
  process.env.OPENAI_TRANSCRIBE_API_KEY || process.env.OPENAI_API_KEY;
const TRANSCRIBE_BASE_URL = HAS_DEDICATED_TRANSCRIBE_API
  ? process.env.OPENAI_TRANSCRIBE_BASE_URL || undefined
  : process.env.OPENAI_BASE_URL || undefined;
const TRANSCRIBE_MODEL =
  process.env.OPENAI_TRANSCRIBE_MODEL ||
  process.env.OPENAI_TRANSCRIPTION_MODEL ||
  "whisper-1";

const openai = new OpenAI({
  apiKey: TRANSCRIBE_API_KEY || "transcription-api-key-not-configured",
  baseURL: TRANSCRIBE_BASE_URL,
  timeout: OPENAI_TIMEOUT_MS,
});

function normalizeLanguageCode(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("fr")) {
    return "fr";
  }

  if (normalized.startsWith("en")) {
    return "en";
  }

  return undefined;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "标签页音频转写失败，请稍后重试。";
}

export async function POST(request: NextRequest) {
  try {
    const baseURL = process.env.OPENAI_BASE_URL || "";
    const usesDeepSeekTextApi =
      baseURL.includes("api.deepseek.com") ||
      baseURL.includes("/api/deepseek-proxy");

    if (usesDeepSeekTextApi && !HAS_DEDICATED_TRANSCRIBE_API) {
      return NextResponse.json(
        {
          error:
            "当前已使用 DeepSeek 文本接口；DeepSeek 暂不提供此功能所需的音频转写接口。请配置独立的语音转写服务后再试。",
        },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const audio = formData.get("audio");
    const language = normalizeLanguageCode(formData.get("language"));

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "未接收到可转写的音频文件。" },
        { status: 400 }
      );
    }

    if (audio.size === 0) {
      return NextResponse.json(
        { error: "音频片段为空，请重新共享标签页音频。" },
        { status: 400 }
      );
    }

    const transcript = await openai.audio.transcriptions.create({
      file: audio,
      model: TRANSCRIBE_MODEL,
      response_format: "json",
      ...(language ? { language } : {}),
    });

    return NextResponse.json({
      text: String(transcript?.text || "").trim(),
      model: TRANSCRIBE_MODEL,
    });
  } catch (error) {
    console.error("Live audio transcription failed:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
