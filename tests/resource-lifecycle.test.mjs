import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createSpeechWorker } from "../server/speech-worker.mjs";
import { createVoiceService } from "../server/voice.mjs";

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

test("reference model exits after idle and restarts for the next uncached utterance", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "muyu-resource-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ["python/bin/python3", "reference.wav", "model/config.json", "model/model.safetensors", "model/speech_tokenizer/model.safetensors"]) {
    const file = join(root, name);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, "fixture");
  }
  await writeFile(join(root, "profile.json"), JSON.stringify({ referenceText: "你好。" }));
  // Replace only model inference: the service and its child-process lifecycle run normally.
  const fixture = join(root, "worker.mjs");
  await writeFile(fixture, `import readline from 'node:readline';
for await (const line of readline.createInterface({input:process.stdin})) {
  const request = JSON.parse(line);
  const audio = Buffer.alloc(48);
  audio.write('RIFF'); audio.writeUInt32LE(40,4); audio.write('WAVE',8);
  audio.writeUInt32LE(process.pid,44);
  process.stdout.write(JSON.stringify({id:request.id,audio:audio.toString('base64')})+'\\n');
}`);
  const service = createVoiceService({
    runtimeRoot: root,
    workerIdleMs: 40,
    workerFactory: (options) => createSpeechWorker({
      ...options, command: process.execPath, args: [fixture], timeoutMs: 1000,
    }),
  });
  t.after(() => service.close());
  const firstPid = (await service.synthesize("first")).readUInt32LE(44);
  assert.equal(alive(firstPid), true);
  for (let attempt = 0; attempt < 30 && alive(firstPid); attempt++) await delay(10);
  assert.equal(alive(firstPid), false, "idle model memory must be released by terminating its process");
  const secondPid = (await service.synthesize("second")).readUInt32LE(44);
  assert.notEqual(secondPid, firstPid);
  assert.equal(alive(secondPid), true);
});

test("turning rain off releases its loop buffer and disconnects the audio graph", async () => {
  const nodes = [];
  let suspended = 0;
  const node = () => {
    const item = { disconnects: 0, stops: 0, connect() {}, disconnect() { this.disconnects++; }, start() {}, stop() { this.stops++; } };
    nodes.push(item);
    return item;
  };
  globalThis.window = { AudioContext: class {
    sampleRate = 10; currentTime = 0; destination = {};
    async resume() {} async suspend() { suspended++; }
    createBuffer() { return { getChannelData: () => new Float32Array(40) }; }
    createBufferSource() { return node(); }
    createBiquadFilter() { return Object.assign(node(), { frequency: {} }); }
    createGain() { return Object.assign(node(), { gain: { setTargetAtTime() {} } }); }
  } };
  const { setRain } = await import(`../src/audio.js?rain-resource=${Date.now()}`);
  await setRain(true);
  const source = nodes[0];
  assert.ok(source.buffer);
  await setRain(false);
  assert.equal(source.stops, 1, "a silent infinite source must stop when rain is disabled");
  assert.equal(source.buffer, null);
  assert.deepEqual(nodes.map((item) => item.disconnects), [1, 1, 1]);
  assert.equal(suspended, 1);
  await setRain(true);
  assert.equal(nodes.length, 6, "rain can create a fresh graph after release");
  await setRain(false);
});

test("disabling rain during AudioContext resume prevents a late loop from starting", async () => {
  let resume, created = 0;
  globalThis.window = { AudioContext: class {
    sampleRate = 10; currentTime = 0; destination = {};
    resume() { return new Promise((resolve) => { resume = resolve; }); }
    async suspend() {}
    createBuffer() { return { getChannelData: () => new Float32Array(40) }; }
    createBufferSource() { created++; return { connect() {}, start() {} }; }
    createBiquadFilter() { return { connect() {}, frequency: {} }; }
    createGain() { return { connect() {}, gain: { setTargetAtTime() {} } }; }
  } };
  const { setRain } = await import(`../src/audio.js?rain-resume=${Date.now()}`);
  const pending = setRain(true);
  await setRain(false);
  resume();
  await pending;
  assert.equal(created, 0);
});

test("turning rain off keeps the shared context running for an active speech request", async () => {
  let suspended = 0;
  globalThis.window = { speechSynthesis: { cancel() {} }, AudioContext: class {
    sampleRate = 10; currentTime = 0; destination = {};
    async resume() {} async suspend() { suspended++; }
    createBuffer() { return { getChannelData: () => new Float32Array(40) }; }
    createBufferSource() { return { connect() {}, disconnect() {}, start() {}, stop() {} }; }
    createBiquadFilter() { return { connect() {}, disconnect() {}, frequency: {} }; }
    createGain() { return { connect() {}, disconnect() {}, gain: { setTargetAtTime() {} } }; }
  } };
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("stopped"), { name: "AbortError" })));
  });
  const { setRain, speak, stopSpeech } = await import(`../src/audio.js?rain-speech=${Date.now()}`);
  await setRain(true);
  const pending = speak("你好。");
  await setRain(false);
  assert.equal(suspended, 0);
  stopSpeech();
  await pending;
});
