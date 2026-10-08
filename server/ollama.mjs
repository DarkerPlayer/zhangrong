import { capabilityReply, createMessages, offlineReply } from './dialogue.mjs';

const BASE = 'http://127.0.0.1:11434';
const RECOMMENDED = 'qwen3.5:4b';
const PREFERRED = [RECOMMENDED, 'qwen3.5:9b', 'qwen3:4b', 'qwen2.5:3b', 'qwen2.5:1.5b'];
const MAX_REPLY = 4000;
const abortError = () => Object.assign(new Error('已停止生成。'), { name: 'AbortError' });

function requestScope(signal, timeout) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  return { signal: controller.signal, close() { clearTimeout(timer); signal?.removeEventListener('abort', abort); } };
}

async function consumeText(response, signal, onText) {
  if (signal?.aborted) {
    await response.body?.cancel().catch(() => {});
    throw abortError();
  }
  if (!response.body?.getReader) throw new Error('本地模型返回了无效回复');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  let bytes = 0;
  try {
    while (true) {
      if (signal?.aborted) throw abortError();
      const part = await reader.read();
      if (signal?.aborted) throw abortError();
      bytes += part.value?.byteLength || 0;
      if (bytes > 1000000) throw new Error('本地模型回复超出长度限制');
      const text = decoder.decode(part.value || new Uint8Array(), { stream: !part.done });
      if (text) await onText(text);
      if (part.done) break;
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function requestJson(path, { timeout = 1000, signal, ...options } = {}) {
  const scope = requestScope(signal, timeout);
  try {
    const response = await fetch(`${BASE}${path}`, { ...options, signal: scope.signal });
    if (!response.ok) throw new Error(`本地模型服务返回 ${response.status}`);
    let text = '';
    await consumeText(response, scope.signal, delta => { text += delta; });
    return JSON.parse(text);
  } finally { scope.close(); }
}

export async function listModels({ signal } = {}) {
  try {
    const data = await requestJson('/api/tags', { signal });
    if (!Array.isArray(data.models)) throw new Error('模型列表格式无效');
    const models = data.models.filter(model => model && typeof model.name === 'string' && !model.remote_host && !model.remote_model && !/(?:-cloud|:cloud)$/i.test(model.name))
      .map(model => ({ name: model.name, size: Number(model.size) || 0 }));
    const preferred = PREFERRED.map(name => models.find(model => model.name === name)).find(Boolean);
    const lightest = [...models].sort((a, b) => (a.size > 0 ? a.size : Infinity) - (b.size > 0 ? b.size : Infinity))[0];
    return { available: true, models, defaultModel: preferred?.name || lightest?.name || null,
      recommended: { name: RECOMMENDED, installed: models.some(model => model.name === RECOMMENDED) } };
  } catch (error) {
    if (signal?.aborted) throw abortError();
    return { available: false, models: [], defaultModel: null, recommended: { name: RECOMMENDED, installed: false },
      error: '本地模型未启动，仍可使用离线场景对话。' };
  }
}

function deterministic(input, fallback) {
  return fallback.petAction || fallback.lookAction || capabilityReply(input.message, input.avatarMode, input.lookId);
}

async function chatPayload(input, signal, stream) {
  const status = await listModels({ signal });
  const model = input.model || status.defaultModel;
  if (!status.available) throw new Error('本地模型未启动');
  if (!model || !status.models.some(item => item.name === model)) throw new Error('所选本地模型尚未安装');
  // Only these known families support disabling thinking; older local models
  // continue receiving their original API options.
  const supportsThinking = /^qwen3(?:\.5)?(?::|$)/i.test(model.split('/').at(-1));
  return { model, messages: createMessages(input), stream, keep_alive: '2m',
    ...(supportsThinking ? { think: false } : {}),
    options: { temperature: 0.8, top_p: 0.9, num_predict: 220, num_ctx: 4096 } };
}

/** Buffer incomplete tag prefixes so a split <think> block never leaks. */
function visibleText() {
  const tags = ['<think>', '</think>'];
  let pending = '', depth = 0;
  return {
    push(text) {
      pending += text;
      let output = '';
      while (pending) {
        const lower = pending.toLowerCase();
        const matches = tags.map(tag => ({ tag, at: lower.indexOf(tag) })).filter(match => match.at >= 0).sort((a, b) => a.at - b.at);
        if (matches.length) {
          const { tag, at } = matches[0];
          if (!depth) output += pending.slice(0, at);
          depth = tag === '<think>' ? depth + 1 : Math.max(0, depth - 1);
          pending = pending.slice(at + tag.length);
          continue;
        }
        let keep = 0;
        for (const tag of tags) for (let length = 1; length < tag.length; length++)
          if (lower.endsWith(tag.slice(0, length))) keep = Math.max(keep, length);
        if (!depth) output += pending.slice(0, pending.length - keep);
        pending = keep ? pending.slice(-keep) : '';
        break;
      }
      return output;
    },
  };
}

const fallbackError = (fallback, error) => ({ ...fallback,
  error: `${error.name === 'AbortError' ? '本地模型响应超时' : error.message || '本地模型暂不可用'}，本次使用离线场景回应。` });

export async function modelReply(input, { signal } = {}) {
  if (signal?.aborted) throw abortError();
  const fallback = offlineReply(input);
  if (fallback.corpusOnly) return fallback;
  if (deterministic(input, fallback)) return fallback;
  try {
    const body = await chatPayload(input, signal, false);
    const data = await requestJson('/api/chat', { timeout: 90000, signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (data.error || typeof data.message?.content !== 'string') throw new Error('本地模型返回了无效回复');
    const reply = visibleText().push(data.message.content).trim();
    if (!reply || reply.length > MAX_REPLY) throw new Error('本地模型没有返回可用文字');
    return { ...fallback, reply, provider: 'ollama' };
  } catch (error) {
    if (signal?.aborted) throw abortError();
    return fallbackError(fallback, error);
  }
}

export async function modelReplyStream(input, { signal, onDelta = () => {} } = {}) {
  if (signal?.aborted) throw abortError();
  const fallback = offlineReply(input);
  if (fallback.corpusOnly) {
    if (fallback.reply) await onDelta(fallback.reply);
    if (signal?.aborted) throw abortError();
    return fallback;
  }
  if (deterministic(input, fallback)) {
    await onDelta(fallback.reply);
    if (signal?.aborted) throw abortError();
    return fallback;
  }
  let reply = '', whitespace = '', scope;
  try {
    const body = await chatPayload(input, signal, true);
    scope = requestScope(signal, 90000);
    const response = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: scope.signal });
    if (!response.ok) throw new Error(`本地模型服务返回 ${response.status}`);
    const filter = visibleText();
    let pending = '', done = false;
    const record = async line => {
      if (scope.signal.aborted) throw abortError();
      if (!line.trim()) return;
      if (done) throw new Error('本地模型回复结束后的顺序异常');
      const value = JSON.parse(line);
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('本地模型返回了无效回复');
      if (value.error) throw new Error(typeof value.error === 'string' ? value.error : '本地模型生成失败');
      if (value.message?.content != null && typeof value.message.content !== 'string') throw new Error('本地模型返回了无效回复');
      // message.thinking is deliberately ignored even when content is empty.
      let text = whitespace + filter.push(value.message?.content || '');
      if (!reply) text = text.trimStart();
      const delta = text.trimEnd();
      whitespace = text.slice(delta.length);
      if (reply.length + text.length > MAX_REPLY) throw new Error('本地模型回复超出长度限制');
      if (delta) { reply += delta; await onDelta(delta); }
      if (value.done === true) done = true;
    };
    await consumeText(response, scope.signal, async text => {
      pending += text;
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end); pending = pending.slice(end + 1);
        await record(line);
      }
      if (pending.length > 65536) throw new Error('本地模型片段超出长度限制');
    });
    if (pending.trim()) await record(pending);
    if (scope.signal.aborted) throw abortError();
    if (!done) throw new Error('本地模型回复中断，请重试。');
    if (!reply) throw new Error('本地模型没有返回可用文字');
    return { ...fallback, reply, provider: 'ollama' };
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (reply) throw Object.assign(error, { partial: true, code: 'CHAT_STREAM_INTERRUPTED' });
    const result = fallbackError(fallback, error);
    await onDelta(result.reply);
    if (signal?.aborted) throw abortError();
    return result;
  } finally { scope?.close(); }
}
