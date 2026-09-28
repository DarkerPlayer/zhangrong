import test from "node:test";
import assert from "node:assert/strict";
import { MotionScheduler } from "../src/motion/MotionScheduler.mjs";
import { MOTION_STATES } from "../src/motion/constants.mjs";

const idle = { state: MOTION_STATES.IDLE, priority: 1 };

test("idle scheduler never interrupts locomotion or explicit motion", () => {
  const scheduler = new MotionScheduler({
    entries: [{ id: "idle_hair_touch", weight: 1, cooldownMs: 0 }],
    intervalMs: [1000, 1000],
    random: () => 0,
  });
  assert.equal(scheduler.update(2000, { state: MOTION_STATES.MOVE, priority: 2 }, () => true), null);
  assert.equal(scheduler.update(2000, { state: MOTION_STATES.CROUCH_IDLE, priority: 5 }, () => true), null);
});

test("idle scheduler selects an available variation and respects its cooldown", () => {
  const scheduler = new MotionScheduler({
    entries: [{ id: "idle_hair_touch", weight: 1, cooldownMs: 30000 }],
    intervalMs: [1000, 1000],
    random: () => 0,
  });
  assert.equal(scheduler.update(999, idle, () => true), null);
  assert.equal(scheduler.update(1, idle, () => true), "idle_hair_touch");
  assert.equal(scheduler.update(29000, idle, () => true), null);
  assert.equal(scheduler.update(1000, idle, () => true), "idle_hair_touch");
});

test("unavailable variations are skipped without throwing", () => {
  const scheduler = new MotionScheduler({ intervalMs: [1, 1], random: () => 0 });
  assert.equal(scheduler.update(10, idle, () => false), null);
});
