import { applyEasing, sampleKeyframes } from "../MotionInterpolator.mjs";
import { createSecondaryMotion, stepSecondaryMotion } from "../secondary-motion.mjs";

const zeroPose = () => ({
  hipX: 0, hipY: 0, hipRoll: 0, chestRoll: 0, shoulderRoll: 0,
  headAngle: 0, bodyX: 0, bodyY: 0, rootX: 0, breath: 0,
  hairLag: 0, clothLag: 0, armAngle: 0,
});

const WALK_FEMININE = Object.freeze([
  { time: 0, easing: "smoothstep", value: { ...zeroPose(), hipX: 0.006, hipRoll: 0.035, chestRoll: -0.018, shoulderRoll: -0.028, headAngle: -0.12, hairLag: -0.002 } },
  { time: 0.125, easing: "smoothstep", value: { ...zeroPose(), hipX: 0.012, hipY: 0.003, hipRoll: 0.022, chestRoll: -0.014, shoulderRoll: -0.021, bodyY: 0.003, hairLag: -0.004 } },
  { time: 0.25, easing: "smoothstep", value: { ...zeroPose(), hipX: 0, hipRoll: 0.006, chestRoll: -0.004, shoulderRoll: 0.006, bodyY: -0.002, hairLag: -0.002 } },
  { time: 0.375, easing: "smoothstep", value: { ...zeroPose(), hipX: -0.008, hipY: -0.002, hipRoll: -0.022, chestRoll: 0.014, shoulderRoll: 0.021, bodyY: -0.004, hairLag: 0.003 } },
  { time: 0.5, easing: "smoothstep", value: { ...zeroPose(), hipX: -0.006, hipRoll: -0.035, chestRoll: 0.018, shoulderRoll: 0.028, headAngle: 0.12, hairLag: 0.002 } },
  { time: 0.625, easing: "smoothstep", value: { ...zeroPose(), hipX: -0.012, hipY: 0.003, hipRoll: -0.022, chestRoll: 0.014, shoulderRoll: 0.021, bodyY: 0.003, hairLag: 0.004 } },
  { time: 0.75, easing: "smoothstep", value: { ...zeroPose(), hipX: 0, hipRoll: -0.006, chestRoll: 0.004, shoulderRoll: -0.006, bodyY: -0.002, hairLag: 0.002 } },
  { time: 0.875, easing: "smoothstep", value: { ...zeroPose(), hipX: 0.008, hipY: -0.002, hipRoll: 0.022, chestRoll: -0.014, shoulderRoll: -0.021, bodyY: -0.004, hairLag: -0.003 } },
]);

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export function advanceRootMovement(state = {}, deltaMs = 0, speedPxPerSecond = 0, boundPx = 0) {
  const bound = Math.max(0, Number(boundPx) || 0);
  const direction = state.direction === -1 ? -1 : 1;
  const offset = Number.isFinite(state.offset) ? state.offset : 0;
  const distance = Math.max(0, Number(speedPxPerSecond) || 0) * Math.max(0, Number(deltaMs) || 0) / 1000;
  const next = offset + direction * distance;
  if (next >= bound) return { offset: bound, direction: -1 };
  if (next <= -bound) return { offset: -bound, direction: 1 };
  return { offset: next, direction };
}

export function sampleFrameSequence(frameCount, elapsedMs, durationMs) {
  const count = Math.max(1, Math.floor(Number(frameCount) || 1));
  const duration = Math.max(1, Number(durationMs) || 1);
  const phase = ((((Number(elapsedMs) || 0) % duration) + duration) % duration) / duration * count;
  const index = Math.floor(phase) % count;
  const localPhase = phase - Math.floor(phase);
  // Full-frame dissolves make separated arms and legs appear twice. Hold the
  // authored pose, then use a short eased seam to hide the four-frame cut;
  // the eight-phase mesh curve supplies continuity between those seams.
  const blend = applyEasing("smoothstep", clamp01((localPhase - 0.62) / 0.38));
  return { index, nextIndex: (index + 1) % count, blend };
}

