const assets = "/classroom-model/v1/";
let model;

async function loadModel() {
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
