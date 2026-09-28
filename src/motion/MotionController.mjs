import { LEGACY_MOTION_ALIASES, MOTION_STATES } from "./constants.mjs";
import { resolveMotionId } from "./MotionFallback.mjs";
import { MotionStateMachine } from "./MotionStateMachine.mjs";

function nextSafeExitMs(motion, requestedMs) {
  const requested = Math.max(0, Number(requestedMs) || 0);
  if (!motion.loop || !Array.isArray(motion.safeExitEvents) || !motion.safeExitEvents.length) return requested;
  const durationMs = Math.max(1, Number(motion.durationMs) || 1);
  const safeEvents = new Set(motion.safeExitEvents);
  const times = (motion.events || [])
    .filter(({ event }) => safeEvents.has(event))
    .map(({ timeMs }) => Math.min(durationMs, Math.max(0, Number(timeMs) || 0)));
  if (!times.length) return requested;
  let next = Infinity;
  for (const timeMs of times) {
    let occurrence = Math.floor((requested - timeMs) / durationMs) * durationMs + timeMs;
    if (occurrence < requested - 1e-9) occurrence += durationMs;
    if (occurrence < next) next = occurrence;
  }
  return Number.isFinite(next) ? next : requested;
}

export class MotionController {
  constructor({ motions = {}, adapter = {}, fallbacks, aliases = LEGACY_MOTION_ALIASES, onEvent } = {}) {
    this.motions = motions;
    this.adapter = adapter;
    this.fallbacks = fallbacks;
    this.aliases = aliases;
    this.machine = new MotionStateMachine();
    this.current = null;
    this.queue = [];
    this.facing = "right";
    this.speed = 1;
    this.destroyed = false;
    this.onEvent = typeof onEvent === "function" ? onEvent : null;
  }

  availableMotions() {
    return new Set(Object.keys(this.motions).filter((id) => this.adapter.canPlay?.(id, this.motions[id]) !== false));
  }

  resolve(requestedId) {
    const canonical = this.aliases[requestedId] || requestedId;
    return resolveMotionId(canonical, this.availableMotions(), this.fallbacks);
  }

  canPlayMotion(id) {
    return Boolean(this.resolve(id));
  }

  playMotion(requestedId, options = {}) {
    const canonical = this.aliases[requestedId] || requestedId;
    if (this.destroyed) return { accepted: false, reason: "destroyed", motionId: canonical };
    const motionId = this.resolve(canonical);
    if (!motionId) return { accepted: false, reason: "missing", motionId: canonical };
    const motion = this.motions[motionId];
    if (options.direction) this.setFacing(options.direction);
    const priority = Number.isFinite(options.priority) ? options.priority : (motion.priority ?? 0);
    if (this.current && priority < this.current.priority) {
      return { accepted: false, reason: "priority", motionId: canonical };
    }
    if (this.current) this.adapter.stop?.(this.current.motion, "interrupted", this.getMotionState());
    this.start(motion, canonical, { ...options, priority });
    return { accepted: true, motionId, requestedId: canonical };
  }

  start(motion, requestedId, options = {}) {
    const priority = Number.isFinite(options.priority) ? options.priority : (motion.priority ?? 0);
    const repeat = Number.isFinite(options.repeat) ? Math.max(1, Math.floor(options.repeat)) : null;
    const requestedLimit = Number.isFinite(options.durationMs)
      ? Math.max(0, options.durationMs)
      : repeat
        ? motion.durationMs * repeat
        : motion.loop
          ? Infinity
          : motion.durationMs;
    const limit = Number.isFinite(requestedLimit) ? nextSafeExitMs(motion, requestedLimit) : requestedLimit;
    this.current = {
      motion,
      requestedId,
      elapsedMs: 0,
      totalElapsedMs: 0,
      durationLimitMs: limit,
      requestedDurationMs: requestedLimit,
      safeExitAtMs: limit > requestedLimit ? limit : null,
      priority,
      options,
    };
    this.machine.enterMotion(motion);
    this.adapter.play?.(motion, this.getMotionState());
    for (const event of motion.events || []) {
      if ((Number(event.timeMs) || 0) <= 0) this.emitMotionEvent(motion, event, 0);
    }
  }

  queueMotion(requestedId, options = {}) {
    const canonical = this.aliases[requestedId] || requestedId;
    const motionId = this.resolve(canonical);
    if (this.destroyed) return { accepted: false, reason: "destroyed", motionId: canonical };
    if (!motionId) return { accepted: false, reason: "missing", motionId: canonical };
    this.queue.push({ requestedId: canonical, options });
    return { accepted: true, motionId, requestedId: canonical };
  }

