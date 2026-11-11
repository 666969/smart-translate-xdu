export interface ProgressValue {
  completed: number;
  total: number;
}

export function postWithUploadProgress(
  url: string,
  body: FormData | string,
  signal: AbortSignal,
  onProgress: (progress: ProgressValue | null) => void,
) {
  return new Promise<Response>((resolve, reject) => {
    signal.throwIfAborted();
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const done = () => signal.removeEventListener("abort", abort);
    request.open("POST", url);
    if (typeof body === "string") {
      request.setRequestHeader("Content-Type", "application/json");
      onProgress({ completed: 0, total: new Blob([body]).size });
    }
    const reportProgress = (event: ProgressEvent) => {
      if (event.lengthComputable) onProgress({ completed: event.loaded, total: event.total });
    };
    request.upload.onloadstart = reportProgress;
    request.upload.onprogress = reportProgress;
    request.upload.onload = () => onProgress(null);
    request.onload = () => {
      done();
      if (request.status < 200) {
        reject(new Error("上传连接中断，请重试。"));
        return;
      }
      const empty = [204, 205, 304].includes(request.status);
      resolve(new Response(empty ? null : request.responseText, { status: request.status }));
    };
    request.onerror = () => {
      done();
      reject(new Error("上传连接中断，请重试。"));
    };
    request.onabort = () => {
      done();
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      request.send(body);
    } catch (error) {
      done();
      reject(error);
    }
  });
}
