import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm, mkdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';

const run = promisify(execFile);
const parser = await import('../server/document-parser.mjs').catch(() => ({}));
const parse = (...args) => { assert.equal(typeof parser.parseTextDocument, 'function'); return parser.parseTextDocument(...args); };
const python = resolve('.runtime/voice/python/bin/python3');
const directory = await mkdtemp(join(tmpdir(), 'muyu-parser-fixtures-'));
test.after(() => rm(directory, { recursive: true, force: true }));
let sequence = 0;
const file = async name => ({ name, fileBase64: (await readFile(join(directory, name))).toString('base64') });
async function zip(entries) {
  const path = join(directory, `archive-${++sequence}.zip`);
  const manifest = path + '.json';
  await writeFile(manifest, JSON.stringify(entries));
  await run(python, ['-B', '-c', 'import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[2],"w",compression=zipfile.ZIP_DEFLATED) as z:\n for name,text in json.load(open(sys.argv[1])).items(): z.writestr(name,text)', manifest, path]);
  return (await readFile(path)).toString('base64');
}
const epub = (extra = {}) => ({
  mimetype: 'application/epub+zip',
  'META-INF/container.xml': '<container><rootfiles><rootfile full-path="Book/book.opf"/></rootfiles></container>',
  'Book/book.opf': '<package><manifest><item id="second" href="two.xhtml" media-type="application/xhtml+xml"/><item id="first" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="first"/><itemref idref="second"/></spine></package>',
  'Book/two.xhtml': '<html><head><title>第二章</title></head><body><p>“明天再见。”</p></body></html>',
  'Book/one.xhtml': '<html><head><title>第一章</title><style>隐藏样式</style></head><body><p>“你好。”</p><script>隐藏脚本</script><p>我们坐下来。</p></body></html>',
  ...extra,
});

test('paste, TXT and Markdown preserve repeated text and source names', async () => {
  const text = '你好。\n\n你好。\n第二段🙂';
  const pasted = await parse({ text });
  assert.equal(pasted.sections.map(section => section.text).join(''), text);
  assert.equal(pasted.format, 'txt');
  const imported = await parse({ name: '/private/path/book.md', fileBase64: Buffer.from('# 章节\r\n\r\n你好。').toString('base64') });
  assert.equal(imported.sourceName, 'book.md');
  assert.equal(imported.format, 'md');
  assert.equal(imported.sections[0].text, '# 章节\n\n你好。');
  const utf16 = Buffer.concat([Buffer.from([255, 254]), Buffer.from('中文文本', 'utf16le')]);
  assert.equal((await parse({ name: 'book.txt', fileBase64: utf16.toString('base64') })).sections[0].text, '中文文本');
});

test('invalid input, extension, encoding and incomplete base64 are rejected before parsing', async () => {
  for (const input of [
    {}, { text: 'a', fileBase64: 'YQ==', name: 'a.txt' }, { text: '' },
    { fileBase64: 'YQ==', name: 'a.exe' }, { fileBase64: 'YQ', name: 'a.txt' },
    { fileBase64: 'YR==', name: 'a.txt' }, { fileBase64: '!bad!', name: 'a.txt' },
    { fileBase64: Buffer.from([0xc3, 0x28]).toString('base64'), name: 'a.txt' },
    { fileBase64: Buffer.from('text\0binary').toString('base64'), name: 'a.md' },
    { text: '字'.repeat(1_000_001) },
    { fileBase64: Buffer.alloc(20 * 1024 * 1024 + 1).toString('base64'), name: 'a.txt' },
  ]) await assert.rejects(parse(input));
});

test('large valid base64 reaches the text limit without regex stack growth', async () => {
  const text = '字'.repeat(1_000_000);
  const result = await parse({ name: 'large.txt', fileBase64: Buffer.from(text).toString('base64') });
  assert.equal(result.sections[0].text.length, 1_000_000);
});

test('EPUB follows spine order and strips active markup without fetching resources', async () => {
  const result = await parse({ name: 'story.epub', fileBase64: await zip(epub()) });
  assert.deepEqual(result.sections.map(section => section.chapter), ['第一章', '第二章']);
  assert.match(result.sections[0].text, /你好.*\n.*我们坐下来/s);
  assert.doesNotMatch(result.sections.map(section => section.text).join(''), /隐藏|script|style/);
});

test('EPUB accepts a standard XHTML doctype without loading its external DTD', async () => {
  const entries = epub({ 'Book/one.xhtml': '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"><html><head><title>标准章节</title></head><body><p>正常正文。</p></body></html>' });
  assert.equal((await parse({ name: 'standard.epub', fileBase64: await zip(entries) })).sections[0].text, '正常正文。');
});

test('DOCX preserves paragraph and table reading order without Office', async () => {
  const fileBase64 = await zip({
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': '<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>第一段</w:t><w:tab/><w:t>文字</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格文字</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>最后一段</w:t></w:r></w:p></w:body></w:document>',
  });
  const result = await parse({ name: 'book.docx', fileBase64 });
  assert.deepEqual(result.sections.map(section => section.text), ['第一段\t文字', '表格文字', '最后一段']);
  assert.deepEqual(result.sections.map(section => section.paragraph), [1, 2, 3]);
});

