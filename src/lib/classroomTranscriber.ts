interface PendingRequest {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
}

export function createClassroomTranscriber() {
  const worker = new Worker("/classroom-transcriber.js", { type: "module" });
  const pending = new Map<number, PendingRequest>();
  let nextId = 0;
  let closed = false;

  function close(error = new Error("语音识别已停止。")) {
    closed = true;
    worker.terminate();
    pending.forEach(({ reject }) => reject(error));
    pending.clear();
  }

  worker.onerror = () => close(new Error("当前浏览器无法启动设备端语音识别。"));
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data.text);
  };

  function request(samples?: Float32Array, language?: string) {
    return new Promise<string>((resolve, reject) => {
      if (closed) {
        reject(new Error("语音识别已停止。"));
        return;
      }
      const id = nextId++;
      pending.set(id, { resolve, reject });
      try {
        const transfer = samples?.buffer instanceof ArrayBuffer ? [samples.buffer] : [];
        worker.postMessage({ id, samples, language }, transfer);
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  return {
    prepare: () => request(),
    transcribe: (samples: Float32Array, language: string) => request(samples, language),
    close,
  };
}
