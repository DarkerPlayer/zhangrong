const aborted = () => new DOMException('已停止生成。', 'AbortError');

/** Consume the app protocol, keeping final metadata separate from deltas. */
export async function consumeChatStream(response, { signal, onDelta = () => {} } = {}) {
  if (signal?.aborted) throw aborted();
  if (response.ok === false) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error || '本地聊天暂时不可用。');
  }
  if (!response.body?.getReader) throw new Error('聊天传输中断，请重试。');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  let pending = '', done = false, result, bytes = 0, characters = 0;
  const record = async line => {
    if (!line.trim()) return;
    if (done) throw new Error('聊天结束后的片段顺序异常。');
    const value = JSON.parse(line);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('聊天片段格式无效。');
    if (typeof value.error === 'string') throw new Error(value.error);
    if ('delta' in value) {
      if (typeof value.delta !== 'string') throw new Error('聊天片段格式无效。');
      characters += value.delta.length;
      if (characters > 4000) throw new Error('聊天回复超出长度限制。');
      if (value.delta) await onDelta(value.delta);
    }
    if (value.done === true) {
      if (!value.result || typeof value.result.reply !== 'string' || !value.result.reply.trim()) throw new Error('聊天完成信息无效。');
      if (value.result.reply.length > 4000) throw new Error('聊天回复超出长度限制。');
      result = value.result;
      done = true;
    } else if (!('delta' in value)) throw new Error('聊天片段格式无效。');
  };
  try {
    while (true) {
      if (signal?.aborted) throw aborted();
      const part = await reader.read();
      if (signal?.aborted) throw aborted();
      bytes += part.value?.byteLength || 0;
      if (bytes > 1000000) throw new Error('聊天传输超出长度限制。');
      pending += decoder.decode(part.value || new Uint8Array(), { stream: !part.done });
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end); pending = pending.slice(end + 1);
        await record(line);
        if (signal?.aborted) throw aborted();
      }
      if (pending.length > 65536) throw new Error('聊天片段超出长度限制。');
      if (part.done) break;
    }
    if (pending.trim()) await record(pending);
    if (signal?.aborted) throw aborted();
    if (!done) throw new Error('聊天传输中断，请重试。');
    return result;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
