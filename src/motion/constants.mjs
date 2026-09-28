export const MOTION_STATES = Object.freeze({
  IDLE: "IDLE",
  MOVE: "MOVE",
  TURN: "TURN",
  CROUCH_ENTER: "CROUCH_ENTER",
  CROUCH_IDLE: "CROUCH_IDLE",
  CROUCH_EXIT: "CROUCH_EXIT",
  POSE: "POSE",
  INTERACT: "INTERACT",
  EMOTE: "EMOTE",
  SPEAK: "SPEAK",
});

export const MOTION_PRIORITIES = Object.freeze({
  BACKGROUND: 0,
  IDLE: 1,
  LOCOMOTION: 2,
  GESTURE: 3,
  USER_INTERACTION: 4,
  EXPLICIT: 5,
  SYSTEM: 6,
});

export const LEGACY_MOTION_ALIASES = Object.freeze({
  idle: "idle_neutral",
  sexyWalk: "walk_feminine",
  squat: "crouch_enter",
});
