import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalImageRuntime } from '../server/local-image-runtime.mjs';

async function fixture(t, mode = 'success') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'muyu-image-runtime-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const model = path.join(directory, 'model');
  await mkdir(model);
  await writeFile(path.join(model, 'config.json'), '{}');
  await writeFile(path.join(model, 'weights.safetensors'), 'weights');
  await mkdir(path.join(directory, 'runtime', 'bin'), { recursive: true });
  await writeFile(path.join(directory, 'runtime', 'bin', 'muyu-calibrate'), 'fixture');
  await writeFile(path.join(directory, 'runtime-manifest.json'), JSON.stringify({ mfluxVersion: '0.20.0', modelRevision: '7ee1b3aa8178a1240050490072196a57da2bf2a9', files: [{ path: 'config.json', size: 2 }, { path: 'weights.safetensors', size: 7 }] }));
  const workerPath = path.join(directory, 'fixture-worker.mjs');
  await writeFile(workerPath, `
    import { readFile, writeFile } from 'node:fs/promises';
    import path from 'node:path';
    const request = JSON.parse(await readFile(process.argv[process.argv.indexOf('--request') + 1], 'utf8'));
    await writeFile(path.join(request.outputDirectory, 'request-seen.json'), JSON.stringify({ request, offline: process.env.HF_HUB_OFFLINE }));
    await writeFile(path.join(request.outputDirectory, 'worker.pid'), String(process.pid));
    await writeFile(path.join(request.outputDirectory, 'reference-0.png'), 'temporary reference');
    if (${JSON.stringify(mode)} === 'wait') { setInterval(() => {}, 1000); }
    else if (${JSON.stringify(mode)} === 'error') { process.stderr.write('Face could not be detected.'); process.exit(7); }
    else {
      console.log(JSON.stringify({ type: 'progress', phase: 'denoise', progress: 50, message: 'Step 2/4' }));
      const assetPath = path.join(request.outputDirectory, 'character.png');
      const rigPath = path.join(request.outputDirectory, 'rig.json');
      await writeFile(assetPath, 'png'); await writeFile(rigPath, '{}');
      console.log(JSON.stringify({ type: 'result', assetPath, rigPath, width: request.width, height: request.height, warnings: [] }));
    }
  `);
  const runtime = createLocalImageRuntime({ directory, pythonPath: process.execPath, workerPath });
  const reference = path.join(directory, 'reference $(touch nope); literal.png');
  await writeFile(reference, 'image');
  const outputDirectory = path.join(directory, 'job');
  return { directory, runtime, reference, outputDirectory };
}

test('missing runtime reports installation requirement without starting a process', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'muyu-runtime-missing-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runtime = createLocalImageRuntime({ directory });
  const info = await runtime.info();
  assert.equal(info.state, 'missing');
  assert.equal(info.ready, false);
});

test('ready runtime detects an incomplete model instead of attempting a download during generation', async (t) => {
  const { runtime, directory } = await fixture(t);
  assert.equal((await runtime.info()).ready, true);
  await writeFile(path.join(directory, 'model', 'weights.safetensors'), 'short');
  assert.equal((await runtime.info()).ready, false);
});

test('generation keeps reference filenames literal, reports progress and runs offline', async (t) => {
  const { runtime, reference, outputDirectory } = await fixture(t);
  const progress = [];
  const result = await runtime.generate({ references: [reference], prompt: 'Full body standing', outputDirectory, onProgress: (p) => progress.push(p) });
  assert.equal(result.width, 512);
  assert.equal(result.height, 768);
  assert.equal(result.assetPath, path.join(outputDirectory, 'character.png'));
  assert.equal(progress[0].phase, 'denoise');
  const seen = JSON.parse(await readFile(path.join(outputDirectory, 'request-seen.json'), 'utf8'));
  assert.deepEqual(seen.request.references, [reference]);
  assert.equal(seen.offline, '1');
  await assert.rejects(access(path.join(outputDirectory, 'request.json')));
});

test('unsafe dimensions and too many references are rejected before allocating a worker', async (t) => {
  const { runtime, reference, outputDirectory } = await fixture(t);
  await assert.rejects(runtime.generate({ references: [reference], prompt: 'x', outputDirectory, width: 2048, height: 2048 }), /尺寸|resolution/i);
  await assert.rejects(runtime.generate({ references: [reference, reference, reference, reference], prompt: 'x', outputDirectory }), /参考|reference/i);
  await assert.rejects(access(outputDirectory));
});

test('worker failures propagate with actionable diagnostics', async (t) => {
  const { runtime, reference, outputDirectory } = await fixture(t, 'error');
  await assert.rejects(runtime.generate({ references: [reference], prompt: 'x', outputDirectory }), /Face could not be detected/);
  await assert.rejects(access(path.join(outputDirectory, 'reference-0.png')));
});

test('simultaneous generations allocate only one worker', async (t) => {
  const { runtime, reference, outputDirectory } = await fixture(t);
  const first = runtime.generate({ references: [reference], prompt: 'x', outputDirectory });
  const second = runtime.generate({ references: [reference], prompt: 'x', outputDirectory: outputDirectory + '-second' });
  await assert.rejects(second, /正在|busy/i);
  await first;
  await assert.rejects(access(outputDirectory + '-second'));
});

test('cancellation stops the generation process and releases the serialization lock', async (t) => {
  const { runtime, reference, outputDirectory } = await fixture(t, 'wait');
  const controller = new AbortController();
  const pending = runtime.generate({ references: [reference], prompt: 'x', outputDirectory, signal: controller.signal });
  let pid;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { pid = Number(await readFile(path.join(outputDirectory, 'worker.pid'), 'utf8')); break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(pid, 'worker started');
  await assert.rejects(runtime.generate({ references: [reference], prompt: 'x', outputDirectory }), /正在|busy/i);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  await assert.rejects(access(path.join(outputDirectory, 'reference-0.png')));
  assert.equal((await runtime.info()).state, 'ready');
});
