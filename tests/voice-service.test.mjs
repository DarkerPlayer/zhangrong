import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSpeechWorker } from "../server/speech-worker.mjs";
const mod = await import("../server/voice.mjs");
test("configured reference voice cannot silently become a system voice when files are missing", async (t) => {
  assert.equal(typeof mod.createVoiceService, "function");
  const root = await mkdtemp(join(tmpdir(), "muyu-reference-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "profile.json"),
    JSON.stringify({ referenceText: "你好", name: "private-filename" }),
  );
  const service = mod.createVoiceService({ runtimeRoot: root });
  t.after(() => service.close());
  const info = await service.info();
  assert.equal(info.mode, "reference");
  assert.equal(info.available, false);
  assert.equal(info.name, "参考音色");
  await assert.rejects(service.synthesize("你好"), /参考音色/);
  assert.ok(!JSON.stringify(info).includes(root));
});

test("concurrent profile previews reuse one worker and never persist the auditioned voice", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "muyu-preview-service-"));
  t.after(() => rm(root, {recursive:true,force:true}));
  for (const name of ["python/bin/python3", "reference.wav", "model/config.json", "model/model.safetensors", "model/speech_tokenizer/model.safetensors"]) {
    const file = join(root, name);
    await mkdir(join(file, ".."), {recursive:true});
    await writeFile(file, "fixture");
  }
  await writeFile(join(root, "profile.json"), JSON.stringify({referenceText:"内置台词。"}));
  const created = [], requestedRoots = [];
  const service = mod.createVoiceService({runtimeRoot:root,libraryDirectory:join(root,"voices"),
    workerFactory: options => {
      created.push(options.args.at(-1));
      const worker = createSpeechWorker({command:process.execPath,args:[fileURLToPath(new URL("./fixtures/voice-worker.mjs",import.meta.url))],idleMs:0});
      const synthesize = worker.synthesize.bind(worker);
      worker.synthesize = (text, options) => { requestedRoots.push(options.voiceRoot); return synthesize(text, options); };
      return worker;
    },
  });
  t.after(()=>service.close());
  const wav = Buffer.alloc(44 + 144000);
  wav.write("RIFF");wav.writeUInt32LE(wav.length-8,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(144000,40);
  for(let i=44;i<wav.length;i+=2)wav.writeInt16LE(4000,i);
  const custom = await service.library.add({name:"共享声音",audio:wav.toString("base64"),referenceText:"参考台词。"});
  const order = [];
  const first = service.synthesize("first", {voiceProfileId:custom.id,onChunk:audio=>order.push(["custom",audio.readInt16LE(44)])});
  const second = service.synthesize("second", {voiceProfileId:"builtin",onChunk:audio=>order.push(["builtin",audio.readInt16LE(44)])});
  const controller = new AbortController();
  const cancelled = service.synthesize("cancelled", {voiceProfileId:custom.id,signal:controller.signal});
  const rejected = assert.rejects(cancelled, {name:"AbortError"});
  controller.abort();
  await Promise.all([first,second,rejected]);
  assert.deepEqual(order, [["custom",5],["builtin",6]]);
  assert.deepEqual(created,[root]);
  assert.deepEqual(requestedRoots,[join(root,"voices",custom.id),root]);
  assert.equal((await service.library.list()).selectedId,"builtin");
  await assert.rejects(service.synthesize("你好", {voiceProfileId:"../escape"}), /音色不存在/);
  assert.equal(created.length,1);
});

async function fixtureService(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "muyu-voice-queue-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ["python/bin/python3", "reference.wav", "model/config.json", "model/model.safetensors", "model/speech_tokenizer/model.safetensors"]) {
    const path = join(root, name);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, "fixture");
  }
  await writeFile(join(root, "profile.json"), JSON.stringify({ referenceText: "你好。" }));
  const customId = "11111111-1111-1111-1111-111111111111";
  await mkdir(join(root, "voices", customId), { recursive: true });
  await writeFile(join(root, "voices", customId, "profile.json"), JSON.stringify({ referenceText: "另一个声音。" }));
  const service = mod.createVoiceService({ runtimeRoot: root, libraryDirectory: join(root, "voices"), ...options });
  t.after(() => service.close());
  return { service, root, customId };
}
function wavFixture(bytes = 48) {
  const audio = Buffer.alloc(bytes);
  audio.write("RIFF"); audio.writeUInt32LE(bytes - 8, 4); audio.write("WAVE", 8);
  audio.writeUInt32LE(bytes - 44, 40);
  return audio;
}
const soon = (promise) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve("pending"), 40))]);

