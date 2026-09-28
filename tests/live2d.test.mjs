import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import {
  LIVE2D_MODEL_URL,
  actionPlan,
  applyExpression,
  fitModel,
  lipSyncIds,
  smoothMouth,
  pointerFocus,
} from "../src/live2d-motion.mjs";
import {
  LIVE2D_MOTIONS,
  Live2DMotionAdapter,
  resolveLive2DMotion,
} from "../src/motion/adapters/Live2DMotionAdapter.mjs";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const modelPath = path.join(publicDir, LIVE2D_MODEL_URL);
const manifest = JSON.parse(await readFile(modelPath, "utf8"));

test("the bundled manifest resolves every resource locally, with no sample voice dependency", async () => {
  const refs = manifest.FileReferences;
  const paths = [
    refs.Moc,
    refs.Physics,
    refs.Pose,
    ...refs.Textures,
    ...refs.Expressions.map((item) => item.File),
    ...Object.values(refs.Motions)
      .flat()
      .map((item) => item.File),
  ];
  for (const resource of paths) {
    assert.equal(/^https?:|^\/|\.\./.test(resource), false, resource);
    await access(path.join(path.dirname(modelPath), resource));
  }
  for (const item of Object.values(refs.Motions).flat())
    assert.equal(item.Sound, undefined);
  assert.equal(refs.Textures.length, 2);
  assert.deepEqual(lipSyncIds(manifest), ["ParamMouthOpenY"]);
});

test("every UI interaction selects an available authored motion and expression", () => {
  const expressions = new Set(
    manifest.FileReferences.Expressions.map((item) => item.Name),
  );
  const files = new Set();
  for (const kind of ["idle", "pat", "wave", "happy", "shy"]) {
    const plan = actionPlan(kind);
    const motion = manifest.FileReferences.Motions[plan.group]?.[plan.index];
    assert.ok(motion?.File, kind);
    files.add(motion.File);
    if (plan.expression) assert.ok(expressions.has(plan.expression), kind);
  }
  assert.equal(
    files.size,
    5,
    "the five interactions should use the five distinct authored motions",
  );
  assert.deepEqual(actionPlan("unsupported"), actionPlan("idle"));
});

test("V2 motion ids map to current Haru groups without requiring new Cubism assets", () => {
  const groups = { Idle: 3, Tap: 2 };
  assert.deepEqual(resolveLive2DMotion("walk_feminine", groups), {
    group: "Idle", index: 1, priority: 2, expression: "f00",
  });
  assert.deepEqual(resolveLive2DMotion("crouch_enter", groups), {
    group: "Tap", index: 1, priority: 3, expression: "f06",
  });
  assert.deepEqual(resolveLive2DMotion("missing", groups), {
    group: "Idle", index: 0, priority: 1, expression: null,
  });
  assert.equal(LIVE2D_MOTIONS.crouch_idle.loop, true);
});

test("Haru mapping falls back when a configured motion index is absent", () => {
  assert.deepEqual(resolveLive2DMotion("walk_confident", { Idle: 1, Tap: 1 }), {
    group: "Idle", index: 0, priority: 1, expression: null,
  });
});

test("an interrupted Haru motion cannot apply its stale expression later", async () => {
  const pending = [];
  const expressions = [];
  const adapter = new Live2DMotionAdapter({
    model: { motion: () => new Promise((resolve) => pending.push(resolve)) },
    groups: { Idle: 3, Tap: 2 },
    setExpression: (expression) => expressions.push(expression),
  });
  adapter.play(LIVE2D_MOTIONS.idle_hair_touch);
  adapter.play(LIVE2D_MOTIONS.walk_confident);
  pending[0](true);
  await Promise.resolve();
  assert.deepEqual(expressions, []);
  pending[1](true);
  await Promise.resolve();
  assert.deepEqual(expressions, ["f04"]);
});

test("a real expression manager reapplies a smile after neutral reset and rejects failed loads", async () => {
  const previousWindow = globalThis.window;
  // The expression manager does not use Core or WebGL; its package only checks
  // for the Core global during import. Exercise the real manager's state machine.
  globalThis.window = { Live2DCubismCore: {} };
  const require = createRequire(import.meta.url);
  const { Cubism4ExpressionManager } = require("pixi-live2d-display/cubism4");
  globalThis.window = previousWindow;
  const manager = new Cubism4ExpressionManager({
    name: "expression-regression",
    expressions: [{ Name: "f04" }, { Name: "failed" }],
  });
  const smile = manager.createExpression(
    JSON.parse(
      await readFile(
        path.join(path.dirname(modelPath), "expressions/F05.exp3.json"),
        "utf8",
      ),
    ),
  );
  manager.expressions[0] = smile;
  manager.expressions[1] = null;
  const activations = [];
  const originalSet = manager._setExpression.bind(manager);
  manager._setExpression = (expression) => {
    activations.push(expression);
    return originalSet(expression);
  };
  const model = {
    internalModel: { motionManager: { expressionManager: manager } },
    expression: manager.setExpression.bind(manager),
  };
  try {
    assert.equal(await applyExpression(model, "f04"), true);
    manager.resetExpression();
    assert.equal(
      manager.currentExpression,
      smile,
      "the upstream reset retains its current identity",
    );
    assert.equal(await applyExpression(model, "f04"), true);
    assert.deepEqual(activations, [smile, manager.defaultExpression, smile]);
    const count = activations.length;
    assert.equal(await applyExpression(model, "failed"), false);
    assert.equal(await applyExpression(model, "unknown"), false);
    assert.equal(
      activations.length,
      count,
      "failed requests must not restore or report an unrelated expression",
    );
  } finally {
    manager.destroy();
  }
});

