import test from "node:test";
import assert from "node:assert/strict";
const motion = await import("../src/portrait-mouth.mjs").catch(() => ({}));
test("portrait speech motion is bounded, ignores noise, and closes promptly on pauses", () => {
  assert.equal(typeof motion.portraitMouth, "function");
  let mouth = 0;
  for (let i = 0; i < 60; i++) mouth = motion.portraitMouth(mouth, 1, 16.67);
  assert.ok(mouth > 0.5 && mouth <= 0.7);
  for (let i = 0; i < 20; i++) mouth = motion.portraitMouth(mouth, 0, 16.67);
  assert.equal(mouth, 0);
  assert.equal(motion.portraitMouth(0, 0.015, 16.67), 0);
  assert.equal(motion.portraitMouth(NaN, NaN, 16.67), 0);
});
test("portrait mouth follows elapsed time instead of changing with frame rate", () => {
  assert.equal(typeof motion.portraitMouth, "function");
  let a = 0,
    b = 0;
  for (let i = 0; i < 60; i++) a = motion.portraitMouth(a, 0.3, 1000 / 60);
  for (let i = 0; i < 120; i++) b = motion.portraitMouth(b, 0.3, 1000 / 120);
  assert.ok(Math.abs(a - b) < 0.001);
});
