import { test } from "node:test";
import assert from "node:assert/strict";
import { speechLevel } from "../src/speech-level.mjs";
test("lip sync stays closed on silence and low background noise", () => {
  assert.equal(speechLevel(new Float32Array(1024)), 0);
  assert.equal(speechLevel([0.002, -0.002]), 0);
  assert.equal(speechLevel([]), 0);
});
test("lip sync measures audio energy, regardless of sign, and caps opening", () => {
  assert.ok(speechLevel([0.05, -0.05]) > 0.25);
  assert.ok(speechLevel([0.1, -0.1]) > speechLevel([0.05, -0.05]));
  assert.equal(speechLevel([1, -1]), 1);
});
