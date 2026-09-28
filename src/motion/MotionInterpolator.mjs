const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export function applyEasing(name, value) {
  const t = clamp01(value);
  if (name === "easeIn") return t * t;
  if (name === "easeOut") return 1 - (1 - t) * (1 - t);
  if (name === "easeInOut") {
    return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
  }
  if (name === "smoothstep") return t * t * (3 - 2 * t);
  return t;
}

export function interpolateValue(from, to, amount) {
  const t = clamp01(amount);
  if (Number.isFinite(from) && Number.isFinite(to)) return from + (to - from) * t;
  if (Array.isArray(from) && Array.isArray(to)) {
    const length = Math.max(from.length, to.length);
    return Array.from({ length }, (_, index) => interpolateValue(from[index], to[index], t));
  }
  if (from && to && typeof from === "object" && typeof to === "object") {
    const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
    return Object.fromEntries([...keys].map((key) => [
      key,
      interpolateValue(from[key] ?? to[key], to[key] ?? from[key], t),
    ]));
  }
  return t < 0.5 ? from : to;
}

export function sampleKeyframes(frames, elapsedMs, options = {}) {
  if (!Array.isArray(frames) || frames.length === 0) return {};
  if (frames.length === 1) return structuredClone(frames[0].value ?? frames[0].pose ?? {});
  const durationMs = Math.max(1, Number(options.durationMs) || 1);
  const raw = (Number(elapsedMs) || 0) / durationMs;
  const time = options.loop === false ? clamp01(raw) : ((raw % 1) + 1) % 1;
  const ordered = [...frames].sort((a, b) => a.time - b.time);
  let from = ordered[0];
  let to = ordered[1];
  let localTime = time;
  for (let index = 0; index < ordered.length; index++) {
    const candidate = ordered[index];
    const next = ordered[index + 1];
    if (next && time >= candidate.time && time <= next.time) {
      from = candidate;
      to = next;
      break;
    }
    if (!next && (time >= candidate.time || time < ordered[0].time)) {
      from = candidate;
      to = { ...ordered[0], time: ordered[0].time + 1 };
      if (localTime < candidate.time) localTime += 1;
    }
  }
  const span = Math.max(Number.EPSILON, to.time - from.time);
  const eased = applyEasing(from.easing || options.easing || "linear", (localTime - from.time) / span);
  return interpolateValue(from.value ?? from.pose ?? {}, to.value ?? to.pose ?? {}, eased);
}
