import { MOTION_STATES } from "./constants.mjs";

export class MotionStateMachine {
  state = MOTION_STATES.IDLE;

  enterMotion(motion = {}) {
    const id = String(motion.id || "");
    if (id === "crouch_enter") this.state = MOTION_STATES.CROUCH_ENTER;
    else if (id === "crouch_idle") this.state = MOTION_STATES.CROUCH_IDLE;
    else if (id === "crouch_exit") this.state = MOTION_STATES.CROUCH_EXIT;
    else if (motion.category === "locomotion" || /^walk_/.test(id) || id === "legacy_walk") this.state = MOTION_STATES.MOVE;
    else if (motion.category === "turn" || /^turn_/.test(id)) this.state = MOTION_STATES.TURN;
    else if (motion.category === "pose") this.state = MOTION_STATES.POSE;
    else if (motion.category === "interaction" || motion.category === "gesture") this.state = MOTION_STATES.INTERACT;
    else if (motion.category === "emote") this.state = MOTION_STATES.EMOTE;
    else if (motion.category === "speak") this.state = MOTION_STATES.SPEAK;
    else this.state = MOTION_STATES.IDLE;
    return this.state;
  }

  reset() {
    this.state = MOTION_STATES.IDLE;
  }
}
