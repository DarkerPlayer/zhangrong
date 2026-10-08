const aborted = () => new DOMException("Action loading cancelled", "AbortError");

/** One decoded action group per character, retained briefly between uses. */
export function createGlamActionResources({
  actions = {}, loadFrame, releaseFrame, borrowFrame = () => null,
  onRelease = () => {}, idleMs = 30000,
}) {
  let current = null;
  let disposed = false;

  function release(record) {
    if (!record || record.released) return;
    record.released = true;
    if (current === record) current = null;
    clearTimeout(record.timer);
    record.controller.abort();
    // Detach sampler references before destroying any GPU texture.
    onRelease(record.kind);
    for (const frame of new Set(record.frames)) if (record.owned.has(frame)) releaseFrame(frame);
    record.owned.clear();
    record.frames.length = 0;
  }

  function scheduleRelease(record) {
    if (!record.ready || record.active || record.timer || record.released) return;
    record.timer = setTimeout(() => release(record), idleMs);
    record.timer.unref?.();
  }

  return {
    get(kind) {
      return current?.ready && current.kind === kind ? current.frames : null;
    },
    load(kind) {
      if (disposed) return Promise.reject(aborted());
      if (current?.kind === kind) return current.promise;
      release(current);
      const sources = actions[kind];
      if (!Array.isArray(sources) || !sources.length) return Promise.resolve([]);
      const record = { kind, frames: [], owned: new Set(), controller: new AbortController(), ready: false, active: false };
      current = record;
      // Prepare/recover often use the same resting portrait. Keep sequence
      // indices intact without decoding duplicate pixels or owning its texture.
      const unique = new Map();
      sources.forEach((source, index) => {
        const key = source?.src ?? source;
        if (!unique.has(key)) unique.set(key, { source, indices: [] });
        unique.get(key).indices.push(index);
      });
      const tasks = [...unique.values()];
      let cursor = 0;
      const worker = async () => {
        while (cursor < tasks.length) {
          if (record.controller.signal.aborted) throw aborted();
          const { source, indices } = tasks[cursor++];
          const borrowed = borrowFrame(source);
          const frame = borrowed || await loadFrame(source, record.controller.signal);
          if (disposed || current !== record || record.controller.signal.aborted) {
            if (!borrowed) releaseFrame(frame);
            throw aborted();
          }
          if (!borrowed) record.owned.add(frame);
          for (const index of indices) record.frames[index] = frame;
        }
      };
      // Bound fetch/decode concurrency instead of decoding every pose together.
      record.promise = Promise.all(Array.from({ length: Math.min(2, tasks.length) }, worker))
        .then(() => {
          if (disposed || current !== record) throw aborted();
          record.ready = true;
          scheduleRelease(record);
          return record.frames;
        })
        .catch((error) => { release(record); throw error; });
      return record.promise;
    },
    cancelPending() {
      if (current && !current.ready) release(current);
    },
    clear() { release(current); },
    setActive(kind) {
      if (!current) return;
      current.active = current.kind === kind;
      if (current.active) {
        clearTimeout(current.timer);
        current.timer = null;
      } else scheduleRelease(current);
    },
    destroy() {
      disposed = true;
      release(current);
    },
  };
}
