import test from "node:test";
import assert from "node:assert/strict";
const module = await import("../src/speech-stream.mjs").catch(() => ({}));
test("audio chunks are scheduled before the final response and completion waits for playback", async () => {
  assert.equal(typeof module.createStreamPlayer, "function");
  const sources = [];
  let ended = 0,
    started = 0;
  const context = {
    currentTime: 1,
    decodeAudioData: async () => ({ duration: 0.48 }),
    createBufferSource() {
      const s = {
        connect() {},
        start(time) {
          this.time = time;
        },
        stop() {},
        disconnect() {},
      };
      sources.push(s);
      return s;
    },
  };
  const p = module.createStreamPlayer({
    context,
    destination: {},
    onStart: () => started++,
    onEnd: () => ended++,
  });
  await p.push(Buffer.from("first").toString("base64"));
  assert.equal(sources.length, 1);
  assert.equal(started, 1);
  assert.equal(ended, 0);
  await p.push(Buffer.from("next").toString("base64"));
  assert.ok(Math.abs(sources[1].time - sources[0].time - 0.48) < 0.001);
  p.finish();
  sources[0].onended();
  assert.equal(ended, 0);
  sources[1].onended();
  await p.finished;
  assert.equal(ended, 1);
});
test("stopping a stream stops queued sources and late chunks never start", async () => {
  assert.equal(typeof module.createStreamPlayer, "function");
  let stopped = 0,
    started = 0,
    ended = 0;
  const c = {
    currentTime: 0,
    decodeAudioData: async () => ({ duration: 1 }),
    createBufferSource: () => ({
      connect() {},
      start() {
        started++;
      },
      stop() {
        stopped++;
      },
      disconnect() {},
    }),
  };
  const p = module.createStreamPlayer({
    context: c,
    destination: {},
    onEnd: () => ended++,
  });
  await p.push("YWJj");
  p.cancel();
  await p.push("YWJj");
  await p.finished;
  assert.equal(stopped, 1);
  assert.equal(started, 1);
  assert.equal(ended, 0);
});

test("split NDJSON chunks play incrementally and truncated streams are reported", async () => {
  assert.equal(typeof module.consumeAudioStream, "function");
  let seen = [];
  let finish;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"audio":"YW'));
      controller.enqueue(new TextEncoder().encode('Jj"}\n'));
      finish = () => {
        controller.enqueue(new TextEncoder().encode('{"done":true}\n'));
        controller.close();
      };
    },
  });
  const pending = module.consumeAudioStream({ body }, (audio) =>
    seen.push(audio),
  );
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(seen, ["YWJj"]);
  finish();
  await pending;
  await assert.rejects(
    module.consumeAudioStream(
      {
        body: new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('{"audio":"YWJj"}\n'));
            c.close();
          },
        }),
      },
      () => {},
    ),
    /中断/,
  );
});
