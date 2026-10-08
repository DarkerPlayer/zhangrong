import test from "node:test";
import assert from "node:assert/strict";
import { createGlamActionResources } from "../src/glam-action-resources.mjs";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("repeated sources decode once and the already loaded portrait is borrowed, never destroyed", async () => {
  const portrait = { name: "portrait" }, decoded = [], released = [];
  const store = createGlamActionResources({
    actions: { heart: ["/idle.png", { src: "/heart.png" }, { src: "/idle.png" }, "/heart.png"] },
    borrowFrame: source => (source.src || source) === "/idle.png" ? portrait : null,
    loadFrame: async source => { decoded.push(source.src || source); return { name: "heart" }; },
    releaseFrame: frame => released.push(frame),
  });
  const frames = await store.load("heart");
  assert.deepEqual(decoded, ["/heart.png"], "one new texture instead of three duplicate decodes");
  assert.equal(frames[0], portrait);
  assert.equal(frames[0], frames[2]);
  assert.equal(frames[1], frames[3]);
  const heart = frames[1];
  store.destroy();
  assert.deepEqual(released, [heart], "release each owned texture once, retain borrowed portrait");
});

test("suspending a hidden renderer immediately cancels and frees action resources", async () => {
  const released = [], gate = deferred();
  const store = createGlamActionResources({
    actions: { ready: ["ready"], pending: ["pending"] },
    loadFrame: async source => source === "pending" ? gate.promise : source,
    releaseFrame: frame => released.push(frame),
  });
  await store.load("ready");
  store.setActive("ready");
  assert.equal(typeof store.clear, "function");
  store.clear();
  assert.equal(store.get("ready"), null);
  assert.deepEqual(released, ["ready"]);
  const pending = store.load("pending");
  const rejected = assert.rejects(pending, { name: "AbortError" });
  store.clear();
  gate.resolve("late");
  await rejected;
  assert.deepEqual(released, ["ready", "late"]);
  assert.deepEqual(await store.load("ready"), ["ready"], "visible renderer can load again");
  store.destroy();
});

test("only two action frames decode at once and repeated requests share complete frames", async () => {
  const gates = Array.from({ length: 4 }, deferred);
  const started = [], released = [];
  const store = createGlamActionResources({
    actions: { walk: [0, 1, 2, 3], squat: [4] },
    loadFrame: (index) => { started.push(index); return gates[index].promise; },
    releaseFrame: (frame) => released.push(frame),
  });
  const pending = store.load("walk");
  assert.deepEqual(started, [0, 1]);
  assert.equal(store.load("walk"), pending);
  assert.equal(store.get("walk"), null);
  gates[1].resolve("second");
  await settle();
  assert.deepEqual(started, [0, 1, 2]);
  gates[0].resolve("first");
  await settle();
  assert.deepEqual(started, [0, 1, 2, 3]);
  gates[3].resolve("fourth");
  assert.equal(store.get("walk"), null);
  gates[2].resolve("third");
  assert.deepEqual(await pending, ["first", "second", "third", "fourth"]);
  assert.deepEqual(started, [0, 1, 2, 3], "no unrelated action was requested");
  store.destroy();
  assert.deepEqual(released, ["first", "second", "third", "fourth"]);
});

test("failed groups release completed and late frames instead of publishing partial poses", async () => {
  const gates = [deferred(), deferred(), deferred()];
  const released = [];
  const signals = [];
  const store = createGlamActionResources({
    actions: { walk: [0, 1, 2] },
    loadFrame: (index, signal) => { signals.push(signal); return gates[index].promise; },
    releaseFrame: (frame) => released.push(frame),
  });
  const pending = store.load("walk");
  const rejected = assert.rejects(pending, /bad frame/);
  gates[0].resolve("ready");
  await settle();
  gates[1].reject(new Error("bad frame"));
  await rejected;
  assert.equal(store.get("walk"), null);
  assert.deepEqual(released, ["ready"]);
  assert.ok(signals.every((signal) => signal.aborted));
  gates[2].resolve("late");
  await settle();
  assert.deepEqual(released, ["ready", "late"]);
  store.destroy();
});

test("active motions retain their frames and expiry starts only when they stop", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const released = [], detached = [];
  const store = createGlamActionResources({
    actions: { walk: ["frame"] }, loadFrame: async (frame) => frame,
    onRelease: (kind) => detached.push(kind),
    releaseFrame: (frame) => { assert.deepEqual(detached, ["walk"]); released.push(frame); },
  });
  await store.load("walk");
  store.setActive("walk");
  t.mock.timers.tick(120000);
  assert.deepEqual(released, []);
  store.setActive(null);
  t.mock.timers.tick(29999);
  assert.deepEqual(released, []);
  store.setActive(null);
  t.mock.timers.tick(1);
  assert.deepEqual(released, ["frame"], "idle ticks must not postpone eviction forever");
  assert.equal(store.get("walk"), null);
  store.destroy();
});
