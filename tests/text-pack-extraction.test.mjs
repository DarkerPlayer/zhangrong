import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTextEntries } from '../server/text-pack-extraction.mjs';

const extract = (text, mode = 'dialogue', extra = {}) => [...extractTextEntries([{ text, chapter: '第一章', paragraph: 1, ...extra }], mode)];

test('dialogue extraction handles Chinese and English quotes and explicit speaker lines without ellipsis guesses', () => {
  const entries = extract('雨落在窗边……\n她想了很久。\n阿远：“今天好吗？”\nAlice: I am doing well.\n他说，"See you tomorrow."\n她回答：「好呀。」\n“……”\n普通叙述没有引号。');
  assert.deepEqual(entries.map(entry => entry.text), ['今天好吗？', 'I am doing well.', 'See you tomorrow.', '好呀。']);
  assert.equal(entries[0].speaker, '阿远');
  assert.equal(entries[1].speaker, 'Alice');
  assert.ok(entries.every(entry => entry.kind === 'dialogue' && entry.category === 'fallback'));
  assert.equal(extract('只有一个省略号……或者普通叙述。').length, 0);
});

test('reading preserves long text, order, repeated paragraphs and surrogate pairs with real source locations', () => {
  const original = `相同的一段。\n相同的一段。\n${'长'.repeat(239)}😀${'句'.repeat(500)}。`;
  const entries = extract(original, 'reading', { page: 4, paragraph: 7 });
  assert.equal(entries.map(entry => entry.text).join(''), original);
  assert.equal(entries.filter(entry => entry.text === '相同的一段。\n').length, 2);
  assert.ok(entries.every(entry => entry.text.length <= 240 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(entry.text)));
  assert.equal(entries[0].source.chapter, '第一章');
  assert.equal(entries[0].source.page, 4);
  assert.equal(entries[0].source.paragraph, 7);
  assert.equal(entries[1].source.paragraph, 8);
  for (const entry of entries) assert.equal(original.slice(entry.source.offsetStart, entry.source.offsetEnd), entry.text);
});

test('dialogue deduplicates exact phrases with occurrence counts and keeps the first provenance', () => {
  const entries = [...extractTextEntries([
    { text: '“不要着急。”', chapter: '第一章', page: 1, paragraph: 2 },
    { text: '“不要着急。”\n“我在听。”', chapter: '第二章', page: 9, paragraph: 3 },
  ], 'dialogue')];
  assert.equal(entries.length, 2);
  assert.equal(entries[0].occurrences, 2);
  assert.deepEqual(entries[0].source, { chapter: '第一章', page: 1, paragraph: 2, offsetStart: 1, offsetEnd: 6 });
  assert.equal(entries[1].source.paragraph, 4);
});

test('long quoted dialogue is completely segmented and unmatched quotes do not invent speech', () => {
  const original = '开'.repeat(650) + '结束。';
  const entries = extract(`“${original}”\n这是未闭合的 "引用。`);
  assert.equal(entries.map(entry => entry.text).join(''), original);
  assert.ok(entries.every(entry => entry.text.length <= 240));
  assert.equal(extract("Don't mistake apostrophes for dialogue. ...").length, 0);
});

test('apostrophes inside English dialogue and narration after a quoted speaker stay correctly bounded', () => {
  assert.deepEqual(extract("'don't go'\n'I'm listening.'").map(entry => entry.text), ["don't go", "I'm listening."]);
  assert.deepEqual(extract('‘Don’t go.’\n‘We’re here.’').map(entry => entry.text), ['Don’t go.', 'We’re here.']);
  const entries = extract('小雨：“你好。”她转身离开。\nAlice: "Stay here." She closed the door.');
  assert.deepEqual(entries.map(entry => entry.text), ['你好。', 'Stay here.']);
  assert.deepEqual(extract('小雨：“你好。”她接着说：“明天见。”').map(entry => entry.text), ['你好。', '明天见。']);
});

test('plain text chapter headings improve provenance without removing reading text', () => {
  const text = '第一章 开始\n“你好。”\nChapter 2: Another day\n“第二天见。”\n# 终章\n结束。';
  const dialogue = extract(text);
  assert.equal(dialogue[0].source.chapter, '第一章 开始');
  assert.equal(dialogue[1].source.chapter, 'Chapter 2: Another day');
  const reading = extract(text, 'reading');
  assert.equal(reading.map(entry => entry.text).join(''), text);
  assert.equal(reading.at(-1).source.chapter, '终章');
});

test('more than 10000 entries and excessive decoded text fail explicitly instead of truncating', () => {
  assert.throws(() => extract(Array.from({ length: 10001 }, (_, index) => `Alice: 第${index}句`).join('\n')), error => error.status === 413 && /10000/.test(error.message));
  assert.throws(() => extract('长'.repeat(1000001), 'reading'), error => error.status === 413);
  assert.throws(() => extract('内容', 'unknown'), error => error.status === 400);
});
