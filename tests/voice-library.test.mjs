import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const api = await import("../server/voice-library.mjs").catch(() => ({}));
function wav(seconds = 4) {
  const b = Buffer.alloc(44 + seconds * 48000);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(b.length - 44, 40);
  for (let i = 44; i < b.length; i += 2)
    b.writeInt16LE(Math.round(Math.sin(i) * 4000), i);
  return b.toString("base64");
}
test("voice library saves independent voices and persists selected identity across restarts", async (t) => {
  assert.equal(typeof api.createVoiceLibrary, "function");
  const dir = await mkdtemp(join(tmpdir(), "voice-library-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const lib = api.createVoiceLibrary({
    directory: dir,
    builtinRoot: "/builtin",
    transcribe: async () => "你好，今天过得怎么样。",
  });
  assert.equal((await lib.list()).selectedId, "builtin");
  const a = await lib.add({ name: "温柔", audio: wav(), referenceText: "" });
  const b = await lib.add({
    name: "活泼",
    audio: wav(),
    referenceText: "天气真好。",
  });
  assert.notEqual(a.id, b.id);
  await lib.select(a.id);
  const again = api.createVoiceLibrary({
    directory: dir,
    builtinRoot: "/builtin",
  });
  assert.equal((await again.list()).selectedId, a.id);
  assert.equal((await again.current()).referenceText, "你好，今天过得怎么样。");
  await again.rename(a.id, "我的声音");
  assert.equal(
    (await again.list()).voices.find((x) => x.id === a.id).name,
    "我的声音",
  );
  await again.remove(a.id);
  assert.equal((await again.list()).selectedId, "builtin");
  assert.equal((await again.list()).voices.length, 2);
  await assert.rejects(again.select("../escape"));
  await assert.rejects(again.remove("builtin"));
});
test("invalid audio and failed transcription never create a saved voice", async (t) => {
  assert.equal(typeof api.createVoiceLibrary, "function");
  const dir = await mkdtemp(join(tmpdir(), "voice-invalid-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const lib = api.createVoiceLibrary({
    directory: dir,
    builtinRoot: "/builtin",
    transcribe: async () => {
      throw Error("ASR unavailable");
    },
  });
  await assert.rejects(
    lib.add({ name: "x", audio: wav(1), referenceText: "你好" }),
  );
  await assert.rejects(
    lib.add({
      name: "x",
      audio: Buffer.from("bad").toString("base64"),
      referenceText: "你好",
    }),
  );
  await assert.rejects(lib.add({ name: "x", audio: wav(), referenceText: "" }));
  assert.equal((await lib.list()).voices.length, 1);
});

test("resolving a preview profile and adding voices preserve the previous saved cards and selection", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "voice-preview-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const lib = api.createVoiceLibrary({ directory: dir, builtinRoot: "/builtin" });
  const voices = [];
  for (const name of ["旧音色一", "旧音色二", "旧音色三"])
    voices.push(await lib.add({ name, audio: wav(), referenceText: "保留的录音台词。" }));
  await lib.select(voices[0].id);
  const original = await Promise.all(voices.map(v => readFile(join(dir, v.id, "reference.wav"))));
  const preview = await lib.resolve(voices[1].id);
  assert.equal(preview.root, join(dir, voices[1].id));
  assert.equal(preview.referenceText, "保留的录音台词。");
  await lib.add({ name: "新音色", audio: wav(), referenceText: "新的台词。" });
  assert.equal((await lib.list()).selectedId, voices[0].id);
  assert.equal((await lib.list()).voices.length, 5);
  for (let i = 0; i < voices.length; i++) assert.deepEqual(await readFile(join(dir, voices[i].id, "reference.wav")), original[i]);
  await assert.rejects(lib.resolve("../escape"), /音色不存在/);
});