test("service bounds pending work and queued cancellation settles before active inference", async t => {
  let release, markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const { service } = await fixtureService(t, { workerFactory: () => ({ close() {}, synthesize() {
    markStarted(); return new Promise(resolve => { release = () => resolve(wavFixture()); });
  } }) });
  const active = service.synthesize("active");
  await started;
  const controller = new AbortController();
  const cancelled = service.synthesize("cancel", { signal: controller.signal }).catch(error => error.name);
  const queued = [service.synthesize("queued-1"), service.synthesize("queued-2")].map(promise => promise.catch(error => error.message));
  const overflow = service.synthesize("overflow").catch(error => error.message);
  try {
    assert.match(await soon(overflow), /正在准备声音/);
    controller.abort();
    assert.equal(await soon(cancelled), "AbortError");
  } finally {
    service.close(); release();
    await Promise.allSettled([active, cancelled, overflow, ...queued]);
  }
});

test("service close rejects pending requests immediately while active work is blocked", async t => {
  let release, markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const { service } = await fixtureService(t, { workerFactory: () => ({ close() {}, synthesize() {
    markStarted(); return new Promise(resolve => { release = () => resolve(wavFixture()); });
  } }) });
  const active = service.synthesize("active").catch(error => error.message);
  await started;
  const pending = service.synthesize("pending").catch(error => error.message);
  service.close();
  try { assert.match(await soon(pending), /已关闭/); }
  finally { release(); await Promise.allSettled([active, pending]); }
});

test("audio LRU survives voice switches and invalidates only the deleted voice", async t => {
  let calls = 0, closed = 0;
  const { service, customId } = await fixtureService(t, { workerFactory: () => ({
    close() { closed++; }, async synthesize() { calls++; return wavFixture(); }
  }) });
  await service.synthesize("saved", { voiceProfileId: "builtin" });
  await service.synthesize("saved", { voiceProfileId: customId });
  await service.synthesize("saved", { voiceProfileId: "builtin" });
  assert.equal(calls, 2, "switching profiles must preserve cached utterances");
  assert.equal(closed, 0, "switching profiles must preserve model weights");
  service.invalidateVoice(customId);
  await service.synthesize("saved", { voiceProfileId: "builtin" });
  await service.synthesize("saved", { voiceProfileId: customId });
  assert.equal(calls, 3);
  assert.equal(closed, 0);
});

test("audio cache evicts least recently played text at the shared byte limit", async t => {
  const generated = [];
  const { service } = await fixtureService(t, { audioCacheBytes: 96, workerFactory: () => ({
    close() {}, async synthesize(text) { generated.push(text); return wavFixture(); }
  }) });
  for (const text of ["first", "second", "first", "third", "first", "second"]) await service.synthesize(text);
  assert.deepEqual(generated, ["first", "second", "third", "second"]);
});

test("invalidating a voice cancels its active request without caching its late result", async t => {
  let release, markStarted, calls = 0, closed = 0;
  const started = new Promise(resolve => { markStarted = resolve; });
  const { service, customId } = await fixtureService(t, { workerFactory: () => ({
    close() { closed++; }, synthesize() {
      calls++;
      if (calls !== 2) return Promise.resolve(wavFixture());
      markStarted(); return new Promise(resolve => { release = () => resolve(wavFixture()); });
    }
  }) });
  await service.synthesize("cached", { voiceProfileId: "builtin" });
  const active = service.synthesize("late", { voiceProfileId: customId }).catch(error => error.name);
  await started;
  service.invalidateVoice(customId);
  try { assert.equal(await soon(active), "AbortError"); }
  finally { release(); }
  await service.synthesize("cached", { voiceProfileId: "builtin" });
  await service.synthesize("late", { voiceProfileId: customId });
  assert.equal(calls, 3, "the late invalidated result must be generated again");
  assert.equal(closed, 0);
});

test("resource reset drains the service queue before future speech can restart", async t => {
  let markStarted, created = 0;
  const started = new Promise(resolve => { markStarted = resolve; });
  const { service } = await fixtureService(t, { workerFactory: () => {
    created++;
    return { close() {}, synthesize(_text, { signal }) {
      if (created > 1) return Promise.resolve(wavFixture());
      markStarted();
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("stopped"), { name: "AbortError" })), { once: true }));
    } };
  } });
  const active = service.synthesize("active").catch(error => error.name);
  await started;
  const queued = service.synthesize("queued").catch(error => error.name);
  service.reset();
  assert.deepEqual(await Promise.all([active, queued]), ["AbortError", "AbortError"]);
  assert.equal(created, 1);
  assert.equal((await service.synthesize("new request")).length, 48);
  assert.equal(created, 2);
});
