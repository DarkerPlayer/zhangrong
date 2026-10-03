import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, symlink, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTextPackLibrary, TEXT_PACK_BODY_LIMIT } from '../server/text-packs.mjs';

const fakeParser = async ({ text, name }) => ({ sections: [{ text, chapter: '正文', paragraph: 1 }], warnings: [], format: 'txt', sourceName: name || '粘贴文本.txt' });
async function setup(t, parseDocument = fakeParser) {
  const directory = await mkdtemp(join(tmpdir(), 'muyu-text-library-'));
  const library = createTextPackLibrary({ directory, parseDocument });
  t.after(async () => { await library.close(); await rm(directory, { recursive: true, force: true }); });
  return { library, directory };
}
async function bodyText(body) { let text = ''; for await (const chunk of body) text += chunk.toString(); return text; }
const readingInput = text => ({ text, mode: 'reading', title: '本地阅读', name: 'book.txt' });

test('small disk-backed pages, filtering and selection survive restart with all source text intact', async t => {
  const { library, directory } = await setup(t);
  const text = Array.from({ length: 70 }, (_, index) => `第${index}段：原文不会丢失。\n`).join('');
  const initial = await library.extract(readingInput(text));
  assert.equal(initial.entries.length, 25);
  assert.equal(initial.total, 70);
  assert.equal(initial.pack.draft, true);
  assert.equal(initial.pack.sourceCharacters, text.length);
  const next = await library.page(initial.pack.id, { offset: 25, limit: 50 });
  assert.equal(next.entries.length, 45);
  assert.equal((await library.page(initial.pack.id, { query: '第42段', kind: 'narration' })).total, 1);
  assert.equal((await library.select(initial.pack.id, { ids: [next.entries[0].id, initial.entries[0].id] })).entries.length, 2);
  await library.save(initial.pack.id, { title: '保存的阅读' });
  await library.close();
  const reopened = createTextPackLibrary({ directory, parseDocument: fakeParser });
  t.after(() => reopened.close());
  assert.equal((await reopened.list()).packs[0].title, '保存的阅读');
  const exported = await reopened.export(initial.pack.id, 'txt');
  assert.match(exported.contentType, /^text\/plain/);
  assert.equal(await bodyText(exported.body), text);
});

test('dialogue drafts explain empty results and deduplicate exact speech only', async t => {
  const { library } = await setup(t);
  const empty = await library.extract({ text: '我走过雨中的街道……', mode: 'dialogue' });
  assert.equal(empty.total, 0);
  assert.ok(empty.pack.warnings.some(warning => /未识别|阅读/.test(warning)));
  const dialogue = await library.extract({ text: '“别着急。”\n“别着急。”\nAlice: Take your time.', mode: 'dialogue' });
  assert.equal(dialogue.total, 2);
  assert.equal(dialogue.entries[0].occurrences, 2);
  assert.deepEqual(dialogue.pack.stats, { dialogue: 2, narration: 0, duplicates: 1 });
});

test('portable JSON roundtrip creates an independent draft and metadata labeling never rewrites text', async t => {
  const { library } = await setup(t);
  const source = await library.extract({ text: '阿远：“慢慢来。”\n“我会听你说。”', name: '小说.txt', mode: 'dialogue' });
  const originalText = source.entries[0].text;
  const labeled = await library.applyLabels(source.pack.id, [{ id: source.entries[0].id, category: 'comfort', speaker: '阿远' }]);
  assert.equal(labeled.entries[0].text, originalText);
  assert.equal(labeled.entries[0].category, 'comfort');
  const exported = await library.export(source.pack.id, 'json');
  const portable = JSON.parse(await bodyText(exported.body));
  assert.equal(portable.format, 'muyu-text-pack');
  assert.equal(portable.version, 1);
  assert.equal(portable.entries.length, 2);
  const imported = await library.extract({ fileBase64: Buffer.from(JSON.stringify(portable)).toString('base64'), name: 'copy.json', mode: 'reading' });
  assert.notEqual(imported.pack.id, source.pack.id);
  assert.equal(imported.pack.mode, 'dialogue');
  assert.equal(imported.pack.sourceName, '小说.txt');
  assert.deepEqual(imported.entries, portable.entries);
  await library.applyLabels(imported.pack.id, [{ id: imported.entries[0].id, category: 'daily' }]);
  assert.equal((await library.page(source.pack.id)).entries[0].category, 'comfort');
});

test('invalid inputs, IDs, pagination, label fields and malformed portable schemas fail with 4xx', async t => {
  const { library } = await setup(t);
  const source = await library.extract(readingInput('原文。'));
  const rejects = input => assert.rejects(input, error => error.status >= 400 && error.status < 500);
  await rejects(library.extract({ text: 'a', fileBase64: 'YQ==', mode: 'reading' }));
  await rejects(library.extract({ text: 'a', mode: 'invalid' }));
  await rejects(library.extract({ text: 'a', name: '../private.txt', mode: 'reading' }));
  await rejects(library.page('../elsewhere'));
  for (const options of [{ offset: -1 }, { limit: 51 }, { limit: 'wat' }, { query: [] }, { kind: 'system' }, { kind: false }]) await rejects(library.page(source.pack.id, options));
  for (const fileBase64 of ['YQ=', 'YR==', 'YWJ=', 'AA=A']) await rejects(library.extract({ fileBase64, name: 'invalid.txt', mode: 'reading' }));
  await rejects(library.select(source.pack.id, { ids: Array.from({ length: 41 }, (_, index) => `entry-${index}`) }));
  await rejects(library.select(source.pack.id, { ids: ['missing'] }));
  await rejects(library.applyLabels(source.pack.id, [{ id: source.entries[0].id, text: '伪造的新原文', category: 'comfort' }]));
  await rejects(library.applyLabels(source.pack.id, [{ id: source.entries[0].id, category: 'system' }]));
  const exported = await library.export(source.pack.id, 'json');
  const portable = JSON.parse(await bodyText(exported.body));
  for (const corrupt of [
    { ...portable, version: 2 },
    { ...portable, metadata: { ...portable.metadata, sourceName: '/Users/private/book.txt' } },
    { ...portable, entries: [{ ...portable.entries[0], text: '长'.repeat(241) }] },
    { ...portable, entries: [{ ...portable.entries[0], source: { ...portable.entries[0].source, path: '/tmp/private' } }] },
    { ...portable, entries: [{ ...portable.entries[0], source: { ...portable.entries[0].source, offsetStart: 999997, offsetEnd: 1000000 } }] },
    { ...portable, entries: [{ ...portable.entries[0], source: { ...portable.entries[0].source, offsetStart: 0, offsetEnd: 4 } }] },
  ]) await rejects(library.extract({ fileBase64: Buffer.from(JSON.stringify(corrupt)).toString('base64'), name: 'bad.json', mode: 'reading' }));
  assert.equal((await library.page(source.pack.id)).entries[0].text, '原文。');
  assert.ok(TEXT_PACK_BODY_LIMIT > 20 * 1024 * 1024 * 4 / 3);
});

