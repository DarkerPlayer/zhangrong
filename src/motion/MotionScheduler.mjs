export class MotionScheduler {
  constructor({
    entries = [
      { id: "idle_weight_shift", weight: 22, cooldownMs: 12000 },
      { id: "idle_hair_touch", weight: 8, cooldownMs: 30000 },
      { id: "look_back", weight: 5, cooldownMs: 45000 },
    ],
    intervalMs = [6500, 13500],
    random = Math.random,
  } = {}) {
    this.entries = entries;
    this.intervalMs = intervalMs;
    this.random = random;
    this.timeMs = 0;
    this.lastPlayed = new Map();
    this.nextAtMs = this.nextDelay();
  }

  nextDelay() {
    const low = Math.max(0, Number(this.intervalMs[0]) || 0);
    const high = Math.max(low, Number(this.intervalMs[1]) || low);
    return low + (high - low) * Math.min(1, Math.max(0, Number(this.random()) || 0));
  }

  update(deltaMs, motionState = {}, canPlay = () => true) {
    this.timeMs += Math.max(0, Number(deltaMs) || 0);
    if (motionState.state !== "IDLE" || (motionState.priority ?? 0) > 1) return null;
    if (this.timeMs < this.nextAtMs) return null;
    const eligible = this.entries.filter((entry) => {
      if (!canPlay(entry.id)) return false;
      const previous = this.lastPlayed.get(entry.id);
      return previous === undefined || this.timeMs - previous >= Math.max(0, entry.cooldownMs || 0);
    });
    this.nextAtMs = this.timeMs + this.nextDelay();
    if (!eligible.length) return null;
    const total = eligible.reduce((sum, entry) => sum + Math.max(0, entry.weight || 0), 0);
    let cursor = (Number(this.random()) || 0) * total;
    const selected = eligible.find((entry) => {
      cursor -= Math.max(0, entry.weight || 0);
      return cursor <= 0;
    }) || eligible.at(-1);
    this.lastPlayed.set(selected.id, this.timeMs);
    return selected.id;
  }
}
