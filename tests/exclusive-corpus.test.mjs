import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { offlineReply, createMessages } from '../server/dialogue.mjs';
import { modelReply, modelReplyStream } from '../server/ollama.mjs';
import { setLocalLooks, getLook } from '../server/looks.mjs';
import { resolvePersonaProfile } from '../server/personas.mjs';
import { startServer } from '../server/index.mjs';
const corpus = await import('../server/exclusive-corpus.mjs').catch(() => ({}));

const line = (id, text, options = {}) => ({ id, text, characterId: 'wen-furen', speaker: '温夫人', kind: 'dialogue', verified: true,
  category: 'greeting', source: { file: 'provided-video.mp4', start: 1, end: 3 }, ...options });
const fixtureCatalog = { 'wen-furen': { characterId: 'wen-furen', entries: [
  line('greet-1', '原句一，{userName}。'), line('greet-2', '原句二。'),
  line('topic', '这里只是测试用原句。', { category: 'fallback', keywords: ['测试话题'] }),
  line('other-speaker', '不能说其他人的话。', { speaker: '另一角色' }),
  line('other-character', '不能借用另一个角色的条目。', { characterId: 'ling-yuling' }),
  line('summary', '不能把场景摘要当台词。', { kind: 'summary' }),
  line('asr', '不能说未确认的转写。', { verified: false }),
  line('missing-source', '不能说缺少来源的台词。', { source: null }),
] } };
const lookIds = { 'wen-furen': 'local-look-test-wen-corpus', 'ling-yuling': 'local-look-test-ling-corpus', 'mei-ning': 'local-look-test-mei-corpus' };
function installLooks(t) {
  setLocalLooks(Object.entries(lookIds).map(([characterId, id]) => ({ id, characterId, character: characterId, name: id, renderer: 'glam', asset: '/local-studio/assets/fixture.png', aliases: [] })));
  t.after(() => setLocalLooks([]));
}

test('exclusive corpus only selects exact verified lines by intent and preserves literal text', () => {
  assert.equal(typeof corpus.selectExclusiveCorpusReply, 'function');
  const first = corpus.selectExclusiveCorpusReply({ characterId: 'wen-furen', message: '你好', history: [] }, fixtureCatalog);
  assert.equal(first.corpusStatus, 'matched');
  assert.ok(['原句一，{userName}。', '原句二。'].includes(first.reply));
  assert.equal(first.reply, first.content);
  assert.equal(first.provider, 'corpus');
  assert.equal(first.corpusOnly, true);
  const next = corpus.selectExclusiveCorpusReply({ characterId: 'wen-furen', intent: 'greeting', history: [{ role: 'assistant', content: first.reply }] }, fixtureCatalog);
  assert.notEqual(first.reply, next.reply);
  assert.equal(next.corpusSource.file, 'provided-video.mp4');
  assert.equal(corpus.getExclusiveCorpusStatus('wen-furen', fixtureCatalog).count, 3);
  assert.deepEqual(corpus.getExclusiveCorpusEntries('wen-furen', fixtureCatalog).map(entry => entry.id), ['greet-1', 'greet-2', 'topic']);
  assert.deepEqual(corpus.getExclusiveCorpusEntries('yinyue', fixtureCatalog), []);
});

test('unknown topics, empty corpora and actions never borrow fallback lines', () => {
  for (const input of [ { message: '量子计算' }, { intent: 'action:pat' }, { intent: 'fallback' } ]) {
    const result = corpus.selectExclusiveCorpusReply({ characterId: 'wen-furen', ...input }, fixtureCatalog);
    assert.equal(result.reply, ''); assert.equal(result.corpusStatus, 'no-match'); assert.ok(result.corpusNotice);
  }
  assert.equal(corpus.selectExclusiveCorpusReply({ characterId: 'wen-furen', message: '测试话题' }, fixtureCatalog).reply, '这里只是测试用原句。');
  const empty = corpus.selectExclusiveCorpusReply({ characterId: 'mei-ning', message: '你好' }, fixtureCatalog);
  assert.equal(empty.reply, ''); assert.equal(empty.corpusStatus, 'empty'); assert.ok(empty.corpusNotice);
  assert.equal(corpus.selectExclusiveCorpusReply({ characterId: 'yinyue', message: '你好' }, fixtureCatalog), null);
});

test('display and speech guard accepts only this character exact verified source text', () => {
  assert.equal(corpus.isAllowedExclusiveCorpusText('wen-furen', '原句一，{userName}。', fixtureCatalog), true);
  for (const text of ['原句一，主人。', '原句一，{userName}。加一句', '不能说其他人的话。', '不能把场景摘要当台词。', '不能说未确认的转写。', '']) {
    assert.equal(corpus.isAllowedExclusiveCorpusText('wen-furen', text, fixtureCatalog), false);
  }
  assert.equal(corpus.isAllowedExclusiveCorpusText('ling-yuling', '原句二。', fixtureCatalog), false);
  assert.equal(corpus.isAllowedExclusiveCorpusText('yinyue', '不受本次规则限制', fixtureCatalog), true);
});