test('archive path traversal, external references, entities, expansion and entry limits are rejected', async () => {
  const invalid = [
    epub({ '../escape.txt': 'bad' }),
    epub({ 'Book/book.opf': '<package><manifest><item id="x" href="https://example.com/book.xhtml"/></manifest><spine><itemref idref="x"/></spine></package>' }),
    epub({ 'META-INF/container.xml': '<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><container>&secret;</container>' }),
    epub({ 'Book/one.xhtml': 'x'.repeat(9 * 1024 * 1024) }),
    Object.fromEntries(Array.from({ length: 2049 }, (_, index) => [`entry${index}`, 'x'])),
  ];
  for (const entries of invalid) await assert.rejects(parse({ name: 'bad.epub', fileBase64: await zip(entries) }));
});

test('archive limits count actual directory entries even when the footer lies', async () => {
  const entries = { ...epub(), ...Object.fromEntries(Array.from({ length: 2044 }, (_, index) => [`extra${index}`, 'x'])) };
  const forged = Buffer.from(await zip(entries), 'base64');
  const footer = forged.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  forged.writeUInt16LE(1, footer + 8);
  forged.writeUInt16LE(1, footer + 10);
  await assert.rejects(parse({ name: 'too-many.epub', fileBase64: forged.toString('base64') }), /条目过多/);
});

test('archive expansion budget includes repeated EPUB spine reads', async () => {
  const repeated = epub({
    'Book/book.opf': `<package><manifest><item id="x" href="one.xhtml"/></manifest><spine>${'<itemref idref="x"/>'.repeat(350)}</spine></package>`,
    'Book/one.xhtml': `<html><head><title>章节</title></head><body><!--${randomBytes(150_000).toString('base64')}--><p>正文。</p></body></html>`,
  });
  await assert.rejects(parse({ name: 'repeated.epub', fileBase64: await zip(repeated) }), /累计|展开后过大/);
});

test('real PDF text is extracted and scanned/encrypted PDFs report unsupported content', async () => {
  await run('/usr/bin/xcrun', ['swiftc', resolve('tests/fixtures/document-fixtures.swift'), '-o', join(directory, 'pdf-fixtures'), '-framework', 'PDFKit', '-framework', 'AppKit'], { timeout: 60000 });
  await run(join(directory, 'pdf-fixtures'), [directory]);
  const result = await parse(await file('text.pdf'));
  assert.match(result.sections[0].text, /Local text fixture/);
  assert.equal(result.sections[0].page, 1);
  // Add a legal PDF comment plus a final startxref at the exact file limit.
  // This exercises the full 28-million-character Base64 input, not just a
  // pre-decode size rejection or a tiny fixture that happens to use Base64.
  const original = await readFile(join(directory, 'text.pdf'));
  const xref = original.toString('latin1').match(/startxref\s+(\d+)\s+%%EOF/)[1];
  const tail = Buffer.from(`\nstartxref\n${xref}\n%%EOF\n`);
  const nearLimit = Buffer.alloc(20 * 1024 * 1024, 0x78);
  original.copy(nearLimit);
  nearLimit.write('\n%', original.length);
  tail.copy(nearLimit, nearLimit.length - tail.length);
  assert.match((await parse({ name: 'large.pdf', fileBase64: nearLimit.toString('base64') })).sections[0].text, /Local text fixture/);
  await assert.rejects(parse(await file('scan.pdf')), /扫描|文字/);
  await assert.rejects(parse(await file('encrypted.pdf')), /加密|密码/);
});

test('cancellation and worker timeout remove all temporary input files', async () => {
  assert.equal(typeof parser.createDocumentParser, 'function');
  const temporaryRoot = join(directory, 'temporary');
  await mkdir(temporaryRoot);
  const slow = join(directory, 'slow-pdf');
  await writeFile(slow, '#!/bin/sh\nexec /bin/sleep 30\n');
  await chmod(slow, 0o755);
  const input = { name: 'test.pdf', fileBase64: Buffer.from('%PDF-1.4\n').toString('base64') };
  const controller = new AbortController();
  const pending = parser.createDocumentParser({ temporaryRoot, pdfPath: slow })(input, { signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 40);
  await assert.rejects(pending, { name: 'AbortError' });
  clearTimeout(timer);
  assert.deepEqual(await readdir(temporaryRoot), []);
  await assert.rejects(parser.createDocumentParser({ temporaryRoot, pdfPath: slow, workerTimeoutMs: 20 })(input), /超时/);
  assert.deepEqual(await readdir(temporaryRoot), []);
  const already = new AbortController(); already.abort();
  await assert.rejects(parse({ text: '你好' }, { signal: already.signal }), { name: 'AbortError' });
});
