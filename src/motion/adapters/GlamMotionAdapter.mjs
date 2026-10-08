import { sampleCutePose } from "../cute-poses.mjs";
import { applyEasing, sampleKeyframes } from "../MotionInterpolator.mjs";
import { createSecondaryMotion, stepSecondaryMotion } from "../secondary-motion.mjs";

const zeroPose = () => ({
  hipX: 0, hipY: 0, hipRoll: 0, chestRoll: 0, shoulderRoll: 0,
  headAngle: 0, bodyX: 0, bodyY: 0, rootX: 0, breath: 0,
  hairLag: 0, clothLag: 0, armAngle: 0,
  crouchAmount: 0,
  crouchLayers: { head: 0, chest: 0, hip: 0, hair: 0, cloth: 0 },
});

const CROUCH_TIMELINE = Object.freeze([
  { time: 0, easing: "smoothstep", value: { amount: 0 } },
  { time: 0.10, easing: "smoothstep", value: { amount: -0.02 } },
  { time: 0.25, easing: "smoothstep", value: { amount: 0.18 } },
  { time: 0.50, easing: "smoothstep", value: { amount: 0.68 } },
  { time: 0.76, easing: "smoothstep", value: { amount: 0.96 } },
  { time: 0.88, easing: "smoothstep", value: { amount: 1.03 } },
  { time: 1, easing: "smoothstep", value: { amount: 1 } },
]);

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
const rounded = (value) => Math.round(value * 1e6) / 1e6;

export function frameAnchorOffset(anchor, reference = [0.5, 0.982], facing = "right") {
  const point = Array.isArray(anchor) ? anchor : reference;
  const x = Math.max(-0.03, Math.min(0.03, (Number(reference[0]) || 0.5) - (Number(point[0]) || 0.5)));
  const y = Math.max(-0.02, Math.min(0.02, (Number(reference[1]) || 0.982) - (Number(point[1]) || 0.982)));
  return { x: rounded(facing === "left" ? -x : x), y: rounded(y) };
}

export function resolveLocomotionSpeed(motion = {}) {
  const durationMs = Number(motion.durationMs);
  const stridePx = Number(motion.stridePx);
  if (durationMs > 0 && stridePx >= 0) return stridePx * 1000 / durationMs;
  return Math.max(0, Number(motion.speedPxPerSecond) || 0);
}

export function locomotionEnvelope(state = {}, motion = {}) {
  const accelerationMs = Math.max(1, Number(motion.accelerationMs) || 1);
  const decelerationMs = Math.max(1, Number(motion.decelerationMs) || 1);
  const accelerate = applyEasing("smoothstep", Math.max(0, Number(state.totalElapsedMs) || 0) / accelerationMs);
  const remainingMs = Number(state.remainingMs);
  const decelerate = Number.isFinite(remainingMs)
    ? applyEasing("smoothstep", Math.max(0, remainingMs) / decelerationMs)
    : 1;
  return Math.min(accelerate, decelerate);
}

const crouchTimelineAmount = (elapsedMs, durationMs) => rounded(sampleKeyframes(
  CROUCH_TIMELINE,
  Math.max(0, Math.min(durationMs, Number(elapsedMs) || 0)),
  { durationMs, loop: false },
).amount);

function crouchLayerAmount(id, elapsedMs, durationMs, delayMs) {
  if (id === "crouch_idle") return 1;
  const localDuration = Math.max(1, durationMs - delayMs);
  const localElapsed = Math.max(0, Math.min(localDuration, (Number(elapsedMs) || 0) - delayMs));
  return id === "crouch_exit"
    ? crouchTimelineAmount(localDuration - localElapsed, localDuration)
    : crouchTimelineAmount(localElapsed, localDuration);
}

function debugFrameElapsed(frames, index) {
  if (!Array.isArray(frames) || !frames.length || !Number.isInteger(index)) return null;
  const normalized = ((index % frames.length) + frames.length) % frames.length;
  return frames.slice(0, normalized).reduce((total, frame) => total + Math.max(1, Number(frame.durationMs) || 1), 0);
}

/**
 * Blend the resting portrait and two authored poses in one shader pass.
 * The weights always add to one, avoiding the 25% opacity dip produced by
 * stacking two independently faded sprites with source-over compositing.
 */
export function frameCompositeWeights(frameBlend = 0, poseAlpha = 1) {
  const blend = clamp01(frameBlend);
  const action = clamp01(poseAlpha);
  return {
    base: 1 - action,
    current: action * (1 - blend),
    next: action * blend,
  };
}