test("pet fit preserves the full model inside narrow and wide hosts", () => {
  for (const [width, height, pet] of [
    [340, 480, true],
    [700, 790, true],
    [180, 300, true],
  ]) {
    const fit = fitModel(width, height, 2400, 4500, pet);
    assert.ok(fit.scale > 0);
    assert.ok(fit.x - 1200 * fit.scale >= 0);
    assert.ok(fit.x + 1200 * fit.scale <= width);
    assert.ok(fit.y - 4500 * fit.scale >= 0);
    assert.ok(fit.y <= height);
  }
  assert.ok(Number.isFinite(fitModel(0, 0, 0, 0).scale));
});

test("desktop portrait framing enlarges the character and preserves the top margin", () => {
  const width = 700;
  const height = 790;
  const fit = fitModel(width, height, 2400, 4500, false);
  const fullHeightScale = (height * 0.91) / 4500;
  assert.ok(fit.scale / fullHeightScale >= 1.4);
  assert.ok(fit.scale / fullHeightScale <= 1.55);
  assert.ok(Math.abs(fit.y - 4500 * fit.scale - height * 0.045) < 0.00001);
  assert.ok(fit.y > height, "the portrait intentionally crops the lower legs");
  assert.ok(
    fit.x - 1200 * fit.scale >= 0,
    "gesturing arms retain horizontal room",
  );
  assert.ok(fit.x + 1200 * fit.scale <= width);
});

test("lip sync responds promptly, decays to a closed mouth, and tolerates invalid audio samples", () => {
  let value = smoothMouth(0, 1, 33);
  assert.ok(value > 0.4 && value < 1);
  const twice = smoothMouth(smoothMouth(0, 1, 16), 1, 16);
  assert.ok(Math.abs(twice - smoothMouth(0, 1, 32)) < 0.00001);
  for (let i = 0; i < 40; i++) value = smoothMouth(value, 0, 33);
  assert.equal(value, 0);
  assert.equal(smoothMouth(0, NaN, 33), 0);
  assert.ok(smoothMouth(0, 50, 33) <= 1);
});

test("pointer gaze stays within the rig's comfortable range, including outside its canvas", () => {
  const bounds = { left: 100, top: 50, width: 340, height: 480 };
  assert.deepEqual(pointerFocus(270, 251.6, bounds), { x: 0, y: 0 });
  assert.deepEqual(pointerFocus(10000, -10000, bounds), { x: 0.8, y: 0.65 });
  assert.deepEqual(pointerFocus(-10000, 10000, bounds), { x: -0.8, y: -0.65 });
});

test("the real local Cubism Core loads Haru and deforms mouth, eyes, head and breath geometry", async () => {
  const sandbox = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    TextDecoder,
    TextEncoder,
    atob,
    Uint8Array,
    Int8Array,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    ArrayBuffer,
    WebAssembly,
  });
  vm.runInContext(
    await readFile(
      path.join(publicDir, "vendor/live2dcubismcore.min.js"),
      "utf8",
    ),
    sandbox,
  );
  const core = sandbox.Live2DCubismCore;
  let initialized = false;
  for (let retry = 0; retry < 50; retry++) {
    try {
      initialized = core.Version.csmGetVersion() > 0;
    } catch {
      /* embedded WASM is still starting */
    }
    if (initialized) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(
    initialized,
    "embedded Cubism runtime should initialize without external files",
  );
  const bytes = await readFile(
    path.join(path.dirname(modelPath), manifest.FileReferences.Moc),
  );
  const moc = core.Moc.fromArrayBuffer(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  assert.ok(moc, "Haru .moc3 must be compatible with the bundled Core");
  const model = core.Model.fromMoc(moc);
  try {
    assert.equal(model.canvasinfo.CanvasWidth, 2400);
    assert.equal(model.canvasinfo.CanvasHeight, 4500);
    const snapshot = () =>
      Array.from(model.drawables.vertexPositions, (vertices) =>
        Array.from(vertices),
      ).flat();
    for (const [parameter, target] of [
      ["ParamMouthOpenY", 1],
      ["ParamEyeLOpen", 0],
      ["ParamAngleX", 25],
      ["ParamBreath", 1],
    ]) {
      model.parameters.values.set(model.parameters.defaultValues);
      model.update();
      const baseline = snapshot();
      const index = model.parameters.ids.indexOf(parameter);
      assert.ok(index >= 0, `${parameter} must exist in this actual rig`);
      model.parameters.values[index] = target;
      model.update();
      const changed = snapshot();
      assert.ok(
        changed.some((value, i) => Math.abs(value - baseline[i]) > 0.00001),
        `${parameter} should move real vertices`,
      );
    }
  } finally {
    model.release();
    moc._release();
  }
});
