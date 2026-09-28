export const DEFAULT_MOTION_FALLBACKS = Object.freeze({
  walk_confident: Object.freeze(["walk_feminine", "legacy_walk", "idle_neutral"]),
  walk_feminine: Object.freeze(["legacy_walk", "idle_neutral"]),
  walk_playful: Object.freeze(["walk_feminine", "legacy_walk", "idle_neutral"]),
  walk_runway: Object.freeze(["walk_confident", "walk_feminine", "legacy_walk", "idle_neutral"]),
  crouch_enter: Object.freeze(["legacy_crouch", "idle_neutral"]),
  crouch_idle: Object.freeze(["legacy_crouch", "idle_neutral"]),
  crouch_exit: Object.freeze(["legacy_crouch", "idle_neutral"]),
  idle_hair_touch: Object.freeze(["idle_weight_shift", "idle_neutral"]),
  idle_weight_shift: Object.freeze(["idle_neutral"]),
});

export function resolveMotionId(requestedId, available, fallbacks = DEFAULT_MOTION_FALLBACKS) {
  const playable = available instanceof Set ? available : new Set(available || []);
  const visited = new Set();
  const visit = (id) => {
    if (!id || visited.has(id)) return null;
    visited.add(id);
    if (playable.has(id)) return id;
    const next = fallbacks[id] || (id === "idle_neutral" ? [] : ["idle_neutral"]);
    for (const candidate of next) {
      const resolved = visit(candidate);
      if (resolved) return resolved;
    }
    return null;
  };
  return visit(requestedId);
}
