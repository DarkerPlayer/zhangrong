import { spawn } from "node:child_process";

const failure = (message) =>
  Object.assign(new Error(message), {
    status: 503,
    code: "VOICE_REFERENCE_FAILED",
  });
const aborted = () =>
  Object.assign(new Error("已停止朗读。"), { name: "AbortError" });

/** One local model process, bounded queue, cancellation and idle memory release. */
export function createSpeechWorker({
  command,
  args = [],
  env = process.env,
  cwd,
  timeoutMs = 180000,
  idleMs = 120000,
}) {
  let child = null,
    active = null,
    buffer = "",
    timer,
    idle,
    sequence = 0,
    closed = false;
  const queue = [];
  function terminate() {
    clearTimeout(idle);
    const previous = child;
    child = null;
    buffer = "";
    if (previous) {
      previous.kill("SIGTERM");
      const force = setTimeout(() => previous.kill("SIGKILL"), 1500);
      force.unref();
      previous.once("close", () => clearTimeout(force));
    }
  }
  function settle(error, audio) {
    clearTimeout(timer);
    const task = active;
    active = null;
    if (task) {
      task.signal?.removeEventListener("abort", task.cancel);
      error ? task.reject(error) : task.resolve(audio);
    }
    queueMicrotask(pump);
  }
  function broken(error) {
    terminate();
    settle(error);
  }
  function ensureChild() {
    if (child) return;
    const processChild = spawn(command, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    child = processChild;
    // Model library logs may contain reference text. Drain without retaining them.
    processChild.stderr.on("data", () => {});
    processChild.stdin.on("error", () => {
      if (child === processChild)
        broken(failure("参考音色服务暂时不可用，请重试。"));
    });
    processChild.on("error", () => {
      if (child === processChild) broken(failure("无法启动本地参考音色服务。"));
    });
    processChild.on("close", () => {
      if (child === processChild)
        broken(failure("参考音色服务已中断，请重试。"));
    });
    processChild.stdout.setEncoding("utf8");
    processChild.stdout.on("data", (chunk) => {
      if (child !== processChild) return;
      buffer += chunk;
      if (buffer.length > 32 * 1024 * 1024)
        return broken(failure("语音输出超过本机限制。"));
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          const response = JSON.parse(line);
          if (!active || response.id !== active.id)
            throw Error("invalid response");
          if (response.error)
            return broken(failure("参考音色合成失败，请稍后重试。"));
          if (response.ready && active.operation === "warmup") {
            settle(null);
            continue;
          }
          if (response.cancelled && active.cancelled) {
            settle(aborted());
            continue;
          }
          if (response.done && active.onChunk) {
            settle(active.cancelled ? aborted() : null);
            continue;
          }
          const audio = Buffer.from(response.audio, "base64");
          if (
            audio.length < 44 ||
            audio.subarray(0, 4).toString() !== "RIFF" ||
            audio.subarray(8, 12).toString() !== "WAVE"
          )
            throw Error("invalid wav");
          if (response.chunk && active.onChunk) {
            if (!active.cancelled) active.onChunk(audio);
            continue;
          }
          settle(null, audio);
        } catch {
          return broken(failure("参考音色服务返回了无效音频。"));
        }
      }
    });
  }
  function pump() {
    if (closed || active) return;
    if (!queue.length) {
      if (idleMs > 0) {
        idle = setTimeout(terminate, idleMs);
        idle.unref();
      }
      return;
    }
    clearTimeout(idle);
    active = queue.shift();
    if (active.signal?.aborted) {
      settle(aborted());
      return;
    }
    ensureChild();
    timer = setTimeout(
      () => broken(failure("参考音色合成超时，请缩短文字后重试。")),
      timeoutMs,
    );
    child.stdin.write(
      JSON.stringify({
        id: active.id,
        text: active.text,
        stream: !!active.onChunk,
        operation: active.operation,
        voiceRoot: active.voiceRoot,
      }) + "\n",
    );
  }
  const service = {
    warmup(options = {}) {
      return service.synthesize("", { ...options, operation: "warmup" });
    },
    synthesize(text, { signal, onChunk, operation, voiceRoot } = {}) {
      if (closed) return Promise.reject(failure("语音服务已关闭。"));
      if (signal?.aborted) return Promise.reject(aborted());
      if (queue.length >= 3)
        return Promise.reject(failure("正在准备声音，请稍后再试。"));
      return new Promise((resolve, reject) => {
        const task = {
          id: ++sequence,
          text,
          signal,
          resolve,
          reject,
          onChunk,
          operation,
          voiceRoot,
        };
        task.cancel = () => {
          if (active === task) {
            if (task.onChunk && child) {
              task.cancelled = true;
              task.reject(aborted());
              child.stdin.write(JSON.stringify({ cancel: task.id }) + "\n");
              clearTimeout(timer);
              timer = setTimeout(() => broken(aborted()), 2000);
            } else broken(aborted());
            return;
          }
          const index = queue.indexOf(task);
          if (index >= 0) {
            queue.splice(index, 1);
            signal.removeEventListener("abort", task.cancel);
            reject(aborted());
          }
        };
        signal?.addEventListener("abort", task.cancel, { once: true });
        queue.push(task);
        queueMicrotask(pump);
      });
    },
    close() {
      if (closed) return;
      closed = true;
      terminate();
      clearTimeout(timer);
      if (active) settle(failure("语音服务已关闭。"));
      for (const task of queue.splice(0)) {
        task.signal?.removeEventListener("abort", task.cancel);
        task.reject(failure("语音服务已关闭。"));
      }
    },
  };
  return service;
}
