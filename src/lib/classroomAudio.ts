export const CLASSROOM_SAMPLE_RATE = 16_000;
const MIN_SIGNAL = 0.003;
const MAX_SEGMENT_SECONDS = 10;
const PAUSE_SECONDS = 0.75;

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

export async function captureClassroomAudio(
  stream: MediaStream,
  onChunk: (samples: Float32Array) => void,
  onLevel: (level: number) => void,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const context = new AudioContext();
  const abortStartup = () => { void context.close().catch(() => {}); };
  signal.addEventListener("abort", abortStartup, { once: true });
  let node: AudioWorkletNode;
  let input: MediaStreamAudioSourceNode;
  try {
    await context.audioWorklet.addModule("/classroom-audio-worklet.js");
    signal.throwIfAborted();
    input = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    node = new AudioWorkletNode(context, "classroom-audio-capture", { channelCount: 1, channelCountMode: "explicit" });
    input.connect(node);
    // The worklet emits silence to its output, so capture does not replay the audio.
    node.connect(context.destination);
    await context.resume();
    signal.throwIfAborted();
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", abortStartup);
  }

  const segment = new Float32Array(Math.round(context.sampleRate * MAX_SEGMENT_SECONDS));
  const pauseSamples = Math.round(context.sampleRate * PAUSE_SECONDS);
  let length = 0;
  let collecting = false;
  let hasSignal = false;
  let quietSamples = 0;
  let flush: (() => void) | undefined;
  const sendSegment = () => {
    if (hasSignal && length >= context.sampleRate * 0.2) {
      onChunk(resample(segment.subarray(0, length), context.sampleRate));
    }
    length = 0;
    hasSignal = false;
    quietSamples = 0;
  };
  node.port.onmessage = (event) => {
    if (event.data === "flushed") {
      flush?.();
      return;
    }
    if (!(event.data instanceof Float32Array)) return;
    const packet = event.data;
    let energy = 0;
    for (const sample of packet) energy += sample * sample;
    const rms = Math.sqrt(energy / packet.length);
    const audible = rms >= MIN_SIGNAL;
    onLevel(Math.min(100, Math.round(rms * 2000)));
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
  };

  let closed: Promise<void> | undefined;
  function close(sendRemainder: boolean) {
    if (closed) return closed;
    closed = (async () => {
      if (sendRemainder) {
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 750);
          flush = () => {
            window.clearTimeout(timer);
            resolve();
          };
          node.port.postMessage("flush");
        });
        // Keep the audio already delivered to the page even if the worklet cannot acknowledge
        // a flush after the browser ends the shared track.
        sendSegment();
      }
      node.port.close();
      input.disconnect();
      node.disconnect();
      await context.close();
    })();
    return closed;
  }

  return {
    begin: () => { collecting = true; },
    close,
  };
}
