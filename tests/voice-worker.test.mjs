import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const mod = await import("../server/speech-worker.mjs").catch(() => ({}));
const make = () =>
  mod.createSpeechWorker({
    command: process.execPath,
    args: [
      fileURLToPath(new URL("./fixtures/voice-worker.mjs", import.meta.url)),
    ],
    timeoutMs: 700,
    idleMs: 1000,
  });
test("local reference worker sends text literally and serializes independent requests", async (t) => {
  assert.equal(typeof mod.createSpeechWorker, "function");
  const worker = make();
  t.after(() => worker.close());
  const texts = ["你好", 'a\n"; $(echo not-a-command)'];
  const values = await Promise.all(
    texts.map((text) => worker.synthesize(text)),
  );
  values.forEach((audio, i) => {
    assert.equal(audio.subarray(0, 4).toString(), "RIFF");
    assert.equal(audio.readInt16LE(44), texts[i].length);
  });
});
test("cancelling a queued voice request preserves another request and restarting after a crash works", async (t) => {
  const worker = make();
  t.after(() => worker.close());
  const abort = new AbortController();
  const first = worker.synthesize("hello");
  const queued = worker.synthesize("cancel", { signal: abort.signal });
  abort.abort();
  await assert.rejects(queued, { name: "AbortError" });
  assert.equal((await first).length, 48);
  await assert.rejects(worker.synthesize("crash"));
  assert.equal((await worker.synthesize("next")).length, 48);
});
test("cancel stops active inference and timed out requests do not poison the queue", async (t) => {
  const worker = make();
  t.after(() => worker.close());
  const abort = new AbortController();
  const pending = worker.synthesize("hang", { signal: abort.signal });
  setTimeout(() => abort.abort(), 50);
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal((await worker.synthesize("after abort")).length, 48);
  await assert.rejects(worker.synthesize("hang"), /超时/);
  assert.equal((await worker.synthesize("after timeout")).length, 48);
});
test("closing voice service rejects pending work and disallows accidental restart", async () => {
  const worker = make();
  const pending = worker.synthesize("hang");
  const failure = assert.rejects(pending);
  worker.close();
  await failure;
  await assert.rejects(worker.synthesize("closed"));
});

test('streamed audio arrives before completion and warmup does not produce speech',async t=>{
 const worker=make();t.after(()=>worker.close());assert.equal(typeof worker.warmup,'function');await worker.warmup();let first=false,finished=false;
 const pending=worker.synthesize('stream',{onChunk:audio=>{assert.equal(finished,false);assert.equal(audio.length,48);first=true;}}).then(()=>{finished=true});
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(first,true);assert.equal(finished,false);await pending;assert.equal(finished,true);
});

test('cancelling a stream preserves the warm process for the next response',async t=>{
 const worker=make();t.after(()=>worker.close());const before=(await worker.synthesize('pid')).readInt16LE(44),abort=new AbortController();
 await assert.rejects(worker.synthesize('stream',{signal:abort.signal,onChunk:()=>abort.abort()}),{name:'AbortError'});
 const after=(await worker.synthesize('pid')).readInt16LE(44);assert.equal(before,after);
});