test('draft limits, saved limits and one-day expiry preserve saved packs and move deletions to trash', async t => {
  const { library, directory } = await setup(t);
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const drafts = [];
  for (let index = 0; index < 3; index++) drafts.push(await library.extract(readingInput(`草稿${index}`)));
  await assert.rejects(library.extract(readingInput('第四份')), error => error.status === 409);
  await library.save(drafts[0].pack.id, { title: '保留的包' });
  t.mock.timers.setTime(start + 86400000 + 1);
  const listed = await library.list();
  assert.equal(listed.packs.length, 1);
  assert.equal(listed.packs[0].draft, false);
  assert.equal((await readdir(join(directory, 'trash'))).length, 2);
  for (let index = 1; index < 30; index++) {
    const pack = await library.extract(readingInput(`第${index}包`));
    await library.save(pack.pack.id, { title: `第${index}包` });
  }
  const extra = await library.extract(readingInput('超额保存'));
  await assert.rejects(library.save(extra.pack.id, { title: '第31包' }), error => error.status === 409);
  await library.remove(drafts[0].pack.id);
  assert.equal((await readdir(join(directory, 'trash'))).length, 3);
  await library.save(extra.pack.id, { title: '替代的包' });
  assert.equal((await library.list()).packs.filter(pack => !pack.draft).length, 30);
});

test('failed classification is transactional and corrupt or linked pack files are never rebuilt', async t => {
  const { library, directory } = await setup(t);
  const source = await library.extract(readingInput('第一段。\n第二段。'));
  await assert.rejects(library.applyLabels(source.pack.id, [{ id: source.entries[0].id, category: 'comfort' }, { id: 'missing', category: 'daily' }]), error => error.status === 404);
  assert.equal((await library.page(source.pack.id)).entries[0].category, 'fallback');
  const manifestPath = join(directory, source.pack.id, 'manifest.json');
  const original = await readFile(manifestPath, 'utf8');
  await writeFile(manifestPath, '{broken');
  await assert.rejects(library.page(source.pack.id), error => error.status >= 400 && error.status < 500);
  assert.equal(await readFile(manifestPath, 'utf8'), '{broken');
  await writeFile(manifestPath, original);
  const external = await mkdtemp(join(tmpdir(), 'muyu-external-pack-'));
  t.after(() => rm(external, { recursive: true, force: true }));
  const linkedId = '00000000-0000-4000-8000-000000000000';
  await symlink(external, join(directory, linkedId));
  await assert.rejects(library.page(linkedId), error => error.status >= 400 && error.status < 500);
  assert.equal((await stat(external)).isDirectory(), true);
});

test('exports keep a committed generation while labels change and the pack moves to trash', async t => {
  const { library } = await setup(t);
  const source = await library.extract(readingInput('仍可下载的原文。'));
  const exported = await library.export(source.pack.id, 'json');
  await library.applyLabels(source.pack.id, [{ id: source.entries[0].id, category: 'comfort' }]);
  await library.remove(source.pack.id);
  const portable = JSON.parse(await bodyText(exported.body));
  assert.equal(portable.entries[0].category, 'fallback');
  assert.equal(portable.entries[0].text, '仍可下载的原文。');
});

test('oversized JSON and a concurrent extraction fail without retaining a queue of full documents', async t => {
  let release, started;
  const beginning = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const { library } = await setup(t, async input => { started(); await pending; return fakeParser(input); });
  await assert.rejects(library.extract({ text: ' '.repeat(20 * 1024 * 1024 + 1), name: 'large.json', mode: 'reading' }), error => error.status === 413);
  const first = library.extract(readingInput('第一份'));
  await beginning;
  const second = library.extract(readingInput('第二份'));
  release();
  await assert.rejects(second, error => error.status === 409);
  assert.equal((await first).total, 1);
  assert.equal((await library.list()).packs.length, 1);
});

test('cancellation and close do not publish partial drafts', async t => {
  let begin;
  const started = new Promise(resolve => { begin = resolve; });
  const { library, directory } = await setup(t, async (_, { signal }) => {
    begin();
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), { once: true }));
  });
  const controller = new AbortController();
  const work = library.extract(readingInput('取消内容'), { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(work, error => error.name === 'AbortError');
  assert.equal((await library.list()).packs.length, 0);
  assert.ok(!(await readdir(directory)).some(name => name.startsWith('.extract-')));
  await library.close();
  await assert.rejects(library.list(), error => error.status === 503);
});
