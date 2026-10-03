import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createVoiceLibrary } from "./voice-library.mjs";
import { createSpeechWorker } from "./speech-worker.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
let voicePromise;

export function localVoice() {
  if (!voicePromise)
    voicePromise = (async () => {
      if (process.platform !== "darwin") return null;
      try {
        const { stdout } = await execFileAsync("/usr/bin/say", ["-v", "?"], {
          timeout: 5000,
          maxBuffer: 100000,
        });
        return (
          ["Tingting", "Meijia"].find((name) =>
            new RegExp(`^${name}\\s+zh_`, "m").test(stdout),
          ) || null
        );
      } catch {
        return null;
      }
    })();
  return voicePromise;
}

async function systemSpeech(text, { signal } = {}) {
  const voice = await localVoice();
  if (!voice)
    throw Object.assign(new Error("此设备暂没有可用的中文系统语音。"), {
      status: 503,
    });
  const directory = await mkdtemp(join(tmpdir(), "muyu-voice-"));
  try {
    const path = join(directory, "speech.wav");
    // execFile passes text as one literal argument; -- prevents option injection.
    await execFileAsync(
      "/usr/bin/say",
      [
        "-v",
        voice,
        "-r",
        "175",
        "-o",
        path,
        "--file-format=WAVE",
        "--data-format=LEI16@22050",
        "--",
        text,
      ],
      { timeout: 45000, signal, maxBuffer: 100000 },
    );
    return await readFile(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const defaultRoot = fileURLToPath(
  new URL("../.runtime/voice/", import.meta.url),
);
export function createVoiceService({
  runtimeRoot = defaultRoot,
  libraryDirectory,
  workerFactory = createSpeechWorker,
  workerIdleMs = 120000,
  audioCacheBytes = 16 * 1024 * 1024,
} = {}) {
  let worker,
    configuration,
    closed = false;
  const cache = new Map();
  let cacheBytes = 0, warming, active, revision = 0;
  const queue = [];
  const aborted = () => Object.assign(new Error("已停止朗读。"), { name: "AbortError" });
  const unavailable = () => Object.assign(new Error("语音服务已关闭。"), { status: 503 });
  function cancelTask(task, error = aborted()) {
    task.options.signal?.removeEventListener("abort", task.cancel);
    task.controller.abort();
    const index = queue.indexOf(task);
    if (index >= 0) queue.splice(index, 1);
    task.reject(error);
  }
  function pump() {
    if (closed || active || !queue.length) return;
    const task = active = queue.shift();
    service.synthesizeRequest(task.text, { ...task.options, signal: task.controller.signal }, task)
      .then(task.resolve, task.reject)
      .finally(() => {
        task.options.signal?.removeEventListener("abort", task.cancel);
        active = undefined;
        pump();
      });
  }
  const reset = () => {
    revision++;
    const error = closed ? unavailable() : aborted();
    for (const task of [...queue]) cancelTask(task, error);
    if (active) cancelTask(active, error);
    worker?.close();
    worker = undefined;
    warming = undefined;
    cache.clear();
    cacheBytes = 0;
  };
  const library = libraryDirectory
    ? createVoiceLibrary({
        directory: libraryDirectory,
        builtinRoot: runtimeRoot,
        transcribe: async (filename, { signal } = {}) => {
          reset();
          try {
            const { stdout } = await execFileAsync(
              join(runtimeRoot, "python/bin/python3"),
              [
                "-u",
                fileURLToPath(
                  new URL("./transcribe-reference.py", import.meta.url),
                ),
                join(runtimeRoot, "asr"),
                filename,
              ],
              {
                signal,
                timeout: 120000,
                maxBuffer: 1024 * 1024,
                env: {
                  ...process.env,
                  HF_HUB_OFFLINE: "1",
                  TRANSFORMERS_OFFLINE: "1",
                  PYTHONNOUSERSITE: "1",
                  PYTHONDONTWRITEBYTECODE: "1",
                },
              },
            );
            return JSON.parse(stdout).text;
          } catch (error) {
            throw Object.assign(
              new Error(
                signal?.aborted
                  ? "制作已取消。"
                  : "自动识别失败，请填写这段录音的台词后重试。",
              ),
              { status: 503 },
            );
          }
        },
      })
    : null;
  async function config() {
    if (!configuration)
      configuration = (async () => {
        if (!existsSync(join(runtimeRoot, "profile.json")))
          return {
            mode: "system",
            available: !!(await localVoice()),
            name: "系统中文",
            local: true,
          };
        try {
          const profile = JSON.parse(
            await readFile(join(runtimeRoot, "profile.json"), "utf8"),
          );
          if (
            typeof profile.referenceText !== "string" ||
            !profile.referenceText.trim()
          )
            throw Error();
          await Promise.all(
            [
              "python/bin/python3",
              "reference.wav",
              "model/config.json",
              "model/model.safetensors",
              "model/speech_tokenizer/model.safetensors",
            ].map((name) => access(join(runtimeRoot, name))),
          );
          return {
            mode: "reference",
            available: true,
            name: "参考音色",
            local: true,
          };
        } catch {
          return {
            mode: "reference",
            available: false,
            name: "参考音色",
            local: true,
          };
        }
      })();
    return configuration;
  }
  const service = {
    warmup() {
      if (!warming) {
        const pending = service.synthesize("", { warmup: true });
        warming = pending;
        pending
          .finally(() => {
            if (warming === pending) warming = undefined;
          })
          .catch(() => {});
      }
      return warming;
    },
    library,
    reset,
    invalidateVoice(id) {
      revision++;
      for (const [key, chunks] of cache) {
        if (!key.startsWith(id + ":")) continue;
        cacheBytes -= chunks.reduce((n, chunk) => n + chunk.length, 0);
        cache.delete(key);
      }
      for (const task of [...queue, ...(active ? [active] : [])]) {
        if ((task.voiceId || task.options.voiceProfileId) === id) cancelTask(task);
      }
    },
    async info() {
      const info = await config();
      if (!library) return info;
      const selected = await library.current();
      return { ...info, name: selected.name, id: selected.id };
    },
    synthesize(text, options = {}) {
      if (closed) return Promise.reject(unavailable());
      if (options.signal?.aborted) return Promise.reject(aborted());
      if (queue.length >= 3)
        return Promise.reject(Object.assign(new Error("正在准备声音，请稍后再试。"), { status: 503 }));
      return new Promise((resolve, reject) => {
        const task = { text, options, resolve, reject, controller: new AbortController() };
        task.cancel = () => cancelTask(task);
        options.signal?.addEventListener("abort", task.cancel, { once: true });
        queue.push(task);
        pump();
      });
    },
    async synthesizeRequest(text, { signal, onChunk, warmup = false, voiceProfileId } = {}, task) {
      const requestRevision = revision;
      if (closed)
        throw Object.assign(new Error("语音服务已关闭。"), { status: 503 });
      if (signal?.aborted)
        throw Object.assign(new Error("已停止朗读。"), { name: "AbortError" });
      const voice = library
        ? await (voiceProfileId == null ? library.current() : library.resolve(voiceProfileId))
        : { id: "builtin", root: runtimeRoot };
      if (task) task.voiceId = voice.id;
      const selected = await config();
      if (closed)
        throw Object.assign(new Error("语音服务已关闭。"), { status: 503 });
      if (signal?.aborted)
        throw Object.assign(new Error("已停止朗读。"), { name: "AbortError" });
      if (selected.mode === "system") {
        if (warmup) return;
        const audio = await systemSpeech(text, { signal });
        if (onChunk) {
          onChunk(audio);
          return;
        }
        return audio;
      }
      if (!selected.available)
        throw Object.assign(new Error("参考音色文件不完整，请重新安装应用。"), {
          status: 503,
        });
      if (closed || signal?.aborted)
        throw Object.assign(new Error("已停止朗读。"), { name: "AbortError" });
      const cacheKey = voice.id + ":" + text;
      if (!warmup && cache.has(cacheKey)) {
        const chunks = cache.get(cacheKey);
        cache.delete(cacheKey);
        cache.set(cacheKey, chunks);
        if (onChunk) {
          for (const chunk of chunks) {
            if (signal?.aborted) throw aborted();
            onChunk(chunk);
          }
          return;
        }
        return joinWav(chunks);
      }
      worker ||= workerFactory({
        command: join(runtimeRoot, "python/bin/python3"),
        args: [
          "-u",
          fileURLToPath(new URL("./reference-voice.py", import.meta.url)),
          runtimeRoot,
        ],
        env: {
          ...process.env,
          HF_HUB_OFFLINE: "1",
          TRANSFORMERS_OFFLINE: "1",
          PYTHONNOUSERSITE: "1",
          PYTHONDONTWRITEBYTECODE: "1",
        },
        cwd: runtimeRoot,
        idleMs: workerIdleMs,
      });
      if (warmup) return worker.warmup({ signal, voiceRoot: voice.root });
      const chunks = [];
      let bytes = 0;
      const audio = await worker.synthesize(text, {
        signal,
        voiceRoot: voice.root,
        ...(onChunk
          ? {
              onChunk: (chunk) => {
                onChunk(chunk);
                bytes += chunk.length;
                if (bytes <= audioCacheBytes) chunks.push(chunk);
                else chunks.length = 0;
              },
            }
          : {}),
      });
      if (!onChunk) {
        chunks.push(audio);
        bytes = audio.length;
      }
      if (bytes <= audioCacheBytes && !closed && !signal?.aborted && revision === requestRevision) {
        if (cache.has(cacheKey))
          cacheBytes -= cache.get(cacheKey).reduce((n, c) => n + c.length, 0);
        cache.set(cacheKey, chunks);
        cacheBytes += bytes;
        while (cacheBytes > audioCacheBytes) {
          const key = cache.keys().next().value;
          cacheBytes -= cache.get(key).reduce((n, c) => n + c.length, 0);
          cache.delete(key);
        }
      }
      return audio;
    },
    close() {
      closed = true;
      reset();
    },
  };
  return service;
}

function joinWav(chunks) {
  if (chunks.length === 1) return chunks[0];
  const pcm = Buffer.concat(chunks.map((chunk) => chunk.subarray(44)));
  const header = Buffer.from(chunks[0].subarray(0, 44));
  header.writeUInt32LE(36 + pcm.length, 4);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
