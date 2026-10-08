/** Speak complete sentences in order while the rest of a reply is arriving. */
export function createSentenceSpeechQueue({
  speak, stop = () => {}, onStart = () => {}, onEnd = () => {}, onError = () => {}, voiceProfileId, lookId,
}) {
  const queue = [];
  let pending = '', characters = 0, running = false, closed = false, complete = false, started = false, releaseActive, resolve;
  const finished = new Promise(done => { resolve = done; });
  function cancel() {
    if (closed) return;
    closed = true;
    queue.length = 0; pending = '';
    releaseActive?.(); releaseActive = undefined;
    try { stop(); } finally { resolve(); }
  }
  function fail(error) {
    if (closed) return;
    cancel();
    onError(error instanceof Error ? error : new Error(String(error)));
  }
  function settle() {
    if (closed || !complete || running || queue.length) return;
    closed = true;
    try { onEnd(); } finally { resolve(); }
  }
  async function pump() {
    if (closed || running) return;
    if (!queue.length) { settle(); return; }
    running = true;
    const text = queue.shift();
    try {
      await new Promise((done, reject) => {
        releaseActive = done;
        const end = error => {
          if (closed) return;
          error ? reject(error) : done();
        };
        const start = () => {
          if (!closed && !started) { started = true; onStart(); }
        };
        // speak() may resolve when an Audio element starts. Only its callback
        // proves playback ended; a rejected promise still fails the queue.
        Promise.resolve(speak(text, end, start, { voiceProfileId, ...(lookId ? { lookId } : {}) })).catch(reject);
      });
    } catch (error) { fail(error); }
    finally { running = false; releaseActive = undefined; }
    if (!closed) void pump();
  }
  function enqueue(text) {
    text = text.trim();
    if (!text || /^[”’」』）》\])]+$/u.test(text)) return;
    if (queue.length >= 64) { fail(new Error('待朗读内容超过队列上限。')); return; }
    queue.push(text);
    void pump();
  }
  function split(final = false) {
    while (pending && !closed) {
      // Keep decimal dots and short comma clauses together. A long clause
      // prefers a comma break, with a hard cap on each TTS request.
      const punctuation = pending.search(/[。！？!?；;\n]/u);
      let end = punctuation >= 0 && punctuation < 96 ? punctuation + 1 : 0;
      if (end) while (end < pending.length && end < 96 && /[”’」』）》\])]/u.test(pending[end])) end++;
      if (!end && pending.length >= 48) {
        for (let index = Math.min(95, pending.length - 1); index >= 35; index--) {
          if (/[，,、：:]/u.test(pending[index]) && !(index && /\d/.test(pending[index - 1]) && /\d/.test(pending[index + 1] || ''))) { end = index + 1; break; }
        }
      }
      if (!end && pending.length >= 96) end = /[\uD800-\uDBFF]/u.test(pending[95]) ? 95 : 96;
      if (!end && final) end = pending.length;
      if (!end) break;
      const sentence = pending.slice(0, end);
      pending = pending.slice(end).trimStart();
      enqueue(sentence);
    }
  }
  return {
    finished,
    push(delta) {
      if (closed || complete) return false;
      if (typeof delta !== 'string') { fail(new Error('朗读内容格式无效。')); return false; }
      characters += delta.length;
      if (characters > 4000) { fail(new Error('朗读内容长度超过上限。')); return false; }
      pending += delta;
      split();
      return !closed;
    },
    finish() {
      if (!closed && !complete) { complete = true; split(true); settle(); }
      return finished;
    },
    cancel,
  };
}
