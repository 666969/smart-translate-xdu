const assets = "/classroom-model/v1/";
const largeAssets = new Map([
  ["runtime/ort-wasm-simd-threaded.jsep.wasm", { name: "wasm", size: 21_596_019, contentType: "application/wasm" }],
  ["whisper-base/onnx/encoder_model_quantized.onnx", { name: "encoder", size: 23_200_850, contentType: "application/octet-stream" }],
  ["whisper-base/onnx/decoder_model_merged_quantized.onnx", { name: "decoder", size: 53_707_539, contentType: "application/octet-stream" }],
]);
const totalBytes = [...largeAssets.values()].reduce((sum, asset) => sum + asset.size, 0);
const partBytes = 1024 * 1024;
const browserFetch = self.fetch.bind(self);
let downloadedBytes = 0;
let model;

async function downloadPart(asset, index, signal) {
  const start = index * partBytes;
  const length = Math.min(asset.size - start, partBytes);
  const partUrl = assets + "parts/" + asset.name + "/" + index + ".bin";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await browserFetch(partUrl, {
        cache: attempt === 0 ? "default" : "reload",
        signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
      });
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new Error("Model part unavailable");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== length) throw new Error("Incomplete model download");
      downloadedBytes += bytes.length;
      self.postMessage({ progress: Math.min(100, Math.round(downloadedBytes / totalBytes * 100)) });
      return bytes;
    } catch (error) {
      if (signal.aborted || attempt === 1) throw error;
    }
  }
}

function downloadAsset(asset, signal) {
  const controller = new AbortController();
  const active = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const count = Math.ceil(asset.size / partBytes);
  const pending = new Map();
  let next = 0;
  let index = 0;
  function prefetch() {
    while (pending.size < 3 && next < count) {
      const part = next++;
      pending.set(part, downloadPart(asset, part, active).then((bytes) => ({ bytes }), (error) => ({ error })));
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
      "Content-Length": String(asset.size),
      "Content-Type": asset.contentType,
    },
  });
}

async function loadModel() {
  // The worker only intercepts the three pinned, same-origin model binaries.
  self.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input, self.location.href);
    const asset = url.origin === self.location.origin && url.pathname.startsWith(assets)
      ? largeAssets.get(url.pathname.slice(assets.length)) : undefined;
    return asset ? downloadAsset(asset, options?.signal ?? (input instanceof Request ? input.signal : undefined))
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