export function sampleGlamMotion(motion = {}, elapsedMs = 0, frameCount = 0) {
  const id = motion.id || "idle_neutral";
  const durationMs = Math.max(1, Number(motion.durationMs) || 1);
  const seconds = Math.max(0, Number(elapsedMs) || 0) / 1000;
  let pose = zeroPose();
  let poseAlpha = 0;
  let frame = null;
  let actionKind = id;
  if (/^walk_|legacy_walk/.test(id)) {
    pose = sampleKeyframes(WALK_FEMININE, elapsedMs, { durationMs, loop: true });
    if (id === "walk_confident") {
      pose = { ...pose, hipX: pose.hipX * 0.86, hipRoll: pose.hipRoll * 0.88, shoulderRoll: pose.shoulderRoll * 0.9, bodyY: pose.bodyY * 0.65 };
    }
    frame = sampleFrameSequence(frameCount, elapsedMs, durationMs);
    poseAlpha = frameCount > 0 ? Math.min(1, elapsedMs / Math.max(1, motion.blendInMs || 180)) : 0;
    actionKind = "sexyWalk";
  } else if (/^crouch_|legacy_crouch/.test(id)) {
    const progress = clamp01(elapsedMs / durationMs);
    if (id === "crouch_enter") poseAlpha = applyEasing("easeInOut", progress);
    else if (id === "crouch_exit") poseAlpha = 1 - applyEasing("easeInOut", progress);
    else if (id === "legacy_crouch") {
      const enter = applyEasing("easeInOut", Math.min(1, progress / 0.22));
      const exit = 1 - applyEasing("easeInOut", Math.max(0, (progress - 0.78) / 0.22));
      poseAlpha = Math.min(enter, exit);
    } else poseAlpha = 1;
    pose = { ...zeroPose(), bodyY: 0.006, hipY: 0.008, breath: Math.sin(seconds * 1.6) * 0.16, hairLag: Math.sin(seconds * 1.05) * 0.0015 };
    frame = frameCount > 0 ? { index: 0, nextIndex: 0, blend: 0 } : null;
    actionKind = "squat";
  } else if (id === "idle_weight_shift") {
    const wave = Math.sin((elapsedMs / durationMs) * Math.PI);
    pose = { ...zeroPose(), hipX: 0.012 * wave, hipRoll: 0.018 * wave, chestRoll: -0.009 * wave, shoulderRoll: -0.012 * wave, hairLag: -0.0015 * wave };
  } else if (id === "idle_hair_touch") {
    const envelope = Math.sin(clamp01(elapsedMs / durationMs) * Math.PI);
    pose = { ...zeroPose(), headAngle: -2.2 * envelope, headNod: 0.0015 * envelope, hairLag: 0.004 * envelope, armAngle: -0.08 * envelope };
  } else if (id === "look_back") {
    const envelope = Math.sin(clamp01(elapsedMs / durationMs) * Math.PI);
    pose = { ...zeroPose(), headAngle: 3.5 * envelope, shoulderRoll: -0.026 * envelope, chestRoll: -0.018 * envelope, hairLag: -0.004 * envelope };
  } else if (["wave", "pat", "happy", "shy"].includes(id)) {
    actionKind = id;
  }
  return { motionId: id, actionKind, elapsed: Math.max(0, Number(elapsedMs) || 0), pose, poseAlpha, frame };
}

export class GlamMotionAdapter {
  constructor({ manifest, availableActions = {} } = {}) {
    this.manifest = manifest || { motions: {} };
    this.availableActions = availableActions;
    this.motion = null;
    this.sample = { motionId: null, actionKind: null, pose: zeroPose(), poseAlpha: 0, frame: null, facing: "right" };
    this.secondary = createSecondaryMotion(["hairLag", "clothLag"]);
  }

  canPlay(id, definition = this.manifest.motions[id]) {
    if (!definition) return false;
    if (definition.source !== "frames") return true;
    return Number(this.availableActions[definition.assets]) > 0;
  }

  play(motion, context = {}) {
    this.motion = motion;
    this.sample = { ...sampleGlamMotion(motion, context.elapsedMs || 0, this.availableActions[motion.assets] || 0), facing: context.facing || "right" };
  }

  update(context = {}, deltaMs = 0) {
    if (!this.motion) return;
    const next = sampleGlamMotion(this.motion, context.elapsedMs || 0, this.availableActions[this.motion.assets] || 0);
    if (/^walk_|legacy_walk/.test(this.motion.id) && next.frame) {
      next.poseAlpha = Math.min(
        1,
        (Number(context.totalElapsedMs) || 0) / Math.max(1, this.motion.blendInMs || 180),
      );
    }
    stepSecondaryMotion(this.secondary, { hairLag: next.pose.hairLag, clothLag: next.pose.clothLag }, deltaMs, { stiffness: 64, damping: 12 });
    next.pose = { ...next.pose, hairLag: this.secondary.hairLag.value, clothLag: this.secondary.clothLag.value };
    this.sample = { ...next, facing: context.facing || "right" };
  }

  stop(_motion, reason) {
    this.motion = null;
    this.sample = { motionId: null, actionKind: null, elapsed: 0, pose: zeroPose(), poseAlpha: 0, frame: null, facing: this.sample.facing };
  }

  getSample() {
    return this.sample;
  }

  destroy() {
    this.stop(null, "destroyed");
  }
}
