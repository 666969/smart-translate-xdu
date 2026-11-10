const WAV_SAMPLE_RATE = 16_000;

function pcmWav(samples: Float32Array, sampleRate: number) {
  const ratio = sampleRate / WAV_SAMPLE_RATE;
  const length = Math.floor(samples.length / ratio);
  const bytes = new ArrayBuffer(44 + length * 2);
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
  view.setUint32(24, WAV_SAMPLE_RATE, true);
  view.setUint32(28, WAV_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, length * 2, true);

  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += samples[i];
    const value = Math.min(1, Math.max(-1, sum / (end - start)));
    view.setInt16(44 + index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }

  return new Blob([bytes], { type: "audio/wav" });
}

export async function captureClassroomAudio(stream: MediaStream, onChunk: (blob: Blob) => void) {
  const context = new AudioContext();
  let node: AudioWorkletNode;
  let input: MediaStreamAudioSourceNode;
  try {
    await context.audioWorklet.addModule("/classroom-audio-worklet.js");
    input = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    node = new AudioWorkletNode(context, "classroom-audio-capture", { channelCount: 1 });
    input.connect(node);
    // The worklet emits silence to its output, so capture does not replay the audio.
    node.connect(context.destination);
    await context.resume();
  } catch (error) {
    await context.close();
    throw error;
  }

  const segment = new Float32Array(Math.round(context.sampleRate * 5));
  let length = 0;
  let flush: (() => void) | undefined;
  const sendSegment = () => {
    if (length >= context.sampleRate * 0.2) {
      onChunk(pcmWav(segment.subarray(0, length), context.sampleRate));
    }
    length = 0;
  };
  node.port.onmessage = (event) => {
    if (event.data === "flushed") {
      flush?.();
      return;
    }
    if (!(event.data instanceof Float32Array)) return;
    const packet = event.data;
    for (let offset = 0; offset < packet.length;) {
      const count = Math.min(packet.length - offset, segment.length - length);
      segment.set(packet.subarray(offset, offset + count), length);
      length += count;
      offset += count;
      if (length === segment.length) sendSegment();
    }
  };

  let closed: Promise<void> | undefined;
  return (sendRemainder: boolean) => {
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
  };
}
