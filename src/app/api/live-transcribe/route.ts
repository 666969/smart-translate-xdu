import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || "180000");
const TRANSCRIBE_MODEL =
  process.env.OPENAI_TRANSCRIBE_MODEL ||
  process.env.OPENAI_TRANSCRIPTION_MODEL ||
  "whisper-1";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
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
