import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MOTION_FALLBACKS,
  resolveMotionId,
} from "../src/motion/MotionFallback.mjs";

test("a missing confident walk falls back to feminine walk", () => {
  const available = new Set(["walk_feminine", "legacy_walk", "idle_neutral"]);
  assert.equal(resolveMotionId("walk_confident", available), "walk_feminine");
});

test("a look with no authored walk falls back through legacy to idle without throwing", () => {
  assert.equal(resolveMotionId("walk_confident", new Set(["legacy_walk", "idle_neutral"])), "legacy_walk");
  assert.equal(resolveMotionId("walk_feminine", new Set(["idle_neutral"])), "idle_neutral");
});

test("fallback resolution tolerates unknown motions and cycles", () => {
  assert.equal(resolveMotionId("does_not_exist", new Set(["idle_neutral"])), "idle_neutral");
  assert.equal(resolveMotionId("a", new Set(), { a: ["b"], b: ["a"] }), null);
  assert.ok(Object.isFrozen(DEFAULT_MOTION_FALLBACKS));
});
