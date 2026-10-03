import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'muyu-startup-'));
after(() => rm(directory, { recursive: true, force: true }));
const site = join(directory, 'site');
await mkdir(site);
await writeFile(join(site, 'index.html'), '<h1>local</h1>');
const bundle = join(directory, 'server.mjs');
await build({
  entryPoints: ['server/index.mjs'], outfile: bundle, bundle: true, platform: 'node', format: 'esm',
  define: { 'import.meta.url': JSON.stringify(new URL('../server/index.mjs', import.meta.url).href) },
  plugins: [{ name: 'observe-voice-startup', setup(builder) {
    builder.onResolve({ filter: /^\.\/voice\.mjs$/ }, () => ({ path: 'voice', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
      export function createVoiceService() {
        const calls = globalThis.__startupVoiceCalls;
        return {
          warmup: async () => { calls.warmups++; },
          reset: () => { calls.resets++; },
          invalidateVoice: id => { calls.invalidated.push(id); },
          close: () => { calls.closed++; },
          library: {
            select: async id => ({ selectedId: id, voices: [] }),
            rename: async () => ({ voices: [] }), remove: async () => ({ voices: [] }),
            list: async () => ({ selectedId: 'builtin', voices: [] })
          }
        };
      }`, loader: 'js' }));
  }}]
});
const { startServer } = await import(pathToFileURL(bundle).href);

test('opening the app and managing voices do not load the speech model', async t => {
  const calls = globalThis.__startupVoiceCalls = { warmups: 0, resets: 0, closed: 0, invalidated: [] };
  const app = await startServer({ port: 0, staticDir: site, studioDirectory: join(directory,'studio-default') });
  t.after(() => app.close());
  assert.equal(calls.warmups, 0, 'startup should keep the model unloaded');
  for (const operation of ['select', 'rename', 'delete']) {
    const response = await fetch(`http://127.0.0.1:${app.port}/api/voices/${operation}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'builtin', name: 'name' })
    });
    assert.equal(response.status, 200);
  }
  assert.equal(calls.resets, 0, 'renaming or selecting a voice must not unload its model');
  assert.deepEqual(calls.invalidated, ['builtin'], 'only deletion invalidates that voice');
  assert.equal(calls.warmups, 0, 'voice management should leave the model unloaded');
});

test('explicit prewarm remains available to callers that need it', async t => {
  const calls = globalThis.__startupVoiceCalls = { warmups: 0, resets: 0, closed: 0, invalidated: [] };
  const app = await startServer({ port: 0, staticDir: site, prewarm: true, studioDirectory: join(directory,'studio-prewarm') });
  t.after(() => app.close());
  assert.equal(calls.warmups, 1);
});
