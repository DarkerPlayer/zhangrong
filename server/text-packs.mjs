import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, lstat, open, rename, rm, readdir, mkdtemp } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { parseTextDocument } from './document-parser.mjs';
import { extractTextEntries, MAX_TEXT_CHARACTERS, MAX_TEXT_ENTRIES } from './text-pack-extraction.mjs';

export const DEFAULT_TEXT_PACK_DIRECTORY = join(homedir(), 'Library/Application Support/沐语/text-library');
export const TEXT_PACK_BODY_LIMIT = 30 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024;
const DAY = 86400000;
const CATEGORIES = new Set(['greeting', 'daily', 'affection', 'teasing', 'seduction', 'comfort', 'jealousy', 'praise', 'goodnight', 'fallback']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ENTRY_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const META_KEYS = ['id', 'title', 'draft', 'mode', 'sourceName', 'sourceFormat', 'sourceCharacters', 'totalEntries', 'createdAt', 'updatedAt', 'warnings', 'stats'];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const aborted = () => new DOMException('文本提取已取消。', 'AbortError');
const assertActive = signal => { if (signal?.aborted) throw aborted(); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed, label) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw fail(`${label}格式无效。`);
}
function string(value, max, label, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw fail(`${label}格式无效或超过${max}字。`);
  return value;
}
function integer(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw fail(`${label}格式无效。`);
  return value;
}
function filename(value) {
  string(value, 200, '来源文件名');
  if (/[\\/:\r\n]/.test(value) || value === '.' || value === '..') throw fail('来源只能包含文件名，不能包含文件路径。');
  return value;
}
function packId(value) { if (typeof value !== 'string' || !UUID.test(value)) throw fail('文本包编号无效。'); return value; }
function validateMetadata(value, expectedId) {
  keys(value, META_KEYS, '文本包资料');
  packId(value.id);
  if (expectedId && value.id !== expectedId) throw fail('文本包编号与保存位置不一致。', 422);
  string(value.title, 80, '文本包标题');
  if (typeof value.draft !== 'boolean' || !['dialogue', 'reading'].includes(value.mode)) throw fail('文本包模式无效。');
  filename(value.sourceName);
  if (!['txt', 'md', 'epub', 'docx', 'pdf', 'text', 'json'].includes(value.sourceFormat)) throw fail('文本来源格式无效。');
  integer(value.sourceCharacters, 0, MAX_TEXT_CHARACTERS, '原文长度');
  integer(value.totalEntries, 0, MAX_TEXT_ENTRIES, '条目数量');
  integer(value.createdAt, 1, 8640000000000000, '创建时间');
  integer(value.updatedAt, value.createdAt, 8640000000000000, '更新时间');
  if (!Array.isArray(value.warnings) || value.warnings.length > 20) throw fail('文档提示格式无效。');
  value.warnings.forEach(warning => string(warning, 240, '文档提示'));
  keys(value.stats, ['dialogue', 'narration', 'duplicates'], '条目统计');
  integer(value.stats.dialogue, 0, MAX_TEXT_ENTRIES, '对白数量');
  integer(value.stats.narration, 0, MAX_TEXT_ENTRIES, '叙述数量');
  integer(value.stats.duplicates, 0, MAX_TEXT_CHARACTERS, '重复数量');
  if (value.stats.dialogue + value.stats.narration !== value.totalEntries) throw fail('文本包统计与条目数量不一致。');
  return { ...value, warnings: [...value.warnings], stats: { ...value.stats } };
}
function validateEntry(value) {
  keys(value, ['id', 'text', 'kind', 'category', 'speaker', 'source', 'occurrences'], '文本条目');
  if (typeof value.id !== 'string' || !ENTRY_ID.test(value.id)) throw fail('文本条目编号无效。');
  string(value.text, 240, '条目原文', true);
  if (!value.text.length || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value.text)) throw fail('条目原文为空或包含不完整字符。');
  if (!['dialogue', 'narration'].includes(value.kind) || !CATEGORIES.has(value.category)) throw fail('条目类型或分类无效。');
  if (value.speaker !== undefined) { string(value.speaker, 80, '说话人', true); if (/[\r\n]/.test(value.speaker)) throw fail('说话人格式无效。'); }
  keys(value.source, ['chapter', 'page', 'paragraph', 'offsetStart', 'offsetEnd'], '条目出处');
  string(value.source.chapter, 200, '章节');
  if (/^(?:[\\/]|[A-Za-z]:[\\/])|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(value.source.chapter)) throw fail('章节不能包含本地文件路径。');
  integer(value.source.paragraph, 1, MAX_TEXT_CHARACTERS, '段落编号');
  if (value.source.page !== undefined) integer(value.source.page, 1, MAX_TEXT_CHARACTERS, '页码');
  if (value.source.offsetStart !== undefined || value.source.offsetEnd !== undefined) {
    integer(value.source.offsetStart, 0, MAX_TEXT_CHARACTERS, '原文起点');
    integer(value.source.offsetEnd, value.source.offsetStart + value.text.length, MAX_TEXT_CHARACTERS, '原文终点');
    if (value.source.offsetEnd - value.source.offsetStart !== value.text.length) throw fail('原文定位长度与条目文字不一致。');
  }
  if (value.occurrences !== undefined) integer(value.occurrences, 1, MAX_TEXT_CHARACTERS, '出现次数');
  if (value.kind !== 'dialogue' && (value.occurrences || 1) !== 1) throw fail('阅读叙述不能合并重复段落。');
  return { ...value, source: { ...value.source } };
}
function entryTotals() { return { count: 0, characters: 0, representedCharacters: 0, maxOffset: 0, stats: { dialogue: 0, narration: 0, duplicates: 0 }, ids: new Set() }; }
function countEntry(totals, entry) {
  if (totals.ids.has(entry.id)) throw fail('文本条目编号重复。');
  totals.ids.add(entry.id);
  if (++totals.count > MAX_TEXT_ENTRIES) throw fail('文本包超过10000条，请拆分文档。', 413);
  totals.characters += entry.text.length;
  totals.representedCharacters += entry.text.length * (entry.occurrences || 1);
  totals.maxOffset = Math.max(totals.maxOffset, entry.source.offsetEnd || 0);
  if (totals.representedCharacters > MAX_TEXT_CHARACTERS) throw fail('文本包原文总量超过1000000字。', 413);
  totals.stats[entry.kind]++;
  totals.stats.duplicates += (entry.occurrences || 1) - 1;
}
function checkTotals(totals, metadata) {
  if (totals.count !== metadata.totalEntries || Object.keys(totals.stats).some(key => totals.stats[key] !== metadata.stats[key]) || totals.representedCharacters > metadata.sourceCharacters || totals.maxOffset > metadata.sourceCharacters || metadata.mode === 'reading' && totals.characters !== metadata.sourceCharacters) throw fail('文本包内容与资料不一致，已保留原文件。', 422);
}
function validateBase64(value) {
  if (typeof value !== 'string' || !value.length) throw fail('文件内容为空或格式无效。');
  if (value.length > Math.ceil(MAX_FILE_BYTES / 3) * 4) throw fail('文件不能超过20 MiB。', 413);
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  if (value.length % 4 || /[^A-Za-z0-9+/]/.test(value.slice(0, value.length - padding))) throw fail('文件编码无效。');
  if (value.length / 4 * 3 - padding > MAX_FILE_BYTES) throw fail('文件不能超过20 MiB。', 413);
  const tail = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(value[value.length - padding - 1]);
  if (padding === 2 && (tail & 15) !== 0 || padding === 1 && (tail & 3) !== 0) throw fail('文件编码无效。');
}
function decodeBase64(value) {
  validateBase64(value);
  const buffer = Buffer.from(value, 'base64');
  if (buffer.length > MAX_FILE_BYTES) throw fail('文件不能超过20 MiB。', 413);
  if (buffer.toString('base64') !== value) throw fail('文件编码无效。');
  return buffer;
}
function validatePortable(value) {
  keys(value, ['format', 'version', 'metadata', 'entries'], '便携文本包');
  if (value.format !== 'muyu-text-pack' || value.version !== 1) throw fail('不支持这个文本包版本。', 415);
  const metadata = validateMetadata(value.metadata);
  if (!Array.isArray(value.entries)) throw fail('文本包条目格式无效。');
  if (value.entries.length > MAX_TEXT_ENTRIES) throw fail('文本包超过10000条。', 413);
  const totals = entryTotals();
  const entries = value.entries.map(entry => { const valid = validateEntry(entry); countEntry(totals, valid); return valid; });
  checkTotals(totals, metadata);
  return { metadata, entries };
}
function pagination(value = {}) {
  keys(value, ['offset', 'limit', 'query', 'kind'], '分页参数');
  const number = (item, fallback, min, max, label) => {
    if (item === undefined) return fallback;
    if (typeof item === 'string' && /^\d+$/.test(item)) item = Number(item);
    return integer(item, min, max, label);
  };
  const offset = number(value.offset, 0, 0, MAX_TEXT_ENTRIES, '分页起点');
  const limit = number(value.limit, 25, 1, 50, '每页条数');
  const query = value.query === undefined ? '' : string(value.query, 200, '搜索词', true).trim().toLocaleLowerCase();
  const kind = value.kind === undefined ? '' : value.kind;
  if (typeof kind !== 'string' || !['', 'dialogue', 'narration'].includes(kind)) throw fail('条目筛选类型无效。');
  return { offset, limit, query, kind };
}
function selection(value, maximum) {
  keys(value, ['ids'], '条目选择');
  if (!Array.isArray(value.ids) || !value.ids.length || value.ids.length > maximum || value.ids.some(id => typeof id !== 'string' || !ENTRY_ID.test(id)) || new Set(value.ids).size !== value.ids.length) throw fail(`请选择1至${maximum}个不同条目。`);
  return new Set(value.ids);
}

