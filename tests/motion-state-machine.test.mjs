import test from "node:test";
import assert from "node:assert/strict";
import { MOTION_PRIORITIES, MOTION_STATES } from "../src/motion/constants.mjs";
import { MotionStateMachine } from "../src/motion/MotionStateMachine.mjs";
import { MotionController } from "../src/motion/MotionController.mjs";

const motions = {
  idle_neutral: { id: "idle_neutral", category: "idle", durationMs: 1000, loop: true, priority: 1 },
  idle_hair_touch: { id: "idle_hair_touch", category: "idle", durationMs: 500, loop: false, priority: 1 },
  walk_feminine: {
    id: "walk_feminine", category: "locomotion", durationMs: 1000, loop: true, priority: 2,
    events: [{ timeMs: 250, event: "foot_left_contact" }, { timeMs: 750, event: "foot_right_contact" }],
    safeExitEvents: ["foot_left_contact", "foot_right_contact"],
  },
  crouch_enter: { id: "crouch_enter", category: "crouch", durationMs: 600, loop: false, priority: 5, next: "crouch_idle" },
  crouch_idle: { id: "crouch_idle", category: "crouch", durationMs: 1000, loop: true, priority: 5 },
  crouch_exit: { id: "crouch_exit", category: "crouch", durationMs: 500, loop: false, priority: 5, next: "idle_neutral" },
};

function fixture(options = {}) {
  const calls = [];
  const adapter = {
    canPlay: (id) => id in motions,
    play: (motion, context) => calls.push(["play", motion.id, context.facing]),
    update: (snapshot, dt) => calls.push(["update", snapshot.motionId, dt]),
    stop: (motion, reason) => calls.push(["stop", motion.id, reason]),
    destroy: () => calls.push(["destroy"]),
  };
  return { calls, controller: new MotionController({ motions, adapter, ...options }) };
}

test("state machine covers walk and the complete crouch sequence", () => {
  const machine = new MotionStateMachine();
  assert.equal(machine.state, MOTION_STATES.IDLE);
  machine.enterMotion(motions.walk_feminine);
  assert.equal(machine.state, MOTION_STATES.MOVE);
  machine.enterMotion(motions.idle_neutral);
  assert.equal(machine.state, MOTION_STATES.IDLE);
  machine.enterMotion(motions.crouch_enter);
  assert.equal(machine.state, MOTION_STATES.CROUCH_ENTER);
  machine.enterMotion(motions.crouch_idle);
  assert.equal(machine.state, MOTION_STATES.CROUCH_IDLE);
  machine.enterMotion(motions.crouch_exit);
  assert.equal(machine.state, MOTION_STATES.CROUCH_EXIT);
});

test("explicit crouch interrupts idle but idle cannot interrupt crouch", () => {
  const { controller, calls } = fixture();
  assert.equal(controller.playMotion("idle_hair_touch").accepted, true);
  assert.equal(controller.playMotion("crouch_enter", { priority: MOTION_PRIORITIES.EXPLICIT }).accepted, true);
  assert.deepEqual(calls.slice(0, 3).map((call) => call.slice(0, 2)), [
    ["play", "idle_hair_touch"],
    ["stop", "idle_hair_touch"],
    ["play", "crouch_enter"],
  ]);
  assert.deepEqual(controller.playMotion("idle_hair_touch"), {
    accepted: false,
    reason: "priority",
    motionId: "idle_hair_touch",
  });
});

test("controller advances enter to crouch idle and exit back to idle", () => {
  const { controller } = fixture();
  controller.playMotion("crouch_enter");
  controller.update(600);
  assert.equal(controller.getMotionState().motionId, "crouch_idle");
  assert.equal(controller.getMotionState().state, MOTION_STATES.CROUCH_IDLE);
  controller.playMotion("crouch_exit", { priority: MOTION_PRIORITIES.EXPLICIT });
  controller.update(500);
  assert.equal(controller.getMotionState().motionId, "idle_neutral");
  assert.equal(controller.getMotionState().state, MOTION_STATES.IDLE);
});

test("queued motion starts after a finite motion and facing is normalized", () => {
  const { controller } = fixture();
  controller.setFacing("left");
  controller.playMotion("idle_hair_touch");
  assert.equal(controller.queueMotion("walk_feminine").accepted, true);
  controller.update(500);
  assert.equal(controller.getMotionState().motionId, "walk_feminine");
  assert.equal(controller.getMotionState().facing, "left");
  controller.setFacing("diagonal");
  assert.equal(controller.getMotionState().facing, "left");
});

test("destroy stops the adapter and makes later requests inert", () => {
  const { controller, calls } = fixture();
  controller.playMotion("idle_neutral");
  controller.destroy();
  assert.equal(controller.playMotion("walk_feminine").accepted, false);
  assert.deepEqual(calls.at(-1), ["destroy"]);
});

test("motion events survive large frame steps and repeat once per loop crossing", () => {
  const events = [];
  const { controller } = fixture({ onEvent: (event) => events.push(event) });
  controller.playMotion("walk_feminine", { durationMs: 2300 });
  controller.update(2300);
  assert.deepEqual(events.map(({ event, occurrenceMs }) => [event, occurrenceMs]), [
    ["foot_left_contact", 250],
    ["foot_right_contact", 750],
    ["foot_left_contact", 1250],
    ["foot_right_contact", 1750],
    ["foot_left_contact", 2250],
  ]);
});

test("finite walking extends to the next contact-safe event before completing", () => {
  const { controller, calls } = fixture();
  controller.playMotion("walk_feminine", { durationMs: 1300 });
  assert.equal(controller.getMotionState().durationLimitMs, 1750);
  assert.equal(controller.getMotionState().safeExitPending, true);
  controller.update(1749);
  assert.equal(controller.getMotionState().motionId, "walk_feminine");
  controller.update(1);
  assert.equal(controller.getMotionState().motionId, null);
  assert.deepEqual(calls.at(-1).slice(0, 3), ["stop", "walk_feminine", "complete"]);

  controller.playMotion("walk_feminine", { durationMs: 1250 });
  assert.equal(controller.getMotionState().durationLimitMs, 1250, "an exact contact should not add another half-cycle");
});

test("debug frame hold exposes the selected frame and freezes the motion clock", () => {
  const { controller } = fixture();
  controller.playMotion("walk_feminine", { debugFrameIndex: 3, debugHold: true });
  assert.equal(controller.getMotionState().debugFrameIndex, 3);
  controller.update(500);
  assert.equal(controller.getMotionState().totalElapsedMs, 0);
  assert.equal(controller.getMotionState().motionId, "walk_feminine");
});
