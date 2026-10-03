import { access, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_CHARACTERS = 1_000_000;
const MAX_SECTIONS = 10_000;
const formats = new Map([['.txt', 'txt'], ['.md', 'md'], ['.markdown', 'md'], ['.epub', 'epub'], ['.docx', 'docx'], ['.pdf', 'pdf']]);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const aborted = () => new DOMException('文档解析已取消。', 'AbortError');
const assertActive = signal => { if (signal?.aborted) throw aborted(); };

function sourceFilename(name, fallback) {
  if (name === undefined || name === '') return fallback;
  if (typeof name !== 'string' || /[\x00-\x1f\x7f]/.test(name)) throw fail('文件名格式无效。');
  const value = name.replaceAll('\\', '/').split('/').at(-1);
  if (!value || value.length > 180) throw fail('文件名为空或过长。');
  return value;
}

function cleanText(text) {
  if (text.length > MAX_CHARACTERS) throw fail('文档文字超过 1,000,000 字，请分章导入。', 413);
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ufffd]/.test(text)) throw fail('文档包含乱码或二进制内容，请先保存为 UTF-8 文本。');
  return text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
}

function decodeText(buffer) {
  const encoding = buffer[0] === 0xff && buffer[1] === 0xfe ? 'utf-16le'
    : buffer[0] === 0xfe && buffer[1] === 0xff ? 'utf-16be' : 'utf-8';
  try { return cleanText(new TextDecoder(encoding, { fatal: true }).decode(buffer)); }
  catch (error) {
    if (error.status) throw error;
    throw fail('无法识别文本编码，请先保存为 UTF-8 或带 BOM 的 UTF-16 文件。');
  }
}

function resultFor(data, format, sourceName) {
  if (!Array.isArray(data.sections) || data.sections.length > MAX_SECTIONS) throw fail('文档段落过多或解析结果无效。');
  let characters = 0;
  const sections = data.sections.map((section, index) => {
    if (!section || typeof section.text !== 'string') throw fail('文档解析结果无效。');
    const text = cleanText(section.text);
    characters += text.length;
    if (characters > MAX_CHARACTERS) throw fail('文档文字超过 1,000,000 字，请分章导入。', 413);
    return { text, chapter: typeof section.chapter === 'string' ? section.chapter.slice(0, 160) : sourceName,
      ...(Number.isSafeInteger(section.page) && section.page > 0 ? { page: section.page } : {}),
      paragraph: Number.isSafeInteger(section.paragraph) && section.paragraph > 0 ? section.paragraph : index + 1 };
  }).filter(section => section.text.trim());
  if (!sections.length) throw fail('文档中没有可提取的文字。');
  return { sections, warnings: (Array.isArray(data.warnings) ? data.warnings : []).filter(value => typeof value === 'string').slice(0, 10).map(value => value.slice(0, 200)), format, sourceName };
}

async function defaultPython() {
  const bundled = join(ROOT, '.runtime/voice/python/bin/python3');
  try { await access(bundled, constants.X_OK); return bundled; } catch {}
  // Only source checkouts may use a development interpreter. Delivered apps
  // must remain self-contained and never require installing Python or Office.
  if (!ROOT.includes('/Contents/Resources/app/')) {
    try { await access('/usr/bin/python3', constants.X_OK); return '/usr/bin/python3'; } catch {}
  }
  throw fail('应用内文档解析组件缺失，请重新安装完整应用。', 503);
}

/** The factory allows isolated directories and short deadlines in parser tests. */
export function createDocumentParser({ temporaryRoot = tmpdir(), workerTimeoutMs = 30_000, pythonPath, pdfPath = join(ROOT, '.runtime/documents/pdf-text') } = {}) {
  return async function parseTextDocument(input, { signal } = {}) {
    assertActive(signal);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('请输入文本或选择文件。');
    const hasText = Object.hasOwn(input, 'text'), hasFile = Object.hasOwn(input, 'fileBase64');
    if (hasText === hasFile) throw fail('请只提供粘贴文本或一个文件。');
    const sourceName = sourceFilename(input.name, hasText ? '粘贴文本' : '');
    if (hasText) {
      if (typeof input.text !== 'string') throw fail('文本格式无效。');
      return resultFor({ sections: [{ text: cleanText(input.text), chapter: sourceName, paragraph: 1 }] }, 'txt', sourceName);
    }
    const format = formats.get(extname(sourceName).toLowerCase());
    if (!format) throw fail('仅支持 TXT、MD、EPUB、DOCX 和文字 PDF。', 415);
    const encoded = input.fileBase64;
    if (typeof encoded !== 'string' || !encoded.length) throw fail('文件内容为空或格式无效。');
    if (encoded.length > Math.ceil(MAX_BYTES / 3) * 4) throw fail('文件不能超过 20 MiB。', 413);
    // A repeated four-character regex can exhaust V8's regexp stack on a
    // valid 20 MiB file. Scan a flat alphabet and validate final padding only.
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    if (encoded.length % 4 || /[^A-Za-z0-9+/]/.test(encoded.slice(0, encoded.length - padding))) throw fail('文件 Base64 编码不完整或无效。');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > MAX_BYTES) throw fail('文件不能超过 20 MiB。', 413);
    if (bytes.toString('base64') !== encoded) throw fail('文件 Base64 编码不完整或无效。');
    if (format === 'txt' || format === 'md') return resultFor({ sections: [{ text: decodeText(bytes), chapter: sourceName, paragraph: 1 }] }, format, sourceName);
    if (format === 'pdf' && !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw fail('文件不是有效 PDF。');
    if ((format === 'epub' || format === 'docx') && !bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw fail('文件不是有效 EPUB/DOCX 压缩文档。');
    let directory;
    try {
      assertActive(signal);
      directory = await mkdtemp(join(temporaryRoot, 'muyu-document-'));
      const filename = join(directory, `input.${format}`);
      await writeFile(filename, bytes, { mode: 0o600, signal });
      assertActive(signal);
      const command = format === 'pdf' ? pdfPath : pythonPath || await defaultPython();
      const args = format === 'pdf' ? [filename]
        : ['-I', '-B', fileURLToPath(new URL('./document-worker.py', import.meta.url)), format, filename];
      let stdout;
      try {
        ({ stdout } = await run(command, args, { signal, timeout: workerTimeoutMs, maxBuffer: 8 * 1024 * 1024,
          cwd: dirname(filename), env: { ...process.env, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' } }));
      } catch (error) {
        if (signal?.aborted) throw aborted();
        if (error.killed) throw fail('文档解析超时，请分章或转换为文本后导入。', 408);
        let message;
        try { message = JSON.parse(error.stdout).error; } catch {}
        throw fail(typeof message === 'string' ? message.slice(0, 200) : error.code === 'ENOENT'
          ? '应用内文档解析组件缺失，请重新安装完整应用。' : '文档解析失败，文件可能损坏或格式不受支持。');
      }
      assertActive(signal);
      let data;
      try { data = JSON.parse(stdout); } catch { throw fail('文档解析组件返回了无效结果。'); }
      if (data.error) throw fail(String(data.error).slice(0, 200));
      return resultFor(data, format, sourceName);
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  };
}

export const parseTextDocument = createDocumentParser();
