import test from 'node:test';
import assert from 'node:assert/strict';
const ollama = await import('../server/ollama.mjs');
const input = { message: '今天看见一朵很好看的云', avatarMode: 'photo' };
const tags = names => Response.json({ models: names.map(name => typeof name === 'string' ? { name, size: 1024 } : name) });
function streamResponse(values) {
  return new Response(new ReadableStream({ start(controller) {
    for (const value of values) controller.enqueue(new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value) + '\n'));
    controller.close();
  } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
}
function mockModel(t, response, names = ['qwen3.5:4b'], inspect = () => {}) {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/api/tags')) return tags(names);
    inspect(JSON.parse(options.body), options.signal);
    return typeof response === 'function' ? response(options.signal) : response;
  });
}

test('default local model prefers Qwen 3.5 while retaining other installed models', async t => {
  t.mock.method(globalThis, 'fetch', async () => tags([
    'qwen2.5:1.5b', 'qwen3.5:9b', 'qwen3.5:4b', 'other:latest',
    'qwen3.5:cloud', { name: 'remote:latest', remote_host: 'example.com' },
  ]));
  const result = await ollama.listModels();
  assert.equal(result.defaultModel, 'qwen3.5:4b');
  assert.deepEqual(result.recommended, { name: 'qwen3.5:4b', installed: true });
  assert.deepEqual(result.models.map(model => model.name), ['qwen2.5:1.5b', 'qwen3.5:9b', 'qwen3.5:4b', 'other:latest']);
});

test('model selection falls back to installed 9b then a lighter local model', async t => {
  let names = ['qwen2.5:1.5b', 'qwen3.5:9b'];
  t.mock.method(globalThis, 'fetch', async () => tags(names));
  assert.equal((await ollama.listModels()).defaultModel, 'qwen3.5:9b');
  names = ['huge:70b', 'qwen2.5:1.5b'];
  const result = await ollama.listModels();
  assert.equal(result.defaultModel, 'qwen2.5:1.5b');
  assert.equal(result.recommended.installed, false);
});

test('streaming chat filters split thinking tags before delivering any visible text', async t => {
  assert.equal(typeof ollama.modelReplyStream, 'function');
  let body;
  mockModel(t, streamResponse([
    { message: { thinking: 'private reasoning', content: '  <thi' }, done: false },
    { message: { content: 'nk>do not show</th' }, done: false },
    { message: { content: 'ink>云像' }, done: false },
    { message: { content: '什么呢？<think>more</think> 我想听听。  ' }, done: false },
    { done: true, message: { content: '' } },
  ]), undefined, request => { body = request; });
  const deltas = [];
  const result = await ollama.modelReplyStream(input, { onDelta: delta => deltas.push(delta) });
  assert.equal(result.provider, 'ollama');
  assert.equal(result.reply, '云像什么呢？ 我想听听。');
  assert.equal(deltas.join(''), result.reply);
  assert.deepEqual({ stream: body.stream, think: body.think, keep_alive: body.keep_alive, num_ctx: body.options.num_ctx, num_predict: body.options.num_predict },
    { stream: true, think: false, keep_alive: '2m', num_ctx: 4096, num_predict: 220 });
});

test('visible model delta arrives while the model response remains open', async t => {
  assert.equal(typeof ollama.modelReplyStream, 'function');
  let close, sawDelta;
  const seen = new Promise(resolve => { sawDelta = resolve; });
  mockModel(t, new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"message":{"content":"我在听。"},"done":false}\n'));
    close = () => { controller.enqueue(new TextEncoder().encode('{"done":true}\n')); controller.close(); };
  } })));
  let ended = false;
  const pending = ollama.modelReplyStream(input, { onDelta: sawDelta }).then(result => { ended = true; return result; });
  assert.equal(await seen, '我在听。');
  assert.equal(ended, false);
  close();
  assert.equal((await pending).reply, '我在听。');
});

test('legacy non-streaming chat uses thinking control only on supported model families', async t => {
  let selected = 'qwen3.5:4b', bodies = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/api/tags')) return tags([selected]);
    bodies.push(JSON.parse(options.body));
    return Response.json({ message: { content: '<think>private</think>你好。' }, done: true });
  });
  assert.equal((await ollama.modelReply(input)).reply, '你好。');
  selected = 'qwen2.5:1.5b';
  await ollama.modelReply(input);
  assert.equal(bodies[0].think, false);
  assert.equal('think' in bodies[1], false);
  assert.equal(bodies[0].stream, false);
});

