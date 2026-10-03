import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../src/chat-stream.mjs').catch(() => ({}));
const consume = (...args) => { assert.equal(typeof module.consumeChatStream, 'function'); return module.consumeChatStream(...args); };
function response(parts) {
  return new Response(new ReadableStream({ start(controller) {
    for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
    controller.close();
  } }));
}
test('chat NDJSON handles split records and returns final metadata without replaying text', async () => {
  const deltas = [], result = { reply: '你好。', provider: 'ollama' };
  const done = await consume(response(['{"delta":"你', '好"}\n{"delta":"。"}\n', JSON.stringify({ done: true, result }) + '\n']), { onDelta: delta => deltas.push(delta) });
  assert.deepEqual(deltas, ['你好', '。']);
  assert.deepEqual(done, result);
});
test('chat stream reports explicit error, truncation, and content after done', async () => {
  for (const [parts, pattern] of [
    [['{"error":"模型中断"}\n'], /模型中断/],
    [['{"delta":"半句话"}\n'], /中断/],
    [['{"done":true,"result":{"reply":"好"}}\n{"delta":"多余"}\n'], /顺序|结束/],
    [['{"delta":"' + '字'.repeat(4001) + '"}\n'], /长度/],
  ]) await assert.rejects(consume(response(parts), {}), pattern);
});
test('chat cancellation cancels a blocked stream reader promptly', async () => {
  let cancelled = 0;
  const controller = new AbortController();
  const pending = consume(new Response(new ReadableStream({ cancel() { cancelled++; } })), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(cancelled, 1);
});

test('chat reader preserves UTF-8 characters split across byte boundaries', async () => {
  const bytes = new TextEncoder().encode('{"delta":"你好🙂"}\n{"done":true,"result":{"reply":"你好🙂"}}\n');
  const deltas = [];
  const result = await consume(new Response(new ReadableStream({ start(controller) {
    for (let index = 0; index < bytes.length; index++) controller.enqueue(bytes.slice(index, index + 1));
    controller.close();
  } })), { onDelta: delta => deltas.push(delta) });
  assert.deepEqual(deltas, ['你好🙂']);
  assert.equal(result.reply, '你好🙂');
});

test('chat records buffered after cancellation are never delivered', async () => {
  const controller = new AbortController(), seen = [];
  await assert.rejects(consume(response(['{"delta":"第一句"}\n{"delta":"第二句"}\n']), {
    signal: controller.signal, onDelta: delta => { seen.push(delta); controller.abort(); },
  }), { name: 'AbortError' });
  assert.deepEqual(seen, ['第一句']);
});

test('chat reader rejects oversized unframed data without retaining the stream', async () => {
  await assert.rejects(consume(response(['x'.repeat(65537)])), /长度限制/);
});

test('cancellation while receiving a final record without newline never returns completion', async () => {
  const controller = new AbortController();
  await assert.rejects(consume(response([JSON.stringify({ delta: '你好', done: true, result: { reply: '你好' } })]), {
    signal: controller.signal, onDelta: () => controller.abort(),
  }), { name: 'AbortError' });
});