export function resolveActionPoseAlpha(visibleAction = {}, motionState = {}, hasFrames = false) {
  if (!hasFrames) return 0;
  const alpha = clamp01(visibleAction.poseAlpha);
  const motionId = motionState.motionId || visibleAction.motionId || "";
  // Crouch enter/idle/exit form one continuous authored transition. Applying
  // the generic finite-motion fade here would briefly return to the standing
  // portrait between enter and hold, then snap back to the crouched artwork.
  if (/^crouch_/.test(motionId)) return alpha;
  const fadeOut = Number.isFinite(motionState.remainingMs)
    ? Math.min(1, Math.max(0, motionState.remainingMs) / 240)
    : 1;
  return alpha * fadeOut;
}

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

export function sampleFrameSequence(frames, elapsedMs, { loop = true, blendWindowMs = 80 } = {}) {
  const profile = Array.isArray(frames) && frames.length
    ? frames
    : [{ durationMs: 1, phase: "pose_1", groundAnchor: [0.5, 0.982], contact: null }];
  const duration = profile.reduce((total, frame) => total + Math.max(1, Number(frame.durationMs) || 1), 0);
  let cycleTime = loop
    ? (((Number(elapsedMs) || 0) % duration) + duration) % duration
    : Math.max(0, Math.min(duration, Number(elapsedMs) || 0));
  let index = 0;
  for (; index < profile.length - 1; index++) {
    const frameDuration = Math.max(1, Number(profile[index].durationMs) || 1);
    if (cycleTime < frameDuration) break;
    cycleTime -= frameDuration;
  }
  const frame = profile[index];
  const nextIndex = loop ? (index + 1) % profile.length : Math.min(index + 1, profile.length - 1);
  const nextFrame = profile[nextIndex];
  // Keep most of each authored pose fully readable, then ease through a brief
  // overlap at the cut. This removes the bright one-frame "flash" of a hard
  // texture swap without leaving doubled limbs visible through the whole pose.
  const transitionMs = Math.min(loop ? Infinity : blendWindowMs, Math.max(1, Math.max(1, Number(frame.durationMs) || 1) * 0.42));
  const blend = nextIndex === index ? 0 : applyEasing(
    "smoothstep",
    clamp01((cycleTime - (Math.max(1, Number(frame.durationMs) || 1) - transitionMs)) / transitionMs),
  );
  const currentAnchor = Array.isArray(frame.groundAnchor) ? frame.groundAnchor : [0.5, 0.982];
  const nextAnchor = Array.isArray(nextFrame?.groundAnchor) ? nextFrame.groundAnchor : currentAnchor;
  return {
    index,
    nextIndex,
    blend,
    frameElapsedMs: cycleTime,
    frameDurationMs: Math.max(1, Number(frame.durationMs) || 1),
    phase: frame.phase || `pose_${index + 1}`,
    contact: frame.contact || null,
    groundAnchor: currentAnchor.map((value, axis) => rounded(
      Number(value) + (Number(nextAnchor[axis]) - Number(value)) * blend,
    )),
  };
}

