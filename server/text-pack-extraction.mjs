export const MAX_TEXT_CHARACTERS = 1000000;
export const MAX_TEXT_ENTRIES = 10000;
export const TEXT_ENTRY_LENGTH = 240;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const quotes = new Map([['“', '”'], ['「', '」'], ['『', '』'], ['‘', '’'], ['"', '"'], ["'", "'"]]);
const word = character => /[\p{L}\p{N}]/u.test(character || '');

function lineStarts(text) {
  const starts = [0];
  for (const match of text.matchAll(/\r\n|\r|\n/g)) starts.push(match.index + match[0].length);
  return starts;
}
function paragraphAt(starts, offset, base) {
  let low = 0, high = starts.length;
  while (low + 1 < high) { const middle = (low + high) >>> 1; if (starts[middle] <= offset) low = middle; else high = middle; }
  return base + low;
}
function* segments(text, start = 0, end = text.length) {
  while (start < end) {
    let next = Math.min(start + TEXT_ENTRY_LENGTH, end);
    if (next < end) {
      if (/[\uD800-\uDBFF]/u.test(text[next - 1])) next--;
      for (let index = next - 1; index >= start + 120; index--) {
        if (/[。！？!?；;\n\r]/u.test(text[index])) { next = index + 1; break; }
      }
    }
    yield { text: text.slice(start, next), start, end: next };
    start = next;
  }
}
function trimRange(text, start, end) {
  while (start < end && /\s/u.test(text[start])) start++;
  while (end > start && /\s/u.test(text[end - 1])) end--;
  return { start, end };
}
function closingQuote(text, start, end) {
  const opening = text[start], closing = quotes.get(opening);
  let depth = 1;
  for (let index = start + 1; index < end; index++) {
    if (text[index - 1] === '\\' || /['’]/u.test(text[index]) && word(text[index - 1]) && word(text[index + 1])) continue;
    if (text[index] === opening && opening !== closing) depth++;
    if (text[index] === closing && --depth === 0) return index;
  }
  return -1;
}
function chapterMarkers(text) {
  const markers = [];
  for (const line of text.matchAll(/[^\r\n]+/g)) if (/^\s*(?:第[零〇一二三四五六七八九十百千万两\d]+[章节回卷部](?:\s|[：:]|$)|Chapter\s+(?:\d+|[IVXLCDM]+)(?:\s|[：:.]|$)|#{1,6}\s+\S)/iu.test(line[0]) && line[0].trim().length <= 200)
    markers.push({ offset: line.index, title: line[0].trim().replace(/^#{1,6}\s+/, '') });
  return markers;
}
function dialogueRanges(text) {
  const candidates = [], consumed = [];
  for (const line of text.matchAll(/[^\r\n]+/g)) {
    const match = line[0].match(/^\s*([\p{L}][\p{L}\p{N} .·_-]{0,31})\s*[：:]\s*(.+)$/u);
    if (!match || /^(?:chapter|page|title|author|http|https)(?:\s|\d|$)|^(?:第.+[章节回]|标题|作者|目录|章节|日期|时间|说明|注意|旁白|网址)$/iu.test(match[1].trim())) continue;
    const bodyAt = line[0].length - match[2].length;
    let { start, end } = trimRange(text, line.index + bodyAt, line.index + line[0].length);
    let consumedEnd = line.index + line[0].length;
    if (quotes.has(text[start])) {
      const closing = closingQuote(text, start, end);
      if (closing >= 0) { consumedEnd = closing + 1; ({ start, end } = trimRange(text, start + 1, closing)); }
    }
    if (!word(text.slice(start, end))) continue;
    candidates.push({ start, end, speaker: match[1].trim().replace(/(?:说道|回答|问道|说|问)$/, '') || match[1].trim() });
    consumed.push({ start: line.index, end: consumedEnd });
  }
  let active = null, depth = 0, skip = 0;
  for (let index = 0; index < text.length; index++) {
    while (skip < consumed.length && consumed[skip].end <= index) skip++;
    if (skip < consumed.length && consumed[skip].start <= index) { index = consumed[skip].end - 1; active = null; depth = 0; continue; }
    const character = text[index];
    if (index && text[index - 1] === '\\') continue;
    if (active) {
      if (/['’]/u.test(character) && word(text[index - 1]) && word(text[index + 1])) continue;
      if (character === active.open && active.open !== active.close) depth++;
      if (character !== active.close) continue;
      if (--depth) continue;
      const range = trimRange(text, active.start + 1, index);
      if (word(text.slice(range.start, range.end))) candidates.push(range);
      active = null;
    } else if (quotes.has(character) && !(character === "'" && word(text[index - 1]))) {
      active = { open: character, close: quotes.get(character), start: index }; depth = 1;
    }
  }
  return candidates.sort((a, b) => a.start - b.start);
}

/** A transient extraction iterator; the library writes entries directly to disk. */
export function* extractTextEntries(sections, mode) {
  if (!['dialogue', 'reading'].includes(mode)) throw fail('请选择对白提取或完整阅读分段。');
  if (!Array.isArray(sections) || !sections.length) throw fail('文档没有可提取的文字。', 422);
  let characters = 0;
  for (const section of sections) {
    if (!section || typeof section.text !== 'string') throw fail('文档段落格式无效。');
    characters += section.text.length;
    if (characters > MAX_TEXT_CHARACTERS) throw fail('解码后的文字不能超过1000000字，请拆分文档。', 413);
  }
  let count = 0;
  const phraseByText = new Map();
  for (const section of sections) {
    const text = section.text;
    const starts = lineStarts(text);
    const chapters = chapterMarkers(text);
    const chapterStarts = chapters.map(chapter => chapter.offset);
    const sourceAt = (start, end) => {
      const chapter = chapters[paragraphAt(chapterStarts, start, 0)];
      return { chapter: chapter && chapter.offset <= start ? chapter.title : section.chapter || '正文', ...(section.page !== undefined ? { page: section.page } : {}), paragraph: paragraphAt(starts, start, section.paragraph || 1), offsetStart: start, offsetEnd: end };
    };
    if (mode === 'reading') {
      // Keep line endings with the preceding paragraph, including blank lines.
      // The offsets and concatenated text therefore retain the original input.
      let cursor = 0, found = false;
      for (const paragraph of text.matchAll(/[^\r\n]+(?:\r\n|\r|\n)*/g)) {
        found = true;
        const end = paragraph.index + paragraph[0].length;
        for (const piece of segments(text, cursor, end)) {
          if (++count > MAX_TEXT_ENTRIES) throw fail('文本包超过10000条，请拆分文档后重试。', 413);
          yield { id: `entry-${String(count).padStart(6, '0')}`, text: piece.text, kind: 'narration', category: 'fallback', source: sourceAt(piece.start, piece.end) };
        }
        cursor = end;
      }
      if (!found && text) for (const piece of segments(text)) {
        if (++count > MAX_TEXT_ENTRIES) throw fail('文本包超过10000条，请拆分文档后重试。', 413);
        yield { id: `entry-${String(count).padStart(6, '0')}`, text: piece.text, kind: 'narration', category: 'fallback', source: sourceAt(piece.start, piece.end) };
      }
    } else {
      for (const range of dialogueRanges(text)) {
        const phrase = text.slice(range.start, range.end);
        const existing = phraseByText.get(phrase);
        if (existing) { existing.occurrences++; continue; }
        if (phraseByText.size >= MAX_TEXT_ENTRIES) throw fail('文本包超过10000条，请拆分文档后重试。', 413);
        phraseByText.set(phrase, { occurrences: 1, ...(range.speaker ? { speaker: range.speaker } : {}), text, range, sourceAt });
      }
    }
  }
  // Deduplicate whole utterances before splitting long ones. Identical chunks
  // within one long utterance must not disappear from that utterance's order.
  for (const candidate of phraseByText.values()) for (const piece of segments(candidate.text, candidate.range.start, candidate.range.end)) {
    if (++count > MAX_TEXT_ENTRIES) throw fail('文本包超过10000条，请拆分文档后重试。', 413);
    yield { id: `entry-${String(count).padStart(6, '0')}`, text: piece.text, kind: 'dialogue', category: 'fallback', ...(candidate.speaker ? { speaker: candidate.speaker } : {}), source: candidate.sourceAt(piece.start, piece.end), occurrences: candidate.occurrences };
  }
}
