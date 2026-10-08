import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../src/sentence-speech.mjs').catch(() => ({}));
function fixture(options = {}) {
  assert.equal(typeof module.createSentenceSpeechQueue, 'function');
  const calls = [];
  let stopped = 0, started = 0, ended = 0;
  const errors = [];
  const queue = module.createSentenceSpeechQueue({
    speak(text, onEnd, onStart, args) { calls.push({ text, onEnd, onStart, args }); return Promise.resolve(); },
    stop() { stopped++; }, onStart() { started++; }, onEnd() { ended++; }, onError(error) { errors.push(error); },
    voiceProfileId: 'saved-voice', ...options,
  });
  return { queue, calls, errors, state: () => ({ stopped, started, ended }) };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('first sentence speaks before generation finishes and later sentences never overlap', async () => {
  const { queue, calls, state } = fixture();
  queue.push('今天'); assert.equal(calls.length, 0);
  queue.push('辛苦了。下一句还');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, '今天辛苦了。');
  assert.deepEqual(calls[0].args, { voiceProfileId: 'saved-voice' });
  calls[0].onStart(); assert.equal(state().started, 1);
  queue.push('没讲完！'); queue.finish();
  await tick(); assert.equal(calls.length, 1, 'resolved speak promise is not playback completion');
  calls[0].onEnd(); await tick();
  assert.equal(calls.length, 2); assert.equal(calls[1].text, '下一句还没讲完！');
  calls[1].onStart(); calls[1].onEnd(); await queue.finished;
  assert.equal(state().started, 1); assert.equal(state().ended, 1);
});
test('finish flushes unpunctuated tail without splitting decimal dots', async () => {
  const { queue, calls } = fixture();
  queue.push('价格是3.'); queue.push('14元，先记着');
  assert.equal(calls.length, 0);
  queue.finish(); assert.equal(calls[0].text, '价格是3.14元，先记着');
  calls[0].onEnd(); await queue.finished;
});
test('cancel stops active playback and stale callbacks never launch queued sentences', async () => {
  const { queue, calls, state } = fixture();
  queue.push('第一句。第二句。');
  queue.cancel(); queue.push('不该朗读。'); queue.finish();
  calls[0].onStart(); calls[0].onEnd();
  await queue.finished; await tick();
  assert.equal(calls.length, 1); assert.deepEqual(state(), { stopped: 1, started: 0, ended: 0 });
});
test('playback failure stops the queue and reports one error', async () => {
  const { queue, calls, errors, state } = fixture();
  queue.push('第一句。第二句。'); queue.finish();
  calls[0].onEnd(Error('合成失败')); await queue.finished; await tick();
  assert.equal(errors.length, 1); assert.equal(errors[0].message, '合成失败');
  assert.equal(calls.length, 1); assert.equal(state().ended, 0);
});
test('long unpunctuated input splits at a bounded length and excessive queued input stops', async () => {
  const { queue, calls, errors } = fixture();
  queue.push('字'.repeat(200));
  assert.equal(calls.length, 1); assert.ok(calls[0].text.length <= 96);
  queue.push('字'.repeat(4001)); await queue.finished;
  assert.equal(errors.length, 1); assert.match(errors[0].message, /过长|长度|上限/);
});

test('too many short sentences cannot create an unbounded pending queue', async () => {
  const { queue, calls, errors } = fixture();
  queue.push('好。'.repeat(80));
  await queue.finished;
  assert.equal(calls.length, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /队列上限/);
});

test('a rejected speak promise reports failure without waiting for its callback', async () => {
  const { queue, errors } = fixture({ speak: async () => { throw Error('声音不可用'); } });
  queue.push('你好。');
  await queue.finished;
  assert.equal(errors[0].message, '声音不可用');
});
test('character sentence playback retains its original look binding', async () => {
  const { queue, calls } = fixture({ lookId: 'ruby-velvet' });
  queue.push('第一句话。'); queue.finish();
  assert.deepEqual(calls[0].args, { voiceProfileId: 'saved-voice', lookId: 'ruby-velvet' });
  calls[0].onEnd(); await queue.finished;
});
