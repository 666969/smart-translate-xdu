import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { consumeStudyBudget, readStudyForm, StudyApiError, studyApiErrorResponse } from "@/lib/studyApi";
import { MAX_AUDIO_BYTES } from "@/lib/studyLimits";

function speechConfiguration() {
  const speechKey = process.env.OPENAI_TRANSCRIBE_API_KEY;
  const speechBase = process.env.OPENAI_TRANSCRIBE_BASE_URL;
  try {
    if (speechBase) {
      const url = new URL(speechBase);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if ((url.protocol === "https:" || (local && url.protocol === "http:")) && (speechKey || local)) {
        return { apiKey: speechKey || "local-whisper", baseURL: speechBase };
      }
      return null;
    }
    if (speechKey) return { apiKey: speechKey };
    const textBase = process.env.OPENAI_BASE_URL;
    if (process.env.OPENAI_API_KEY && (!textBase || new URL(textBase).origin === "https://api.openai.com")) {
      return { apiKey: process.env.OPENAI_API_KEY, baseURL: textBase };
    }
  } catch {
    return null;
  }
  return null;
}

const configuration = speechConfiguration();
const model = process.env.OPENAI_TRANSCRIBE_MODEL || process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1";
const speechClient = configuration ? new OpenAI({ ...configuration, timeout: 15_000, maxRetries: 0 }) : null;

export function GET() {
  return NextResponse.json({ available: Boolean(speechClient) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    if (!speechClient) {
      throw new StudyApiError("标签页音频需要独立的语音转写服务。你可以先使用麦克风模式。", 503);
    }

    const form = await readStudyForm(request, MAX_AUDIO_BYTES + 16_384);
    const audio = form.get("audio");
    if (!(audio instanceof File) || !audio.size ||
        !/^(?:audio\/(?:wav|x-wav|wave|mpeg|mp4|webm|ogg|flac|m4a)|video\/webm)(?:;|$)/i.test(audio.type)) {
      throw new StudyApiError("未收到可转写的音频片段。");
    }
    if (audio.size > MAX_AUDIO_BYTES) throw new StudyApiError("音频片段过大。", 413);
    const language = String(form.get("language") ?? "").toLowerCase().split("-")[0];
    consumeStudyBudget(request, "speech");
    const transcript = await speechClient.audio.transcriptions.create({
      file: audio, model, response_format: "json",
      ...(language === "fr" || language === "en" ? { language } : {}),
    }, { signal: request.signal });
    return NextResponse.json({ text: String(transcript?.text ?? "").trim(), model });
  } catch (error) {
    const knownError = studyApiErrorResponse(error);
    if (knownError) return knownError;
    if (request.signal.aborted) return NextResponse.json({ error: "转写已取消。" }, { status: 499 });
    console.error("[Speech] Failed", error instanceof OpenAI.APIError ? error.status : (error as Error)?.name);
    return NextResponse.json({ error: "语音转写服务暂不可用，请重试或切换麦克风模式。" }, { status: 502 });
  }
}
