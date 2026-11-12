export const LIVE_CAPTION_STREAM = "text/event-stream";

export type LiveCaptionEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

class CaptionRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readCaption(response: Response, onUpdate: (text: string) => void) {
  if (!response.ok || !response.headers.get("content-type")?.includes(LIVE_CAPTION_STREAM)) {
    const data = await response.json().catch(() => null);
    if (response.ok && typeof data?.translation === "string" && data.translation.trim()) {
      return data.translation.trim();
    }
    throw new CaptionRequestError(data?.error || "译文暂未生成，请重试。", response.ok ? 502 : response.status);
  }
  if (!response.body) throw new CaptionRequestError("译文传输中断，请重试。", 502);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let translation = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
        if (!frame.startsWith("data: ")) continue;
        const event: LiveCaptionEvent = JSON.parse(frame.slice(6));
        if (event.type === "delta" && typeof event.text === "string") {
          translation += event.text;
          onUpdate(translation);
        } else if (event.type === "done" && translation.trim()) {
          return translation.trim();
        } else if (event.type === "error") {
          throw new CaptionRequestError(event.message, 502);
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  throw new CaptionRequestError("译文传输中断，请重试。", 502);
}

export async function requestLiveCaption(
  form: FormData,
  signal: AbortSignal,
  onUpdate: (text: string) => void,
) {
  let receivedText = false;
  async function translate() {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { Accept: LIVE_CAPTION_STREAM },
      body: form,
      signal: AbortSignal.any([signal, AbortSignal.timeout(16_000)]),
    });
    return readCaption(response, (text) => {
      receivedText ||= Boolean(text.trim());
      onUpdate(text);
    });
  }
  try {
    return await translate();
  } catch (error) {
    const transient = error instanceof TypeError ||
      (error instanceof Error && error.name === "TimeoutError") ||
      (error instanceof CaptionRequestError && [408, 500, 502, 504].includes(error.status));
    if (signal.aborted || receivedText || !transient) throw error;
    return translate();
  }
}
