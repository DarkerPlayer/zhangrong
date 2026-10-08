import { CHARACTER_CORPORA } from './character-corpora.mjs';
import { detectDialogueIntent } from './persona-dialogue.mjs';

const CHARACTER_NAMES = Object.freeze({ 'wen-furen': '温夫人', 'ling-yuling': '凌玉灵', 'mei-ning': '梅凝' });
export const EXCLUSIVE_CORPUS_CHARACTER_IDS = Object.freeze(Object.keys(CHARACTER_NAMES));
export const isExclusiveCorpusCharacter = characterId => Object.hasOwn(CHARACTER_NAMES, characterId);

function verifiedEntries(characterId, catalog) {
  const record = catalog?.[characterId];
  if (record?.characterId !== characterId || !Array.isArray(record.entries)) return [];
  return record.entries.filter(entry => entry && entry.verified === true && entry.kind === 'dialogue'
    && entry.characterId === characterId && entry.speaker === CHARACTER_NAMES[characterId] && typeof entry.id === 'string' && entry.id
    && typeof entry.text === 'string' && entry.text.trim() && entry.text.length <= 2000
    && typeof entry.source?.file === 'string' && entry.source.file.trim());
}

/** Read-only source browser data; shares the same speaker/verification gate. */
export function getExclusiveCorpusEntries(characterId, catalog = CHARACTER_CORPORA) {
  return isExclusiveCorpusCharacter(characterId) ? verifiedEntries(characterId, catalog) : [];
}

export function getExclusiveCorpusStatus(characterId, catalog = CHARACTER_CORPORA) {
  if (!isExclusiveCorpusCharacter(characterId)) return null;
  const count = verifiedEntries(characterId, catalog).length;
  return { characterId, count, policy: 'provided-corpus-only', status: count ? 'ready' : 'empty',
    notice: count ? `仅使用${CHARACTER_NAMES[characterId]}已核验的素材原句。` : `${CHARACTER_NAMES[characterId]}的本人台词尚待核验，暂不自动回复。` };
}

/** Gate every displayed/spoken line too: no nickname replacement or paraphrase. */
export function isAllowedExclusiveCorpusText(characterId, text, catalog = CHARACTER_CORPORA) {
  return !isExclusiveCorpusCharacter(characterId) || verifiedEntries(characterId, catalog).some(entry => entry.text === text);
}

const comparable = value => String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
function scoreEntry(entry, message, intent) {
  let score = intent && intent !== 'fallback' && (entry.category === intent || entry.intents?.includes(intent)) ? 10 : 0;
  const query = comparable(message);
  if (!query) return score;
  const literal = comparable(entry.text);
  if (query.length >= 2 && literal.length >= 2 && (literal.includes(query) || query.includes(literal))) score += 30;
  for (const keyword of Array.isArray(entry.keywords) ? entry.keywords : []) {
    const normalized = comparable(keyword);
    if (normalized.length >= 2 && query.includes(normalized)) score += 20;
  }
  return score;
}

/** Retrieval only. A missing match is a silent status, never a generated fallback. */
export function selectExclusiveCorpusReply({ characterId, message = '', history = [], intent } = {}, catalog = CHARACTER_CORPORA) {
  if (!isExclusiveCorpusCharacter(characterId)) return null;
  const entries = verifiedEntries(characterId, catalog);
  const category = intent || detectDialogueIntent(message);
  const candidates = entries.map(entry => ({ entry, score: scoreEntry(entry, message, category) })).filter(item => item.score > 0);
  const recent = new Set((Array.isArray(history) ? history : []).filter(item => item?.role === 'assistant').slice(-3).map(item => item.content));
  candidates.sort((a, b) => b.score - a.score || Number(recent.has(a.entry.text)) - Number(recent.has(b.entry.text)) || a.entry.id.localeCompare(b.entry.id));
  const entry = candidates[0]?.entry;
  const status = entry ? 'matched' : entries.length ? 'no-match' : 'empty';
  const notice = status === 'matched' ? '本次回复来自已核验的素材原句。' : status === 'empty'
    ? getExclusiveCorpusStatus(characterId, catalog).notice : '当前素材中没有适合这句话的已核验原句，暂不自动回复。';
  return { reply: entry?.text || '', content: entry?.text || '', emotion: 'calm', action: null, lookAction: null,
    petAction: null, motionCommand: null, provider: 'corpus', corpusOnly: true, characterId,
    corpusStatus: status, corpusNotice: notice, corpusSource: entry ? { ...entry.source, entryId: entry.id } : null };
}
