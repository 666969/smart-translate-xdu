export const CLASSROOM_SAMPLE_RATE = 16_000;
export const CLASSROOM_VOICE_LEVEL = 3;
const INPUT_LEVEL_SCALE = 2000;
const START_SIGNAL_RMS = CLASSROOM_VOICE_LEVEL / INPUT_LEVEL_SCALE;
// A lower threshold within a phrase keeps softer syllables from ending it early.
const CONTINUE_SIGNAL_RMS = 0.00065;
const MAX_SEGMENT_SECONDS = 10;
const PAUSE_SECONDS = 0.75;

function audioContextConstructor() {
  return window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export function supportsClassroomAudioCapture() {
  const Context = audioContextConstructor();
  return Boolean(Context && (window.AudioWorkletNode || Context.prototype.createScriptProcessor));
}

export function classroomCaptureError(error: unknown, source: "mic" | "tab") {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return source === "mic"
      ? "麦克风权限未开启。请在系统设置和浏览器的网站权限中允许麦克风，再试一次。"
      : "未获得共享权限，请重新选择要共享的标签页。";
  }
  if (name === "NotFoundError") return "找不到可用的音频输入，请检查系统的输入设备。";
  if (name === "NotReadableError") return "麦克风无法打开，请检查系统权限或关闭占用麦克风的应用。";
  return error instanceof Error ? error.message : "无法开启收音，请重试。";
}

function resample(samples: Float32Array, sampleRate: number) {
  const ratio = sampleRate / CLASSROOM_SAMPLE_RATE;
  const output = new Float32Array(Math.floor(samples.length / ratio));
  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += samples[i];
    output[index] = sum / (end - start);
  }
  return output;
}

export function classroomWav(samples: Float32Array) {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, CLASSROOM_SAMPLE_RATE, true);
  view.setUint32(28, CLASSROOM_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.min(1, Math.max(-1, samples[index]));
    view.setInt16(44 + index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }

  return new Blob([bytes], { type: "audio/wav" });
}

async function waitForAudioStep(step: Promise<void>, signal: AbortSignal, message: string) {
  const timeout = AbortSignal.timeout(5_000);
  const deadline = AbortSignal.any([signal, timeout]);
  let abort: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    await Promise.race([
      step,
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.aborted ? signal.reason : new Error(message));
        deadline.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    if (abort) deadline.removeEventListener("abort", abort);
  }
}

async function connectAudioPackets(
  context: AudioContext,
  input: MediaStreamAudioSourceNode,
  onPacket: (packet: Float32Array) => void,
  signal: AbortSignal,
) {
  if (context.audioWorklet && typeof window.AudioWorkletNode === "function") {
    try {
      await waitForAudioStep(context.audioWorklet.addModule("/classroom-audio-worklet.js"), signal, "音频处理加载超时。");
      signal.throwIfAborted();
      const node = new AudioWorkletNode(context, "classroom-audio-capture", { channelCount: 1, channelCountMode: "explicit" });
      let flushed: (() => void) | undefined;
      node.port.onmessage = ({ data }) => {
        if (data === "flushed") flushed?.();
        else if (data instanceof Float32Array) onPacket(data);
      };
      input.connect(node);
      node.connect(context.destination);
      return {
        flush: () => new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 750);
          flushed = () => { window.clearTimeout(timer); resolve(); };
          node.port.postMessage("flush");
        }),
        close: () => { node.port.close(); node.disconnect(); },
      };
    } catch {
      signal.throwIfAborted();
    }
  }
  if (typeof context.createScriptProcessor !== "function") {
    throw new Error("当前浏览器无法处理录音，请换用支持麦克风的浏览器。");
  }

  // Some embedded browsers support Web Audio capture without AudioWorklet.
  const node = context.createScriptProcessor(4096, 1, 1);
  const buffer = new Float32Array(Math.round(context.sampleRate / 4));
  let length = 0;
  node.onaudioprocess = (event) => {
    event.outputBuffer.getChannelData(0).fill(0);
    const samples = event.inputBuffer.getChannelData(0);
    for (let offset = 0; offset < samples.length;) {
      const count = Math.min(samples.length - offset, buffer.length - length);
      buffer.set(samples.subarray(offset, offset + count), length);
      length += count;
      offset += count;
      if (length === buffer.length) {
        onPacket(buffer);
        length = 0;
      }
    }
  };
  input.connect(node);
  node.connect(context.destination);
  return {
    flush: async () => {
      node.onaudioprocess = null;
      if (length) onPacket(buffer.subarray(0, length));
    },
    close: () => { node.onaudioprocess = null; node.disconnect(); },
  };
}

