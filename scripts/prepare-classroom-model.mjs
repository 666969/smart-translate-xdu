import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const output = resolve("public/classroom-model/v1");
const runtimeUrl = "https://registry.npmjs.org/@huggingface/transformers/-/transformers-3.8.1.tgz";
const runtimeSize = 10_482_401;
const runtimeHash = "tsTk4zVjImqdqjS8/AOZg2yNLd1z9S5v+7oUPpXaasDRwEDhB+xnglK1k5cad26lL5/ZIaeREgWWy0bs9y9pPA==";
const runtimeFiles = ["transformers.min.js", "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"];
const modelUrl = "https://huggingface.co/Xenova/whisper-base/resolve/64da57285918e20ea79ea5c88eed7197933abaa8/";
const modelFiles = ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"];
const weights = [
  ["onnx/encoder_model_quantized.onnx", 23_200_850, "3e345e977b55620a37c0c2b2af0644e019afdfad562dcf71eb929bb7274285f9"],
  ["onnx/decoder_model_merged_quantized.onnx", 53_707_539, "a6beb6baabb66f00b6a686d828c95ffca6146d51900cbad0266cad38f64cf861"],
];
const browserPartBytes = 1024 * 1024;
const browserBinaries = [
  ["wasm", "runtime/ort-wasm-simd-threaded.jsep.wasm", 21_596_019],
  ["encoder", "whisper-base/" + weights[0][0], weights[0][1]],
  ["decoder", "whisper-base/" + weights[1][0], weights[1][1]],
];

async function download(url, target, range) {
  await run("curl", [
    "--fail", "--location", "--silent", "--show-error", "--connect-timeout", "15",
    "--max-time", "90", "--retry", "2", "--retry-all-errors",
    ...(range ? ["--range", range] : []), "--output", target, url,
  ]);
}

async function digest(path, algorithm, encoding) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest(encoding);
}

async function waitForDownloads(downloads) {
  return (await Promise.allSettled(downloads)).map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
}

async function prepareRuntime(scratch) {
  const archive = join(scratch, "runtime.tgz");
  await downloadParts(runtimeUrl, archive, runtimeSize, 2 * 1024 * 1024);
  if (await digest(archive, "sha512", "base64") !== runtimeHash) throw new Error("Unexpected speech runtime archive");
  const files = runtimeFiles.map((file) => "package/dist/" + file);
  await run("tar", ["-xzf", archive, "-C", scratch, ...files]);
  await Promise.all(runtimeFiles.map((file) => copyFile(join(scratch, "package/dist", file), join(output, "runtime", file))));
}

async function downloadParts(url, target, size, partSize) {
  await mkdir(dirname(target), { recursive: true });
  const stream = await open(target, "w");
  try {
    const offsets = Array.from({ length: Math.ceil(size / partSize) }, (_, index) => index * partSize);
    for (let index = 0; index < offsets.length; index += 4) {
      const parts = await waitForDownloads(offsets.slice(index, index + 4).map(async (start) => {
        const end = Math.min(start + partSize, size) - 1;
        const range = start + "-" + end;
        const part = target + "." + range;
        const targetUrl = new URL(url);
        targetUrl.searchParams.set("part", range);
        await download(targetUrl.href, part, range);
        const bytes = await readFile(part);
        if (bytes.length !== end - start + 1) throw new Error("Incomplete model part " + range);
        return { start, bytes, part };
      }));
      for (const { start, bytes, part } of parts) {
        const result = await stream.write(bytes, 0, bytes.length, start);
        if (result.bytesWritten !== bytes.length) throw new Error("Incomplete model write");
        await rm(part);
      }
    }
  } finally {
    await stream.close();
  }
}

async function prepareWeight(scratch, [file, size, sha256]) {
  const target = join(scratch, file);
  await downloadParts(modelUrl + file + "?download=true", target, size, 4 * 1024 * 1024);
  if (await digest(target, "sha256", "hex") !== sha256) throw new Error("Unexpected model file " + file);
  await copyFile(target, join(output, "whisper-base", file));
}

async function publishBrowserParts() {
  for (const [name, file, size] of browserBinaries) {
    const directory = join(output, "parts", name);
    await mkdir(directory, { recursive: true });
    const source = await open(join(output, file), "r");
    try {
      for (let index = 0, offset = 0; offset < size; index += 1, offset += browserPartBytes) {
        const target = join(directory, index + ".bin");
        const length = Math.min(browserPartBytes, size - offset);
        if ((await stat(target).catch(() => null))?.size === length) continue;
        const bytes = Buffer.allocUnsafe(length);
        const result = await source.read(bytes, 0, length, offset);
        if (result.bytesRead !== length) throw new Error("Incomplete browser model part " + name + "/" + index);
        await writeFile(target, bytes);
      }
    } finally {
      await source.close();
    }
  }
  await writeFile(join(output, "ready.json"), JSON.stringify({ model: "whisper-base", transport: "parts-v1" }));
}

async function prepareModel() {
  const paths = [
    ...runtimeFiles.map((file) => ["runtime/" + file, 1]),
    ...modelFiles.map((file) => ["whisper-base/" + file, 1]),
    ...browserBinaries.map(([, file, size]) => [file, size]),
    ["ready.json", 1],
  ];
  const alreadyPrepared = await Promise.all(paths.map(async ([file, size]) =>
    (await stat(join(output, file)).catch(() => null))?.size >= size));
  if (alreadyPrepared.every(Boolean)) {
    await publishBrowserParts();
    return;
  }

  const tempRoot = resolve(tmpdir());
  const scratch = await mkdtemp(join(tempRoot, "zhiyi-classroom-model-"));
  try {
    await mkdir(join(output, "runtime"), { recursive: true });
    await mkdir(join(output, "whisper-base/onnx"), { recursive: true });
    await waitForDownloads([
      prepareRuntime(scratch),
      ...modelFiles.map((file) => download(modelUrl + file + "?download=true", join(output, "whisper-base", file))),
    ]);
    for (const weight of weights) {
      console.log("Preparing classroom speech model:", weight[0]);
      await prepareWeight(scratch, weight);
    }
    await publishBrowserParts();
  } finally {
    if (dirname(resolve(scratch)) === tempRoot) await rm(scratch, { recursive: true, force: true });
  }
}

if (process.env.RENDER === "true" || process.argv.includes("--prepare")) {
  await prepareModel();
}