export function sampleGlamMotion(motion = {}, elapsedMs = 0, frameCount = 0) {
  const id = motion.id || "idle_neutral";
  const durationMs = Math.max(1, Number(motion.durationMs) || 1);
  const seconds = Math.max(0, Number(elapsedMs) || 0) / 1000;
  let pose = zeroPose();
  let poseAlpha = 0;
  let frame = null;
  let actionKind = id;
  if (motion.cute) {
    pose={...pose,...sampleCutePose(id,elapsedMs,durationMs)};
  } else if (id === "spit" || motion.authored) {
    frame = frameCount > 0 ? sampleFrameSequence(motion.frames, elapsedMs, { loop: false, blendWindowMs: motion.authored ? 220 : 80 }) : null;
    poseAlpha = frame ? Math.min(1, elapsedMs / Math.max(1, motion.blendInMs || 120)) : 0;
    if (motion.authored) poseAlpha *= Math.min(1, Math.max(0, durationMs - elapsedMs) / Math.max(1, motion.blendOutMs || 260));
  } else if (/^walk_|legacy_walk/.test(id)) {
    pose = sampleKeyframes(WALK_FEMININE, elapsedMs, { durationMs, loop: true });
    if (id === "walk_confident") {
      pose = { ...pose, hipX: pose.hipX * 0.86, hipRoll: pose.hipRoll * 0.88, shoulderRoll: pose.shoulderRoll * 0.9, bodyY: pose.bodyY * 0.65 };
    }
    frame = sampleFrameSequence(motion.frames, elapsedMs);
    poseAlpha = frameCount > 0 ? Math.min(1, elapsedMs / Math.max(1, motion.blendInMs || 180)) : 0;
    actionKind = "sexyWalk";
  } else if (/^crouch_|legacy_crouch/.test(id)) {
    const progress = clamp01(elapsedMs / durationMs);
    if (id === "legacy_crouch") {
      const enter = applyEasing("easeInOut", Math.min(1, progress / 0.22));
      const exit = 1 - applyEasing("easeInOut", Math.max(0, (progress - 0.78) / 0.22));
      poseAlpha = Math.min(enter, exit);
      pose = { ...zeroPose(), crouchAmount: poseAlpha, bodyY: poseAlpha * 0.006, hipY: poseAlpha * 0.008 };
    } else {
      const crouchAmount = id === "crouch_idle"
        ? 1
        : id === "crouch_exit"
          ? crouchTimelineAmount(durationMs - Math.min(durationMs, elapsedMs), durationMs)
          : crouchTimelineAmount(elapsedMs, durationMs);
      const layers = {
        head: crouchLayerAmount(id, elapsedMs, durationMs, 30),
        chest: crouchLayerAmount(id, elapsedMs, durationMs, 50),
        hip: crouchLayerAmount(id, elapsedMs, durationMs, 70),
        hair: crouchLayerAmount(id, elapsedMs, durationMs, 140),
        cloth: crouchLayerAmount(id, elapsedMs, durationMs, 160),
      };
      const hairIdle = id === "crouch_idle" ? Math.sin(seconds * 1.05) * 0.0018 : 0;
      const clothIdle = id === "crouch_idle" ? Math.sin(seconds * 0.9 + 0.5) * 0.0014 : 0;
      poseAlpha = clamp01(crouchAmount);
      pose = {
        ...zeroPose(),
        crouchAmount,
        crouchLayers: layers,
        bodyY: crouchAmount * 0.006,
        hipY: layers.hip * 0.010,
        hipRoll: layers.hip * 0.006,
        chestRoll: layers.chest * -0.010,
        headNod: layers.head * 0.0015,
        breath: Math.sin(seconds * 1.6) * 0.16,
        hairLag: (layers.head - layers.hair) * 0.010 + hairIdle,
        clothLag: (layers.hip - layers.cloth) * 0.009 + clothIdle,
      };
    }
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
  return { motionId: id, actionKind, elapsed: Math.max(0, Number(elapsedMs) || 0), pose, poseAlpha, frame,
    preserveExpression: motion.preserveExpression === true, fullBody: motion.fullBody === true };
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
    const facing = context.facing || "right";
    const debugElapsed = debugFrameElapsed(motion.frames, context.debugFrameIndex);
    const next = sampleGlamMotion(motion, debugElapsed ?? context.elapsedMs ?? 0, this.availableActions[motion.assets] || 0);
    if (debugElapsed !== null && next.frame) next.poseAlpha = 1;
    if (next.frame) next.frame = { ...next.frame, anchorOffset: frameAnchorOffset(next.frame.groundAnchor, motion.groundAnchor, facing) };
    this.sample = { ...next, facing };
  }

  update(context = {}, deltaMs = 0) {
    if (!this.motion) return;
    const debugElapsed = debugFrameElapsed(this.motion.frames, context.debugFrameIndex);
    const next = sampleGlamMotion(this.motion, debugElapsed ?? context.elapsedMs ?? 0, this.availableActions[this.motion.assets] || 0);
    if (/^walk_|legacy_walk/.test(this.motion.id) && next.frame) {
      next.poseAlpha = debugElapsed !== null
        ? 1
        : Math.min(
          1,
          (Number(context.totalElapsedMs) || 0) / Math.max(1, this.motion.blendInMs || 180),
        );
    }
    const secondaryOptions = /^crouch_/.test(this.motion.id)
      ? { stiffness: 46, damping: 9 }
      : { stiffness: 64, damping: 12 };
    stepSecondaryMotion(this.secondary, { hairLag: next.pose.hairLag, clothLag: next.pose.clothLag }, deltaMs, secondaryOptions);
    next.pose = { ...next.pose, hairLag: this.secondary.hairLag.value, clothLag: this.secondary.clothLag.value };
    const facing = context.facing || "right";
    if (next.frame) next.frame = { ...next.frame, anchorOffset: frameAnchorOffset(next.frame.groundAnchor, this.motion.groundAnchor, facing) };
    this.sample = { ...next, facing };
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
