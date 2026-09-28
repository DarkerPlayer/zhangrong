import test from "node:test";
import assert from "node:assert/strict";
import {
  applyEasing,
  interpolateValue,
  sampleKeyframes,
} from "../src/motion/MotionInterpolator.mjs";
import {
  createSecondaryMotion,
  stepSecondaryMotion,
} from "../src/motion/secondary-motion.mjs";

test("interpolation easings preserve endpoints and smoothstep midpoint", () => {
  for (const easing of ["linear", "easeIn", "easeOut", "easeInOut", "smoothstep"]) {
    assert.equal(applyEasing(easing, 0), 0);
    assert.equal(applyEasing(easing, 1), 1);
  }
  assert.equal(applyEasing("smoothstep", 0.5), 0.5);
  assert.equal(applyEasing("unknown", 0.25), 0.25);
});

test("nested motion values interpolate without mutating either pose", () => {
  const from = { body: { x: 0, scaleX: 1 }, pose: { hipRoll: -0.04 } };
  const to = { body: { x: 10, scaleX: 0.9 }, pose: { hipRoll: 0.04 } };
  assert.deepEqual(interpolateValue(from, to, 0.25), {
    body: { x: 2.5, scaleX: 0.975 },
    pose: { hipRoll: -0.02 },
  });
  assert.equal(from.body.x, 0);
  assert.equal(to.body.x, 10);
});

test("keyframe sampling wraps a cycle and interpolates across its final seam", () => {
  const frames = [
    { time: 0, value: { hipX: 0 } },
    { time: 0.5, value: { hipX: 1 } },
    { time: 0.75, value: { hipX: -1 } },
  ];
  assert.deepEqual(sampleKeyframes(frames, 250, { durationMs: 1000, loop: true }), { hipX: 0.5 });
  assert.deepEqual(sampleKeyframes(frames, 875, { durationMs: 1000, loop: true }), { hipX: -0.5 });
  assert.deepEqual(sampleKeyframes(frames, 1250, { durationMs: 1000, loop: true }), { hipX: 0.5 });
});

test("secondary motion reaches nearly the same result at 30 Hz and 60 Hz", () => {
  const at60 = createSecondaryMotion(["hairLag", "clothLag"]);
  const at30 = createSecondaryMotion(["hairLag", "clothLag"]);
  for (let i = 0; i < 60; i++) stepSecondaryMotion(at60, { hairLag: 1, clothLag: -0.5 }, 1000 / 60);
  for (let i = 0; i < 30; i++) stepSecondaryMotion(at30, { hairLag: 1, clothLag: -0.5 }, 1000 / 30);
  assert.ok(Math.abs(at60.hairLag.value - at30.hairLag.value) < 0.015);
  assert.ok(Math.abs(at60.clothLag.value - at30.clothLag.value) < 0.015);
  assert.ok(at60.hairLag.value > 0.85 && at60.hairLag.value < 1.05);
});
