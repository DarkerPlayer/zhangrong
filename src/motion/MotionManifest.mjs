import { MOTION_PRIORITIES } from "./constants.mjs";

export const P0_MOTION_IDS = Object.freeze([
  "idle_neutral",
  "idle_weight_shift",
  "idle_hair_touch",
  "walk_feminine",
  "walk_confident",
  "crouch_enter",
  "crouch_idle",
  "crouch_exit",
]);

const motion = (id, values) => Object.freeze({ id, version: 1, ...values });

export function createMotionManifest(look = {}) {
  const actions = look.actions || {};
  const motions = {
    idle_neutral: motion("idle_neutral", {
      category: "idle", source: "mesh", durationMs: 11000, loop: true,
      priority: MOTION_PRIORITIES.IDLE, blendInMs: 180, blendOutMs: 220,
    }),
    idle_weight_shift: motion("idle_weight_shift", {
      category: "idle", source: "mesh", durationMs: 4200, loop: false,
      priority: MOTION_PRIORITIES.IDLE, blendInMs: 220, blendOutMs: 260,
    }),
    idle_hair_touch: motion("idle_hair_touch", {
      category: "idle", source: "hybrid", durationMs: 3600, loop: false,
      priority: MOTION_PRIORITIES.IDLE, blendInMs: 160, blendOutMs: 240,
      events: [{ timeMs: 1800, event: "gesture_peak" }],
    }),
    wave: motion("wave", { category: "gesture", source: "mesh", durationMs: 3300, loop: false, priority: MOTION_PRIORITIES.GESTURE }),
    pat: motion("pat", { category: "interaction", source: "mesh", durationMs: 2600, loop: false, priority: MOTION_PRIORITIES.USER_INTERACTION }),
    happy: motion("happy", { category: "emote", source: "mesh", durationMs: 3000, loop: false, priority: MOTION_PRIORITIES.GESTURE }),
    shy: motion("shy", { category: "emote", source: "mesh", durationMs: 2900, loop: false, priority: MOTION_PRIORITIES.GESTURE }),
    look_back: motion("look_back", { category: "gesture", source: "mesh", durationMs: 2600, loop: false, priority: MOTION_PRIORITIES.GESTURE }),
  };
  if (Array.isArray(actions.sexyWalk) && actions.sexyWalk.length) {
    motions.walk_feminine = motion("walk_feminine", {
      category: "locomotion", source: "frames", assets: "sexyWalk",
      durationMs: 960, loop: true, priority: MOTION_PRIORITIES.LOCOMOTION,
      blendInMs: 180, blendOutMs: 220, speedPxPerSecond: 72, stridePx: 69,
      events: [{ timeMs: 1, event: "foot_left_contact" }, { timeMs: 480, event: "foot_right_contact" }],
    });
    motions.walk_confident = motion("walk_confident", {
      category: "locomotion", source: "frames", assets: "sexyWalk",
      durationMs: 1080, loop: true, priority: MOTION_PRIORITIES.LOCOMOTION,
      blendInMs: 200, blendOutMs: 240, speedPxPerSecond: 68, stridePx: 73,
      events: [{ timeMs: 1, event: "foot_left_contact" }, { timeMs: 540, event: "foot_right_contact" }],
    });
    motions.legacy_walk = motion("legacy_walk", {
      category: "locomotion", source: "frames", assets: "sexyWalk",
      durationMs: 840, loop: true, priority: MOTION_PRIORITIES.LOCOMOTION,
    });
  }
  if (Array.isArray(actions.squat) && actions.squat.length) {
    motions.crouch_enter = motion("crouch_enter", {
      category: "crouch", source: "frames", assets: "squat",
      durationMs: 720, loop: false, priority: MOTION_PRIORITIES.LOCOMOTION,
      blendInMs: 160, blendOutMs: 0, next: "crouch_idle",
      events: [{ timeMs: 720, event: "crouch_complete" }],
    });
    motions.crouch_idle = motion("crouch_idle", {
      category: "crouch", source: "frames", assets: "squat",
      durationMs: 4200, loop: true, priority: MOTION_PRIORITIES.LOCOMOTION,
      blendInMs: 0, blendOutMs: 220,
    });
    motions.crouch_exit = motion("crouch_exit", {
      category: "crouch", source: "frames", assets: "squat",
      durationMs: 760, loop: false, priority: MOTION_PRIORITIES.LOCOMOTION,
      blendInMs: 0, blendOutMs: 240, next: "idle_neutral",
      events: [{ timeMs: 760, event: "stand_complete" }],
    });
    motions.legacy_crouch = motion("legacy_crouch", {
      category: "crouch", source: "frames", assets: "squat",
      durationMs: 3700, loop: false, priority: MOTION_PRIORITIES.LOCOMOTION,
    });
  }
  return Object.freeze({
    version: 2,
    character: look.character || look.id || "original",
    lookId: look.id || null,
    motions: Object.freeze(motions),
  });
}