/** One serialized operation per library, with metadata-only listings and streamed records. */
export function createTextPackLibrary({ directory = DEFAULT_TEXT_PACK_DIRECTORY, parseDocument = parseTextDocument } = {}) {
  if (typeof directory !== 'string' || !directory || typeof parseDocument !== 'function') throw fail('文本库配置无效。');
  const root = resolve(directory);
  let tail = Promise.resolve(), closed = false, extracting = false;
  const controllers = new Set(), exports = new Set();
  async function safeDirectory(path, create = false) {
    if (create) await mkdir(path, { recursive: true, mode: 0o700 });
    let info;
    try { info = await lstat(path); } catch (error) { if (error.code === 'ENOENT') throw fail('文本包不存在。', 404); throw error; }
    if (!info.isDirectory() || info.isSymbolicLink()) throw fail('文本包目录无效，不能读取外部链接。');
  }
  async function readable(path, maximum) {
    let handle;
    try {
      handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const info = await handle.stat();
      if (!info.isFile() || info.size > maximum) throw fail(info.size > maximum ? '文本包文件超过大小上限。' : '文本包文件无效。', info.size > maximum ? 413 : 400);
      return handle;
    } catch (error) {
      await handle?.close().catch(() => {});
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) throw fail('文本包文件不存在。', 404);
      if (error.code === 'ELOOP') throw fail('文本包不能读取外部文件链接。');
      throw error;
    }
  }
  async function readManifest(id) {
    packId(id);
    const path = join(root, id);
    await safeDirectory(path);
    const handle = await readable(join(path, 'manifest.json'), MAX_MANIFEST_BYTES);
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false, highWaterMark: 8192 })) { bytes += chunk.length; if (bytes > MAX_MANIFEST_BYTES) throw fail('文本包资料过大。', 413); chunks.push(chunk); }
      let value;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { throw fail('文本包资料损坏，已保留原文件。', 422); }
      keys(value, ['version', 'metadata', 'entriesFile'], '磁盘文本包');
      if (value.version !== 1 || typeof value.entriesFile !== 'string' || !/^entries-[0-9a-f-]{36}\.ndjson$/.test(value.entriesFile)) throw fail('不支持这个磁盘文本包格式，已保留原文件。', 422);
      return { ...value, metadata: validateMetadata(value.metadata, id), path };
    } finally { await handle.close(); }
  }
  async function* entries(manifest, { signal, handle: existing } = {}) {
    const handle = existing || await readable(join(manifest.path, manifest.entriesFile), MAX_FILE_BYTES);
    const stream = handle.createReadStream({ autoClose: false, highWaterMark: 16384 });
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const totals = entryTotals();
    let pending = '', bytes = 0;
    const parse = line => {
      let value;
      try { value = JSON.parse(line); } catch { throw fail('文本包条目损坏，已保留原文件。', 422); }
      const entry = validateEntry(value); countEntry(totals, entry); return entry;
    };
    try {
      for await (const chunk of stream) {
        assertActive(signal);
        bytes += chunk.length;
        if (bytes > MAX_FILE_BYTES) throw fail('文本包文件过大。', 413);
        pending += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end); pending = pending.slice(end + 1);
          if (!line || line.length > 8192) throw fail('文本包条目长度无效。', 422);
          yield parse(line);
        }
        if (pending.length > 8192) throw fail('文本包条目长度无效。', 422);
      }
      pending += decoder.decode();
      if (pending) yield parse(pending);
      checkTotals(totals, manifest.metadata);
    } catch (error) {
      if (error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') throw fail('文本包字符编码损坏。', 422);
      throw error;
    } finally { stream.destroy(); await handle.close().catch(() => {}); }
  }
  async function atomicManifest(path, value) {
    const temporary = join(path, `.manifest-${randomUUID()}.tmp`);
    const body = JSON.stringify({ version: 1, metadata: value.metadata, entriesFile: value.entriesFile });
    if (Buffer.byteLength(body) > MAX_MANIFEST_BYTES) throw fail('文本包资料过大。', 413);
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600); await handle.writeFile(body); await handle.sync(); await handle.close(); handle = null;
      await rename(temporary, join(path, 'manifest.json'));
    } finally { await handle?.close().catch(() => {}); await rm(temporary, { force: true }); }
  }
  async function writeEntries(path, values, signal) {
    const handle = await open(path, 'wx', 0o600);
    const totals = entryTotals(); let bytes = 0;
    try {
      for await (const raw of values) {
        assertActive(signal);
        const entry = validateEntry(raw); countEntry(totals, entry);
        const line = `${JSON.stringify(entry)}\n`; bytes += Buffer.byteLength(line);
        if (bytes > MAX_FILE_BYTES) throw fail('文本包文件过大，请拆分文档。', 413);
        await handle.writeFile(line);
      }
      assertActive(signal); await handle.sync(); return totals;
    } finally { await handle.close(); }
  }
  async function trash(id) {
    packId(id); await safeDirectory(join(root, id));
    await safeDirectory(join(root, 'trash'), true);
    await rename(join(root, id), join(root, 'trash', `${id}-${Date.now()}-${randomUUID()}`));
  }
  async function inventory() {
    const packs = [];
    for (const item of await readdir(root, { withFileTypes: true })) {
      if (!UUID.test(item.name)) continue;
      if (item.isSymbolicLink()) throw fail('文本库含有外部目录链接，请移除链接后重试。');
      if (!item.isDirectory()) continue;
      const manifest = await readManifest(item.name);
      if (manifest.metadata.draft && Date.now() - manifest.metadata.createdAt >= DAY) await trash(item.name);
      else packs.push(manifest.metadata);
    }
    return packs.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }
  async function activeManifest(id) {
    const manifest = await readManifest(id);
    if (manifest.metadata.draft && Date.now() - manifest.metadata.createdAt >= DAY) { await trash(id); throw fail('草稿已到期，请重新导入。', 404); }
    return manifest;
  }
  function serial(fn) {
    if (closed) return Promise.reject(fail('文本库已关闭。', 503));
    const next = tail.then(async () => { if (closed) throw fail('文本库已关闭。', 503); await safeDirectory(root, true); return fn(); });
    tail = next.catch(() => {}); return next;
  }
  function scope(signal) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    controllers.add(controller);
    return { signal: controller.signal, close() { signal?.removeEventListener('abort', cancel); controllers.delete(controller); } };
  }
  async function page(id, options) {
    const requested = pagination(options);
    const manifest = await activeManifest(id);
    const selected = []; let total = 0;
    for await (const entry of entries(manifest)) {
      if (requested.kind && entry.kind !== requested.kind || requested.query && !`${entry.text}\n${entry.speaker || ''}\n${entry.source.chapter}`.toLocaleLowerCase().includes(requested.query)) continue;
      if (total >= requested.offset && selected.length < requested.limit) selected.push(entry);
      total++;
    }
    return { pack: manifest.metadata, entries: selected, total, offset: requested.offset, limit: requested.limit };
  }
  return {
    list: () => serial(async () => ({ packs: await inventory() })),
    page: (id, options = {}) => serial(() => page(id, options)),
    extract: (input, { signal } = {}) => {
      if (extracting) return Promise.reject(fail('正在提取另一份文档，请完成后再导入。', 409));
      extracting = true;
      return serial(async () => {
      keys(input, ['text', 'fileBase64', 'name', 'title', 'mode'], '提取参数');
      if (!['dialogue', 'reading'].includes(input.mode)) throw fail('请选择对白提取或完整阅读分段。');
      const hasText = Object.hasOwn(input, 'text'), hasFile = Object.hasOwn(input, 'fileBase64');
      if (hasText === hasFile) throw fail('请只提供粘贴文本或一个文件。');
      if (input.name !== undefined) filename(input.name);
      if (input.title !== undefined) string(input.title, 80, '文本包标题');
      const operation = scope(signal); let temporary;
      try {
        assertActive(operation.signal);
        if ((await inventory()).filter(pack => pack.draft).length >= 3) throw fail('最多保留3份草稿，请先保存或删除一份。', 409);
        const jsonImport = extname(input.name || '').toLowerCase() === '.json';
        if (hasFile) validateBase64(input.fileBase64);
        // The parser decodes regular documents itself. Only JSON imports need
        // a library-owned buffer; retaining a second book-sized copy is wasteful.
        const buffer = jsonImport && hasFile ? decodeBase64(input.fileBase64) : null;
        if (hasText && typeof input.text !== 'string') throw fail('粘贴文本格式无效。');
        if (hasText && (jsonImport ? Buffer.byteLength(input.text) > MAX_FILE_BYTES : input.text.length > MAX_TEXT_CHARACTERS)) throw fail(jsonImport ? 'JSON文本包不能超过20 MiB。' : '原文不能超过1000000字。', 413);
        const id = randomUUID(), now = Date.now();
        let metadata, values;
        if (jsonImport) {
          let portable;
          try { portable = JSON.parse(hasFile ? new TextDecoder('utf-8', { fatal: true }).decode(buffer) : input.text); } catch { throw fail('JSON文本包格式无效。'); }
          const valid = validatePortable(portable);
          metadata = { ...valid.metadata, id, draft: true, title: input.title?.trim() || valid.metadata.title, createdAt: now, updatedAt: now };
          values = valid.entries;
        } else {
          const document = await parseDocument(hasText ? { text: input.text, ...(input.name !== undefined ? { name: input.name } : {}) } : { fileBase64: input.fileBase64, name: input.name }, { signal: operation.signal });
          assertActive(operation.signal);
          if (!object(document) || !Array.isArray(document.sections) || !Array.isArray(document.warnings)) throw fail('文档解析结果无效。', 422);
          let characters = 0;
          for (const section of document.sections) { if (!object(section) || typeof section.text !== 'string') throw fail('文档段落格式无效。'); characters += section.text.length; }
          metadata = { id, title: input.title?.trim() || filename(document.sourceName).replace(/\.[^.]+$/, '').slice(0, 80), draft: true, mode: input.mode, sourceName: document.sourceName, sourceFormat: document.format, sourceCharacters: characters, totalEntries: 0, createdAt: now, updatedAt: now, warnings: document.warnings, stats: { dialogue: 0, narration: 0, duplicates: 0 } };
          validateMetadata(metadata);
          values = extractTextEntries(document.sections, input.mode);
        }
        temporary = await mkdtemp(join(root, '.extract-'));
        const entriesFile = `entries-${randomUUID()}.ndjson`;
        const totals = await writeEntries(join(temporary, entriesFile), values, operation.signal);
        if (!jsonImport) metadata = { ...metadata, totalEntries: totals.count, stats: totals.stats, warnings: [...metadata.warnings, ...(totals.count === 0 && input.mode === 'dialogue' ? ['未识别到明确对白，可切换完整阅读分段。'] : [])].slice(0, 20) };
        checkTotals(totals, metadata); validateMetadata(metadata);
        await atomicManifest(temporary, { metadata, entriesFile });
        assertActive(operation.signal);
        await rename(temporary, join(root, id)); temporary = null;
        return page(id, {});
      } finally { operation.close(); if (temporary) await rm(temporary, { recursive: true, force: true }); }
      }).finally(() => { extracting = false; });
    },
    save: (id, input = {}) => serial(async () => {
      keys(input, ['title'], '保存参数');
      const title = string(input.title, 80, '文本包标题').trim();
      const manifest = await activeManifest(id);
      if (manifest.metadata.draft && (await inventory()).filter(pack => !pack.draft).length >= 30) throw fail('最多保存30个文本包，请先删除一个。', 409);
      for await (const entry of entries(manifest)) { void entry; }
      const metadata = { ...manifest.metadata, title, draft: false, updatedAt: Math.max(Date.now(), manifest.metadata.createdAt) };
      await atomicManifest(manifest.path, { ...manifest, metadata }); return { pack: metadata };
    }),
    select: (id, input) => serial(async () => {
      const ids = selection(input, 40), selected = [];
      for await (const entry of entries(await activeManifest(id))) if (ids.delete(entry.id)) selected.push(entry);
      if (ids.size) throw fail('所选条目不存在，请刷新列表。', 404);
      return { entries: selected };
    }),
    applyLabels: (id, labels) => serial(async () => {
      if (!Array.isArray(labels) || !labels.length || labels.length > 8) throw fail('每次只能标注1至8条语料。');
      const byId = new Map();
      for (const label of labels) {
        keys(label, ['id', 'category', 'speaker'], '分类结果');
        if (typeof label.id !== 'string' || !ENTRY_ID.test(label.id) || byId.has(label.id) || label.category === undefined && label.speaker === undefined) throw fail('分类条目编号无效或重复。');
        if (label.category !== undefined && !CATEGORIES.has(label.category)) throw fail('语料分类无效。');
        if (label.speaker !== undefined) { string(label.speaker, 80, '说话人', true); if (/[\r\n]/.test(label.speaker)) throw fail('说话人格式无效。'); }
        byId.set(label.id, label);
      }
      const manifest = await activeManifest(id), selected = [];
      const entriesFile = `entries-${randomUUID()}.ndjson`, path = join(manifest.path, entriesFile);
      let committed = false;
      try {
        const updated = async function* () {
          for await (const entry of entries(manifest)) {
            const label = byId.get(entry.id);
            if (!label) { yield entry; continue; }
            byId.delete(entry.id);
            const next = { ...entry, ...(label.category !== undefined ? { category: label.category } : {}), ...(label.speaker !== undefined ? { speaker: label.speaker } : {}) };
            selected.push(next); yield next;
          }
          if (byId.size) throw fail('所选条目不存在，请刷新列表。', 404);
        };
        const totals = await writeEntries(path, updated()); checkTotals(totals, manifest.metadata);
        const metadata = { ...manifest.metadata, updatedAt: Math.max(Date.now(), manifest.metadata.createdAt) };
        await atomicManifest(manifest.path, { metadata, entriesFile }); committed = true;
        await rm(join(manifest.path, manifest.entriesFile), { force: true });
        return { entries: selected };
      } finally { if (!committed) await rm(path, { force: true }); }
    }),
    remove: id => serial(async () => { await trash(id); return { ok: true }; }),
    export: (id, format = 'json') => serial(async () => {
      if (!['json', 'txt'].includes(format)) throw fail('请选择JSON或TXT导出格式。');
      const manifest = await activeManifest(id);
      // Validate before the HTTP layer sends download headers. Keep a descriptor
      // to this committed generation so later edits/deletions cannot race it.
      for await (const entry of entries(manifest)) { void entry; }
      const handle = await readable(join(manifest.path, manifest.entriesFile), MAX_FILE_BYTES);
      const body = Readable.from((async function* () {
        let first = true, previous;
        try {
          if (format === 'json') yield `{"format":"muyu-text-pack","version":1,"metadata":${JSON.stringify(manifest.metadata)},"entries":[`;
          for await (const entry of entries(manifest, { handle })) {
            if (format === 'json') yield `${first ? '' : ','}${JSON.stringify(entry)}`;
            else if (manifest.metadata.mode === 'dialogue') yield `${entry.text}\n`;
            else {
              if (previous && entry.source.offsetStart === 0 && !/[\r\n]$/.test(previous.text)) yield '\n';
              yield entry.text;
            }
            first = false; previous = entry;
          }
          if (format === 'json') yield ']}';
        } finally { await handle.close().catch(() => {}); }
      })());
      exports.add(body);
      body.once('close', () => { exports.delete(body); void handle.close().catch(() => {}); });
      return { body, contentType: format === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', filename: `${manifest.metadata.title.replace(/[\\/:*?"<>|\r\n]/g, '_')}.${format}` };
    }),
    async close() { closed = true; for (const controller of controllers) controller.abort(); for (const stream of exports) stream.destroy(); await tail; for (const stream of exports) stream.destroy(); },
  };
}
