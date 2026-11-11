const assets = "/classroom-model/v1/";
const largeAssets = new Map([
  ["runtime/ort-wasm-simd-threaded.jsep.wasm", 21_596_019],
  ["whisper-base/onnx/encoder_model_quantized.onnx", 23_200_850],
  ["whisper-base/onnx/decoder_model_merged_quantized.onnx", 53_707_539],
]);
const totalBytes = [...largeAssets.values()].reduce((sum, size) => sum + size, 0);
const partBytes = 2 * 1024 * 1024;
const browserFetch = self.fetch.bind(self);
let downloadedBytes = 0;
let model;

async function downloadPart(url, size, index, signal) {
  const start = index * partBytes;
  const end = Math.min(size, start + partBytes) - 1;
  const partUrl = new URL(url);
  const range = start + "-" + end;
  partUrl.searchParams.set("part", range);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await browserFetch(partUrl, {
        headers: { Range: "bytes=" + range },
        signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
      });
      if (response.status !== 206 || response.headers.get("content-range") !== "bytes " + range + "/" + size) {
        await response.body?.cancel();
        throw new Error("Unexpected model download range");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== end - start + 1) throw new Error("Incomplete model download");
      downloadedBytes += bytes.length;
      self.postMessage({ progress: Math.min(100, Math.round(downloadedBytes / totalBytes * 100)) });
      return bytes;
    } catch (error) {
      if (signal.aborted || attempt === 1) throw error;
    }
  }
}

function downloadAsset(url, size, signal) {
  const controller = new AbortController();
  const active = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const count = Math.ceil(size / partBytes);
  const pending = new Map();
  let next = 0;
  let index = 0;
  function prefetch() {
    while (pending.size < 3 && next < count) {
      const part = next++;
      pending.set(part, downloadPart(url, size, part, active).then((bytes) => ({ bytes }), (error) => ({ error })));
    }
  }
  const stream = new ReadableStream({
    start: prefetch,
    async pull(output) {
      const { bytes, error } = await pending.get(index);
      if (error) {
        controller.abort();
        output.error(error);
        return;
      }
      output.enqueue(bytes);
      pending.delete(index++);
      if (index === count) output.close();
      else prefetch();
    },
    cancel() { controller.abort(); },
  });
  return new Response(stream, {
    headers: {
      "Content-Length": String(size),
      "Content-Type": url.pathname.endsWith(".wasm") ? "application/wasm" : "application/octet-stream",
    },
  });
}

async function loadModel() {
  // The worker only intercepts the three pinned, same-origin model binaries.
  self.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input, self.location.href);
    const size = url.origin === self.location.origin && url.pathname.startsWith(assets)
      ? largeAssets.get(url.pathname.slice(assets.length)) : undefined;
    return size ? downloadAsset(url, size, options?.signal ?? (input instanceof Request ? input.signal : undefined))
      : browserFetch(input, options);
  };
  const { env, pipeline } = await import(assets + "runtime/transformers.min.js");
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = assets;
  env.backends.onnx.wasm.wasmPaths = assets + "runtime/";
  env.backends.onnx.wasm.numThreads = 1;
  return pipeline("automatic-speech-recognition", "whisper-base", {
    device: "wasm",
    dtype: "q8",
  });
}

function boostQuietSpeech(samples) {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  const gain = Math.min(8, 0.045 / Math.sqrt(energy / samples.length));
  if (gain > 1) {
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = Math.max(-1, Math.min(1, samples[i] * gain));
    }
  }
  return samples;
}

self.onmessage = async ({ data }) => {
  const { id, samples, language } = data;
  try {
    const transcribe = await (model ??= loadModel());
    const result = samples ? await transcribe(boostQuietSpeech(samples), {
      language: language.startsWith("fr") ? "french" : "english",
      task: "transcribe",
      max_new_tokens: 96,
    }) : null;
    self.postMessage({ id, text: result?.text?.trim() ?? "" });
  } catch {
    self.postMessage({ id, error: samples ? "设备端语音识别中断，请重新开始同传。" : "暂时无法下载或运行语音模型，请重试。" });
  }
};