test('a failure before visible text emits the offline fallback exactly once', async t => {
  assert.equal(typeof ollama.modelReplyStream, 'function');
  mockModel(t, streamResponse([{ message: { thinking: 'hidden' } }, { error: 'failed' }]));
  const seen = [];
  const result = await ollama.modelReplyStream(input, { onDelta: delta => seen.push(delta) });
  assert.equal(result.provider, 'offline');
  assert.ok(result.error);
  assert.deepEqual(seen, [result.reply]);
});

test('cancelling a final model record without newline never returns completion', async t => {
  mockModel(t, streamResponse([JSON.stringify({ message: { content: '你好' }, done: true })]));
  const controller = new AbortController();
  await assert.rejects(ollama.modelReplyStream(input, {
    signal: controller.signal, onDelta: () => controller.abort(),
  }), { name: 'AbortError' });
});

test('cancelling the deterministic delta never returns completion', async () => {
  const controller = new AbortController();
  await assert.rejects(ollama.modelReplyStream({ message: '挥挥手', avatarMode: 'live2d' }, {
    signal: controller.signal, onDelta: () => controller.abort(),
  }), { name: 'AbortError' });
});

test('cancelling the fallback delta never returns completion or emits another fallback', async t => {
  mockModel(t, streamResponse([{ error: 'failed' }]));
  const controller = new AbortController(), seen = [];
  await assert.rejects(ollama.modelReplyStream(input, {
    signal: controller.signal, onDelta: delta => { seen.push(delta); controller.abort(); },
  }), { name: 'AbortError' });
  assert.equal(seen.length, 1);
});

test('a partial model failure never appends a fallback or pretends completion', async t => {
  assert.equal(typeof ollama.modelReplyStream, 'function');
  mockModel(t, streamResponse([{ message: { content: '说到这里，' } }, { error: 'connection failed' }]));
  const seen = [];
  await assert.rejects(ollama.modelReplyStream(input, { onDelta: delta => seen.push(delta) }), error => error.partial === true);
  assert.deepEqual(seen, ['说到这里，']);
});

test('stream cancellation interrupts a blocked reader and does not emit fallback', async t => {
  assert.equal(typeof ollama.modelReplyStream, 'function');
  const controller = new AbortController();
  let readReady, cancelled = 0, requestSignal;
  const ready = new Promise(resolve => { readReady = resolve; });
  mockModel(t, () => new Response(new ReadableStream({ start() { readReady(); }, cancel() { cancelled++; } })), undefined, (_body, signal) => { requestSignal = signal; });
  const seen = [];
  const pending = ollama.modelReplyStream(input, { signal: controller.signal, onDelta: delta => seen.push(delta) });
  await ready; controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(requestSignal.aborted, true);
  assert.equal(cancelled, 1);
  assert.deepEqual(seen, []);
});

test('missing completion and excessive reply length are reported after partial output', async t => {
  assert.equal(typeof ollama.modelReplyStream, 'function');
  let values = [{ message: { content: '未完。' } }];
  mockModel(t, () => streamResponse(values));
  await assert.rejects(ollama.modelReplyStream(input), error => error.partial === true);
  values = [{ message: { content: '开头。' } }, { message: { content: '字'.repeat(4001) } }, { done: true }];
  await assert.rejects(ollama.modelReplyStream(input), error => error.partial === true && /长度/.test(error.message));
});

test('cancelling from a delta suppresses later records in the same network chunk', async t => {
  const controller = new AbortController(), seen = [];
  mockModel(t, streamResponse([
    '{"message":{"content":"第一句。"}}\n{"message":{"content":"不该出现。"}}\n{"done":true}\n',
  ]));
  await assert.rejects(ollama.modelReplyStream(input, { signal: controller.signal, onDelta: delta => { seen.push(delta); controller.abort(); } }), { name: 'AbortError' });
  assert.deepEqual(seen, ['第一句。']);
});

test('oversized hidden model traffic is bounded and emits one explicit fallback', async t => {
  mockModel(t, streamResponse([{ message: { thinking: 'x'.repeat(1000001) } }]));
  const seen = [];
  const result = await ollama.modelReplyStream(input, { onDelta: delta => seen.push(delta) });
  assert.equal(result.provider, 'offline');
  assert.match(result.error, /长度限制/);
  assert.deepEqual(seen, [result.reply]);
});

test('an unterminated thinking block never leaks its private content', async t => {
  mockModel(t, streamResponse([{ message: { content: '<think>private text that never closes' } }, { done: true }]));
  const seen = [];
  const result = await ollama.modelReplyStream(input, { onDelta: delta => seen.push(delta) });
  assert.equal(result.provider, 'offline');
  assert.deepEqual(seen, [result.reply]);
  assert.doesNotMatch(result.reply, /private/);
});
