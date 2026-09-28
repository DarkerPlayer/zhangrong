import test from "node:test";
import assert from "node:assert/strict";
import {
  P0_MOTION_IDS,
  createMotionManifest,
} from "../src/motion/MotionManifest.mjs";
import {
  GlamMotionAdapter,
  advanceRootMovement,
  frameAnchorOffset,
  locomotionEnvelope,
  resolveLocomotionSpeed,
  sampleFrameSequence,
  sampleGlamMotion,
} from "../src/motion/adapters/GlamMotionAdapter.mjs";
import * as GlamMotion from "../src/motion/adapters/GlamMotionAdapter.mjs";

const linwei = {
  id: "linwei-red-sole",
  character: "林薇",
  actions: {
    squat: ["squat.png"],
    sexyWalk: [
      { src: "01.png", durationMs: 75, phase: "right_contact", groundAnchor: [0.5, 0.98], contact: "right" },
      { src: "02.png", durationMs: 55, phase: "right_settle", groundAnchor: [0.49, 0.98] },
      { src: "03.png", durationMs: 45, phase: "right_down", groundAnchor: [0.48, 0.98] },
      { src: "04.png", durationMs: 65, phase: "left_pre_contact", groundAnchor: [0.47, 0.98] },
    ],
  },
};

test("a Linwei look exposes all eight P0 motions without changing legacy assets", () => {
  const manifest = createMotionManifest(linwei);
  assert.equal(manifest.version, 2);
  assert.equal(manifest.character, "林薇");
  assert.deepEqual(P0_MOTION_IDS.filter((id) => !(id in manifest.motions)), []);
  assert.equal(manifest.motions.walk_feminine.assets, "sexyWalk");
  assert.equal(manifest.motions.walk_feminine.frames.length, 4);
  assert.equal(manifest.motions.walk_feminine.frames[0].phase, "right_contact");
  assert.equal(manifest.motions.walk_feminine.durationMs, 240);
  assert.equal(manifest.motions.crouch_idle.assets, "squat");
  assert.equal(manifest.motions.crouch_enter.next, "crouch_idle");
});

test("a look without pose PNGs keeps mesh idle and marks full-body motions unavailable", () => {
  const manifest = createMotionManifest({ id: "plain", character: "Plain", actions: null });
  const adapter = new GlamMotionAdapter({ manifest, availableActions: {} });
  assert.equal(adapter.canPlay("idle_neutral"), true);
  assert.equal(adapter.canPlay("idle_weight_shift"), true);
  assert.equal(adapter.canPlay("walk_feminine"), false);
  assert.equal(adapter.canPlay("crouch_enter"), false);
});

test("walk frames honor authored durations and never alpha-blend adjacent silhouettes", () => {
  const frames = linwei.actions.sexyWalk;
  assert.deepEqual(sampleFrameSequence(frames, 0), {
    index: 0, nextIndex: 1, blend: 0, frameElapsedMs: 0, frameDurationMs: 75,
    phase: "right_contact", contact: "right", groundAnchor: [0.5, 0.98],
  });
  assert.equal(sampleFrameSequence(frames, 74).index, 0);
  assert.equal(sampleFrameSequence(frames, 75).index, 1);
  assert.equal(sampleFrameSequence(frames, 129).index, 1);
  assert.equal(sampleFrameSequence(frames, 130).index, 2);
  assert.equal(sampleFrameSequence(frames, 239).index, 3);
  assert.equal(sampleFrameSequence(frames, 240).index, 0, "the authored cycle should wrap exactly");
  for (let time = 0; time < 480; time += 7) assert.equal(sampleFrameSequence(frames, time).blend, 0);
  const rightContact = sampleGlamMotion({ id: "walk_feminine", durationMs: 240, frames }, 0, frames.length);
  const passing = sampleGlamMotion({ id: "walk_feminine", durationMs: 240, frames }, 130, frames.length);
  assert.equal(rightContact.frame.index, 0);
  assert.equal(passing.frame.index, 2);
  assert.notEqual(rightContact.pose.hipRoll, passing.pose.hipRoll);
  assert.ok(Math.abs(rightContact.pose.headAngle) < Math.abs(rightContact.pose.hipRoll * 100));
});