  update(deltaMs = 0) {
    if (this.destroyed || !this.current) return this.getMotionState();
    const dt = Math.max(0, Number(deltaMs) || 0) * this.speed;
    const entry = this.current;
    const previousTotalMs = entry.totalElapsedMs;
    entry.elapsedMs += dt;
    entry.totalElapsedMs += dt;
    if (entry.motion.loop && entry.motion.durationMs > 0) entry.elapsedMs %= entry.motion.durationMs;
    this.adapter.update?.(this.getMotionState(), dt);
    this.emitCrossedEvents(entry, previousTotalMs, Math.min(entry.totalElapsedMs, entry.durationLimitMs));
    if (entry.totalElapsedMs >= entry.durationLimitMs) this.complete("complete");
    return this.getMotionState();
  }

  emitCrossedEvents(entry, fromMs, toMs) {
    if (!this.onEvent || toMs <= fromMs || !Array.isArray(entry.motion.events)) return;
    const durationMs = Math.max(1, Number(entry.motion.durationMs) || 1);
    const occurrences = [];
    for (const event of entry.motion.events) {
      const timeMs = Math.min(durationMs, Math.max(0, Number(event.timeMs) || 0));
      if (entry.motion.loop) {
        const firstCycle = Math.max(0, Math.floor((fromMs - timeMs) / durationMs) + 1);
        const lastCycle = Math.floor((toMs - timeMs) / durationMs);
        for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
          const occurrenceMs = cycle * durationMs + timeMs;
          if (occurrenceMs > fromMs && occurrenceMs <= toMs) occurrences.push({ event, occurrenceMs });
        }
      } else if (timeMs > fromMs && timeMs <= toMs) {
        occurrences.push({ event, occurrenceMs: timeMs });
      }
    }
    occurrences.sort((a, b) => a.occurrenceMs - b.occurrenceMs);
    for (const occurrence of occurrences) this.emitMotionEvent(entry.motion, occurrence.event, occurrence.occurrenceMs);
  }

  emitMotionEvent(motion, event, occurrenceMs) {
    try {
      this.onEvent?.({
        motionId: motion.id,
        event: event.event,
        timeMs: Number(event.timeMs) || 0,
        occurrenceMs,
        detail: event.detail,
      });
    } catch (error) {
      console.warn("Motion event handler failed", error);
    }
  }

  complete(reason) {
    if (!this.current) return;
    const finished = this.current;
    this.adapter.stop?.(finished.motion, reason, this.getMotionState());
    this.current = null;
    const queued = this.queue.shift();
    if (queued) {
      this.playMotion(queued.requestedId, queued.options);
      return;
    }
    if (finished.motion.next) {
      this.playMotion(finished.motion.next, { priority: finished.priority });
      return;
    }
    this.machine.reset();
  }

  stopMotion(id) {
    if (!this.current) return false;
    const canonical = this.aliases[id] || id;
    if (this.current.motion.id !== canonical && this.current.requestedId !== canonical) return false;
    this.complete("stopped");
    return true;
  }

  stopAllMotions() {
    this.queue.length = 0;
    if (this.current) {
      this.adapter.stop?.(this.current.motion, "stopped", this.getMotionState());
      this.current = null;
    }
    this.machine.reset();
  }

  setFacing(direction) {
    if (direction === "left" || direction === "right") this.facing = direction;
    return this.facing;
  }

  setLocomotionSpeed(speed) {
    if (Number.isFinite(speed) && speed > 0) this.speed = Math.min(3, Math.max(0.1, speed));
    return this.speed;
  }

  getMotionState() {
    const duration = this.current?.motion.durationMs || 1;
    return Object.freeze({
      state: this.machine.state,
      motionId: this.current?.motion.id || null,
      requestedId: this.current?.requestedId || null,
      elapsedMs: this.current?.elapsedMs || 0,
      totalElapsedMs: this.current?.totalElapsedMs || 0,
      progress: this.current ? Math.min(1, this.current.elapsedMs / duration) : 0,
      priority: this.current?.priority ?? 0,
      durationLimitMs: this.current?.durationLimitMs ?? 0,
      remainingMs: this.current && Number.isFinite(this.current.durationLimitMs)
        ? Math.max(0, this.current.durationLimitMs - this.current.totalElapsedMs)
        : Infinity,
      safeExitPending: Boolean(this.current?.safeExitAtMs && this.current.totalElapsedMs < this.current.safeExitAtMs),
      facing: this.facing,
      speed: this.speed,
      queue: this.queue.map((entry) => entry.requestedId),
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.stopAllMotions();
    this.destroyed = true;
    this.onEvent = null;
    this.adapter.destroy?.();
  }
}
