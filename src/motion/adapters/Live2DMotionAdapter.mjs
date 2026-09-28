import { MOTION_PRIORITIES } from "../constants.mjs";

const define = (id, values) => Object.freeze({ id, version: 1, ...values });

export const LIVE2D_MOTIONS = Object.freeze({
  idle_neutral: define("idle_neutral", { category: "idle", durationMs: 11000, loop: true, priority: MOTION_PRIORITIES.IDLE }),
  idle_weight_shift: define("idle_weight_shift", { category: "idle", durationMs: 4500, loop: false, priority: MOTION_PRIORITIES.IDLE }),
  idle_hair_touch: define("idle_hair_touch", { category: "idle", durationMs: 2800, loop: false, priority: MOTION_PRIORITIES.IDLE }),
  walk_feminine: define("walk_feminine", { category: "locomotion", durationMs: 4500, loop: false, priority: MOTION_PRIORITIES.LOCOMOTION }),
  walk_confident: define("walk_confident", { category: "locomotion", durationMs: 5900, loop: false, priority: MOTION_PRIORITIES.LOCOMOTION }),
  walk_runway: define("walk_runway", { category: "locomotion", durationMs: 5900, loop: false, priority: MOTION_PRIORITIES.LOCOMOTION }),
  crouch_enter: define("crouch_enter", { category: "crouch", durationMs: 2800, loop: false, priority: MOTION_PRIORITIES.EXPLICIT, next: "crouch_idle" }),
  crouch_idle: define("crouch_idle", { category: "crouch", durationMs: 11000, loop: true, priority: MOTION_PRIORITIES.EXPLICIT }),
  crouch_exit: define("crouch_exit", { category: "crouch", durationMs: 3600, loop: false, priority: MOTION_PRIORITIES.EXPLICIT, next: "idle_neutral" }),
  look_back: define("look_back", { category: "gesture", durationMs: 2800, loop: false, priority: MOTION_PRIORITIES.GESTURE }),
  wave: define("wave", { category: "gesture", durationMs: 4500, loop: false, priority: MOTION_PRIORITIES.GESTURE }),
  pat: define("pat", { category: "interaction", durationMs: 3600, loop: false, priority: MOTION_PRIORITIES.USER_INTERACTION }),
  happy: define("happy", { category: "emote", durationMs: 5900, loop: false, priority: MOTION_PRIORITIES.GESTURE }),
  shy: define("shy", { category: "emote", durationMs: 2800, loop: false, priority: MOTION_PRIORITIES.GESTURE }),
});

const PLANS = Object.freeze({
  idle_neutral: { group: "Idle", index: 0, priority: 1, expression: null },
  idle_weight_shift: { group: "Idle", index: 0, priority: 1, expression: null },
  idle_hair_touch: { group: "Tap", index: 1, priority: 2, expression: "f06" },
  walk_feminine: { group: "Idle", index: 1, priority: 2, expression: "f00" },
  walk_confident: { group: "Idle", index: 2, priority: 2, expression: "f04" },
  walk_runway: { group: "Idle", index: 2, priority: 3, expression: "f04" },
  crouch_enter: { group: "Tap", index: 1, priority: 3, expression: "f06" },
  crouch_idle: { group: "Idle", index: 0, priority: 1, expression: null },
  crouch_exit: { group: "Tap", index: 0, priority: 3, expression: "f04" },
  look_back: { group: "Tap", index: 1, priority: 2, expression: "f06" },
  wave: { group: "Idle", index: 1, priority: 2, expression: "f00" },
  pat: { group: "Tap", index: 0, priority: 3, expression: "f04" },
  happy: { group: "Idle", index: 2, priority: 2, expression: "f04" },
  shy: { group: "Tap", index: 1, priority: 2, expression: "f06" },
});

const countFor = (groups, group) => {
  const value = groups?.[group];
  return Array.isArray(value) ? value.length : Math.max(0, Number(value) || 0);
};

export function resolveLive2DMotion(id, groups = {}) {
  const plan = PLANS[id];
  if (plan && countFor(groups, plan.group) > plan.index) return { ...plan };
  return { group: "Idle", index: 0, priority: 1, expression: null };
}

export class Live2DMotionAdapter {
  constructor({ model, groups, setExpression, onError } = {}) {
    this.model = model;
    this.groups = groups || {};
    this.setExpression = setExpression;
    this.onError = onError;
    this.current = null;
    this.epoch = 0;
  }

  canPlay(id) {
    return Boolean(LIVE2D_MOTIONS[id]);
  }

  play(motion) {
    const plan = resolveLive2DMotion(motion.id, this.groups);
    const epoch = ++this.epoch;
    this.current = { motion, plan };
    Promise.resolve(this.model?.motion?.(plan.group, plan.index, plan.priority))
      .then(() => {
        if (epoch === this.epoch && this.current?.motion === motion) return this.setExpression?.(plan.expression);
        return undefined;
      })
      .catch((error) => {
        if (epoch === this.epoch) this.onError?.(error);
      });
  }

  update() {}

  stop() {
    this.epoch++;
    this.current = null;
  }

  destroy() {
    this.epoch++;
    this.current = null;
    this.model = null;
  }
}