test("walk frame compositing keeps full opacity through every cross-fade", () => {
  assert.equal(typeof GlamMotion.frameCompositeWeights, "function");
  const samples = [
    [0, 0, { base: 1, current: 0, next: 0 }],
    [0, 1, { base: 0, current: 1, next: 0 }],
    [0.5, 1, { base: 0, current: 0.5, next: 0.5 }],
    [1, 1, { base: 0, current: 0, next: 1 }],
    [0.5, 0.5, { base: 0.5, current: 0.25, next: 0.25 }],
  ];
  for (const [blend, poseAlpha, expected] of samples) {
    const weights = GlamMotion.frameCompositeWeights(blend, poseAlpha);
    assert.deepEqual(weights, expected);
    assert.ok(Math.abs(weights.base + weights.current + weights.next - 1) < 1e-9);
  }
});

test("crouch enter, hold and exit expose a smooth pose alpha", () => {
  const enterMid = sampleGlamMotion({ id: "crouch_enter", durationMs: 800 }, 400, 1);
  const hold = sampleGlamMotion({ id: "crouch_idle", durationMs: 2000 }, 500, 1);
  const exitMid = sampleGlamMotion({ id: "crouch_exit", durationMs: 800 }, 400, 1);
  assert.ok(enterMid.poseAlpha > 0.45 && enterMid.poseAlpha < 0.55);
  assert.equal(hold.poseAlpha, 1);
  assert.ok(exitMid.poseAlpha > 0.45 && exitMid.poseAlpha < 0.55);
  assert.ok(hold.pose.breath !== 0);
});

test("Glam adapter samples by elapsed milliseconds and resets on stop", () => {
  const manifest = createMotionManifest(linwei);
  const adapter = new GlamMotionAdapter({ manifest, availableActions: { sexyWalk: 4, squat: 1 } });
  const motion = manifest.motions.walk_confident;
  adapter.play(motion, { elapsedMs: 0, facing: "left" });
  adapter.update({ elapsedMs: motion.durationMs / 2, facing: "left" }, motion.durationMs / 2);
  assert.equal(adapter.getSample().facing, "left");
  assert.equal(adapter.getSample().frame.phase, "right_settle");
  adapter.update({ elapsedMs: 0, totalElapsedMs: motion.durationMs, facing: "left" }, motion.durationMs / 2);
  assert.equal(adapter.getSample().poseAlpha, 1, "loop seams must not fade the artwork every cycle");
  adapter.stop(motion, "stopped");
  assert.equal(adapter.getSample().poseAlpha, 0);
});

test("screen root movement is frame-rate independent and reverses at safe bounds", () => {
  let at60 = { offset: 0, direction: 1 };
  let at30 = { offset: 0, direction: 1 };
  for (let i = 0; i < 60; i++) at60 = advanceRootMovement(at60, 1000 / 60, 48, 24);
  for (let i = 0; i < 30; i++) at30 = advanceRootMovement(at30, 1000 / 30, 48, 24);
  assert.ok(Math.abs(at60.offset - at30.offset) < 0.001);
  const bounced = advanceRootMovement({ offset: 23, direction: 1 }, 100, 48, 24);
  assert.equal(bounced.offset, 24);
  assert.equal(bounced.direction, -1);
});

test("walk grounding mirrors horizontal correction while keeping the ground Y fixed", () => {
  assert.deepEqual(frameAnchorOffset([0.48, 0.975], [0.5, 0.982], "right"), { x: 0.02, y: 0.007 });
  assert.deepEqual(frameAnchorOffset([0.48, 0.975], [0.5, 0.982], "left"), { x: -0.02, y: 0.007 });
  assert.deepEqual(frameAnchorOffset([0.1, 0.8], [0.5, 0.982], "right"), { x: 0.03, y: 0.02 });
});

test("walk translation uses the authored stride and eases into and out of locomotion", () => {
  const manifest = createMotionManifest(linwei);
  const motion = manifest.motions.walk_feminine;
  assert.equal(resolveLocomotionSpeed(motion), 72);
  assert.equal(motion.stridePx, 17.28);
  assert.equal(locomotionEnvelope({ totalElapsedMs: 0, remainingMs: Infinity }, { accelerationMs: 280, decelerationMs: 320 }), 0);
  assert.equal(locomotionEnvelope({ totalElapsedMs: 140, remainingMs: Infinity }, { accelerationMs: 280, decelerationMs: 320 }), 0.5);
  assert.equal(locomotionEnvelope({ totalElapsedMs: 280, remainingMs: 1000 }, { accelerationMs: 280, decelerationMs: 320 }), 1);
  assert.equal(locomotionEnvelope({ totalElapsedMs: 1000, remainingMs: 160 }, { accelerationMs: 280, decelerationMs: 320 }), 0.5);
  assert.equal(locomotionEnvelope({ totalElapsedMs: 1000, remainingMs: 0 }, { accelerationMs: 280, decelerationMs: 320 }), 0);
});
