import { CUTE_FRAME_ACTIONS } from "./cute-actions.mjs";
// Shared discovery labels; each outfit opts in with its own authored frames.
export const AUTHORED_ACTIONS = Object.freeze([
  { kind: "drink_tea", label: "举杯品茶", asset: "tea" },
  { kind: "read_scroll", label: "展开读卷", asset: "scroll" },
  { kind: "play_guzheng", label: "抚琴拨弦", asset: "guzheng", fullBody: true },
  { kind: "bow_salute", label: "拱手行礼", asset: "salute" },
  { kind: "cast_talisman", label: "双指御符", asset: "talisman" },
  { kind: "meditate", label: "闭目打坐", asset: "meditate", fullBody: true },
  { kind: "turn_glance", label: "侧身回眸", asset: "turn" },
  { kind: "hover_flight", label: "御空展袖", asset: "flight", fullBody: true },
  { kind: "sleeve_spell", label: "拂袖施法", asset: "spell" },
].map(item => Object.freeze(item)));

export const supportedAuthoredActions = (look) => [...AUTHORED_ACTIONS, ...CUTE_FRAME_ACTIONS].filter(
  ({ kind }) => Array.isArray(look?.actions?.[kind]) && look.actions[kind].length > 0,
);
