import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../server/index.mjs';

test('interactive chat interrupts classification, preserves text and permits later classification', { timeout: 10000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'muyu-classifier-priority-'));
  const site = join(directory, 'site');
  await mkdir(site); await writeFile(join(site, 'index.html'), '<p>fixture</p>');
  const app = await startServer({ port: 0, staticDir: site, voiceDirectory: join(directory, 'voices'), studioDirectory: join(directory, 'studio'), textPackDirectory: join(directory, 'packs') });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const originalFetch = globalThis.fetch;
  let entered, cancelled = 0, second = false;
  const ready = new Promise(resolve => { entered = resolve; });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url) === 'http://127.0.0.1:11434/api/tags') return Response.json({ models: [{ name: 'qwen3.5:4b', size: 1000 }] });
    if (String(url) === 'http://127.0.0.1:11434/api/chat') {
      const input = JSON.parse(JSON.parse(options.body).messages[1].content).items[0];
      if (second) return Response.json({ done: true, message: { content: JSON.stringify({ items: [{ id: input.id, category: 'comfort', speaker: '' }] }) } });
      entered();
      return new Response(new ReadableStream({ cancel() { cancelled++; } }));
    }
    return originalFetch(url, options);
  });
  const base = `http://127.0.0.1:${app.port}`;
  const post = (path, value) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const preview = await (await post('/api/text-packs/extract', { text: '你好。', mode: 'reading' })).json();
  const path = `/api/text-packs/${preview.pack.id}`;
  const ids = [preview.entries[0].id];
  const pending = post(path + '/classify', { ids });
  await ready;
  assert.equal((await post(path + '/classify', { ids })).status, 409);
  const chat = await post('/api/chat', { message: '你好', provider: 'offline' });
  assert.equal(chat.status, 200);
  const stopped = await pending;
  assert.equal(stopped.status, 409);
  assert.match((await stopped.json()).error, /对话.*分类|分类.*暂停/);
  assert.equal(cancelled, 1);
  const page = await (await fetch(base + path)).json();
  assert.equal(page.entries[0].text, preview.entries[0].text);
  assert.equal(page.entries[0].category, preview.entries[0].category);
  second = true;
  const retried = await post(path + '/classify', { ids });
  assert.equal(retried.status, 200);
  assert.equal((await retried.json()).entries[0].category, 'comfort');
});
