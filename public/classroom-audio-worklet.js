/* global AudioWorkletProcessor, registerProcessor, sampleRate */

class ClassroomAudioCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(Math.round(sampleRate / 4));
    this.length = 0;
    this.recording = true;
    this.port.onmessage = (event) => {
      if (event.data === "flush") {
        this.recording = false;
        this.send();
        this.port.postMessage("flushed");
      }
    };
  }

  send() {
    if (this.length === 0) return;
    const audio = this.samples.slice(0, this.length);
    this.length = 0;
    this.port.postMessage(audio, [audio.buffer]);
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!this.recording || !channel) return true;
    for (let start = 0; start < channel.length;) {
      const count = Math.min(channel.length - start, this.samples.length - this.length);
      this.samples.set(channel.subarray(start, start + count), this.length);
      this.length += count;
      start += count;
      if (this.length === this.samples.length) this.send();
    }
    return true;
  }
}

registerProcessor("classroom-audio-capture", ClassroomAudioCapture);