test('offline and both model paths enforce character policy before persona and model generation', async t => {
  installLooks(t);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { assert.fail('exclusive corpus must not contact the model'); };
  t.after(() => { globalThis.fetch = previousFetch; });
  for (const lookId of Object.values(lookIds)) {
    const input = { lookId, message: '__unmatched_source_topic__', avatarMode: 'live2d', provider: 'ollama',
      persona: resolvePersonaProfile({ templateId: 'older-sister' }), characterCorpus: ['invented'], history: [{ role: 'assistant', content: 'invented' }] };
    for (const result of [offlineReply(input), await modelReply(input), await modelReplyStream(input, { onDelta: text => assert.equal(text, '') })]) {
      assert.equal(result.corpusOnly, true); assert.equal(result.reply, ''); assert.equal(result.provider, 'corpus'); assert.ok(result.corpusNotice);
    }
    assert.throws(() => createMessages(input), /原句|语料/);
  }
});

test('restricted characters can still trigger a silent renderer action without stock acknowledgement', t => {
  installLooks(t);
  const result = offlineReply({ lookId: lookIds['wen-furen'], avatarMode: 'live2d', message: '挥挥手' });
  assert.equal(result.reply, ''); assert.equal(result.petAction, 'wave'); assert.equal(result.motionCommand.motion, 'wave');
  assert.ok(offlineReply({ message: '你好' }).reply.length > 0);
});

test('switching from an unrestricted look to an exclusive character never speaks an invented outfit line', async t => {
  t.mock.method(globalThis, 'fetch', () => { assert.fail('a character switch must not generate dialogue'); });
  const input = { lookId: 'yinyue-silver-fox', avatarMode: 'live2d', message: '换成温夫人' };
  const result = await modelReply(input);
  assert.equal(result.lookAction, 'wen-furen-black-gold');
  assert.equal(result.corpusOnly, true);
  assert.equal(result.characterId, 'wen-furen');
  assert.equal(result.reply, '');
  assert.throws(() => createMessages(input), /原句|语料/);
});

test('verified bundled source text passes through all reply paths without rewriting', async t => {
  t.mock.method(globalThis, 'fetch', () => { assert.fail('a source quote must not call the model'); });
  const input = { lookId: 'mei-ning-teal-attire', message: '修行', avatarMode: 'live2d' };
  const chunks = [];
  for (const result of [offlineReply(input), await modelReply(input), await modelReplyStream(input, { onDelta: text => chunks.push(text) })]) {
    assert.equal(result.reply, '梅凝一定勉励修行');
    assert.equal(result.corpusStatus, 'matched');
    assert.ok(result.corpusSource.file.endsWith('梅凝/MN01/完整来源/BV1oBT5zMEkt.mp4'));
    assert.equal(result.corpusSource.timePrecision, 'evidence frame near this second; not a speech-aligned audio segment');
    assert.equal(corpus.isAllowedExclusiveCorpusText('mei-ning', result.reply), true);
  }
  assert.deepEqual(chunks, ['梅凝一定勉励修行']);
});

test('HTTP chat enforces corpus policy in offline, model, JSON and stream responses', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'muyu-exclusive-corpus-'));
  const site = join(directory, 'public'); await mkdir(site); await writeFile(join(site, 'index.html'), '<h1>fixture</h1>');
  const app = await startServer({ prewarm: false, port: 0, staticDir: site, voiceDirectory: join(directory, 'voices'), studioDirectory: join(directory, 'studio') });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  installLooks(t);
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.ok(!String(url).includes(':11434'), 'chat must not even discover models for a locked character');
    return nativeFetch(url, options);
  };
  t.after(() => { globalThis.fetch = nativeFetch; });
  for (const provider of ['offline', 'ollama']) for (const stream of [false, true]) {
    const response = await fetch(`http://127.0.0.1:${app.port}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lookId: lookIds['mei-ning'], message: '__unmatched_source_topic__', provider, stream,
        characterId: 'yinyue', characterCorpus: ['invented reply'], corpusOnly: false }) });
    assert.equal(response.status, 200);
    const result = stream ? (await response.text()).trim().split('\n').map(JSON.parse).at(-1).result : await response.json();
    assert.equal(result.provider, 'corpus'); assert.equal(result.reply, ''); assert.equal(result.corpusOnly, true);
    assert.equal(result.characterId, getLook(lookIds['mei-ning']).characterId);
  }
  for (const lookId of Object.values(lookIds)) for (const stream of [false, true]) {
    const response = await fetch(`http://127.0.0.1:${app.port}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lookId, text: '这句不在该角色已核验语料中。', stream }) });
    assert.equal(response.status, 422, 'role-bound narration must reject non-source text before speech inference');
    assert.match((await response.json()).error, /已核验.*原句/);
  }
});
