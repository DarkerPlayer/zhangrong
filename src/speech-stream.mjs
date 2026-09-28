/** Schedule successive PCM WAV chunks on one audio clock, without gaps at boundaries. */
export function createStreamPlayer({
  context,
  destination,
  onStart = () => {},
  onEnd = () => {},
}) {
  const sources = new Set();
  let nextTime = 0,
    closed = false,
    complete = false,
    started = false,
    resolve;
  const finished = new Promise((r) => {
    resolve = r;
  });
  const settle = () => {
    if (!closed && complete && !sources.size) {
      closed = true;
      onEnd();
      resolve();
    }
  };
  return {
    finished,
    get playing() {
      return !closed && sources.size > 0;
    },
    async push(base64) {
      if (closed) return;
      if (typeof base64 !== "string" || base64.length > 4 * 1024 * 1024)
        throw Error("语音片段格式无效。");
      const binary = atob(base64),
        bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const buffer = await context.decodeAudioData(bytes.buffer);
      if (closed) return;
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(destination);
      sources.add(node);
      node.onended = () => {
        sources.delete(node);
        node.disconnect();
        settle();
      };
      const when = Math.max(context.currentTime + 0.025, nextTime);
      node.start(when);
      nextTime = when + buffer.duration;
      if (!started) {
        started = true;
        onStart();
      }
    },
    finish() {
      if (!started) throw Error("未收到有效声音，请重试。");
      complete = true;
      settle();
    },
    cancel() {
      if (closed) return;
      closed = true;
      for (const source of sources) {
        source.onended = null;
        try {
          source.stop();
        } catch {}
        source.disconnect();
      }
      sources.clear();
      resolve();
    },
  };
}

export async function consumeAudioStream(response, onChunk, { signal } = {}) {
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = "",
    done = false;
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("已停止朗读", "AbortError");
      const part = await reader.read();
      pending += decoder.decode(part.value || new Uint8Array(), {
        stream: !part.done,
      });
      if (pending.length > 4 * 1024 * 1024) throw Error("声音片段过大。");
      let end;
      while ((end = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        if (!line.trim()) continue;
        const value = JSON.parse(line);
        if (value.error) throw Error(value.error);
        if (value.audio) {
          if (done) throw Error("声音顺序异常。");
          await onChunk(value.audio);
        }
        if (value.done) done = true;
      }
      if (part.done) break;
    }
    if (!done || pending.trim()) throw Error("声音传输中断，请重试。");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
