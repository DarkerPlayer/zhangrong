const aborted = () => new DOMException("Action loading cancelled", "AbortError");

/** One decoded action group per character, retained briefly between uses. */
export function createGlamActionResources({
  actions = {}, loadFrame, releaseFrame, onRelease = () => {}, idleMs = 30000,
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
    for (const frame of record.frames) if (frame) releaseFrame(frame);
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
      const record = { kind, frames: [], controller: new AbortController(), ready: false, active: false };
      current = record;
      let cursor = 0;
      const worker = async () => {
        while (cursor < sources.length) {
          if (record.controller.signal.aborted) throw aborted();
          const index = cursor++;
          const frame = await loadFrame(sources[index], record.controller.signal);
          if (disposed || current !== record || record.controller.signal.aborted) {
            releaseFrame(frame);
            throw aborted();
          }
          record.frames[index] = frame;
        }
      };
      // Bound fetch/decode concurrency instead of decoding every pose together.
      record.promise = Promise.all(Array.from({ length: Math.min(2, sources.length) }, worker))
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