export async function captureClassroomAudio(
  source: "mic" | "tab",
  onChunk: (samples: Float32Array) => void,
  onLevel: (level: number) => void,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const Context = audioContextConstructor();
  if (!Context) throw new Error("当前浏览器无法处理麦克风声音。");
  const context = new Context();
  // Resume during the click, before the microphone permission dialog resolves.
  const ready = context.resume();
  void ready.catch(() => {});
  let stream: MediaStream | undefined;
  let closed: Promise<void> | undefined;
  const stopTracks = () => stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
  const closeContext = () => closed ??= context.close().catch(() => {});
  const abortStartup = () => { stopTracks(); void closeContext(); };
  signal.addEventListener("abort", abortStartup, { once: true });
  const segment = new Float32Array(Math.round(context.sampleRate * MAX_SEGMENT_SECONDS));
  const pauseSamples = Math.round(context.sampleRate * PAUSE_SECONDS);
  let length = 0;
  let collecting = false;
  let hasSignal = false;
  let quietSamples = 0;
  const sendSegment = () => {
    if (hasSignal && length >= context.sampleRate * 0.2) {
      onChunk(resample(segment.subarray(0, length), context.sampleRate));
    }
    length = 0;
    hasSignal = false;
    quietSamples = 0;
  };
  function onPacket(packet: Float32Array) {
    let energy = 0;
    for (const sample of packet) energy += sample * sample;
    const rms = Math.sqrt(energy / packet.length);
    const audible = rms >= (hasSignal ? CONTINUE_SIGNAL_RMS : START_SIGNAL_RMS);
    onLevel(Math.min(100, Math.floor(rms * INPUT_LEVEL_SCALE)));
    if (!collecting) return;
    if (!hasSignal && !audible) {
      // Keep a short lead-in so quiet consonants before a louder vowel are preserved.
      segment.set(packet);
      length = packet.length;
      return;
    }
    for (let offset = 0; offset < packet.length;) {
      const count = Math.min(packet.length - offset, segment.length - length);
      segment.set(packet.subarray(offset, offset + count), length);
      length += count;
      hasSignal ||= audible;
      offset += count;
      if (length === segment.length) sendSegment();
    }
    quietSamples = audible ? 0 : quietSamples + packet.length;
    if (hasSignal && quietSamples >= pauseSamples) sendSegment();
  }

  try {
    stream = source === "tab"
      ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      : await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    signal.throwIfAborted();
    const tracks = stream.getAudioTracks().filter((track) => track.readyState === "live");
    if (!tracks.length) throw new Error(source === "tab"
      ? "没有检测到共享音频。请选择浏览器标签页并勾选共享音频。"
      : "没有检测到麦克风音轨，请检查系统的输入设备。");
    await waitForAudioStep(ready, signal, "浏览器暂未开启音频处理。请保持页面在前台，再点一次开始。");
    const input = context.createMediaStreamSource(new MediaStream(tracks));
    const packets = await connectAudioPackets(context, input, onPacket, signal);
    signal.throwIfAborted();
    let closing: Promise<void> | undefined;
    return {
      tracks: stream.getTracks(),
      begin: () => { collecting = true; },
      close: (finish: boolean) => closing ??= (async () => {
        try {
          if (finish) {
            await packets.flush().catch(() => {});
            sendSegment();
          }
        } finally {
          stopTracks();
          try {
            packets.close();
            input.disconnect();
          } finally {
            await closeContext();
          }
        }
      })(),
    };
  } catch (error) {
    stopTracks();
    await closeContext();
    throw error;
  } finally {
    signal.removeEventListener("abort", abortStartup);
  }
}
