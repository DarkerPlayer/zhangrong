export const MEMORY_VERSION = 1;
export const MEMORY_KINDS = Object.freeze(["fact", "preference", "event", "plan"]);
export const EXPERIENCE_KINDS = Object.freeze(["date", "movie", "focus", "support", "plan", "activity"]);
export const COMPANION_MOODS = Object.freeze(["calm", "happy", "tired", "playful"]);
const DAY = 24 * 60 * 60 * 1000;
const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const timestamp = (value, fallback = Date.now()) => Number.isFinite(value) && value > 0 ? Math.min(value, Date.now()) : fallback;
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const textKey = (text) => text.replace(/[\s。.!！?？,，;；]/g, "").toLocaleLowerCase();
const localDate = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const nameOf = (entry) => entry.kind === "fact" && /^用户称呼[：:]/.test(entry.text) ? clean(entry.text.slice(5), 24) : "";

export function normalizeMemoryEntries(items) {
  const byId = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const item = object(raw);
    const text = clean(item.text, 240);
    if (!text || !MEMORY_KINDS.includes(item.kind)) continue;
    const createdAt = timestamp(item.createdAt);
    const id = clean(item.id, 100) || makeId();
    byId.set(id, { id, kind: item.kind, text, createdAt, updatedAt: Math.max(createdAt, timestamp(item.updatedAt, createdAt)), status: item.status === "done" ? "done" : "active", source: item.source === "chat" ? "chat" : "manual" });
  }
  const byText = new Map();
  for (const entry of byId.values()) byText.set(`${entry.kind}:${textKey(entry.text)}`, entry);
  return [...byText.values()].slice(-80);
}

export function normalizeCompanionMemories(value = {}) {
  const source = object(value);
  let entries;
  if (Array.isArray(source.entries)) entries = normalizeMemoryEntries(source.entries);
  else {
    const legacy = [];
    const userName = clean(source.userName, 24);
    if (userName) legacy.push({ id: "legacy-name", kind: "fact", text: `用户称呼：${userName}` });
    for (const [field, kind] of [["preferences", "preference"], ["relationshipFacts", "event"]]) {
      for (const [index, value] of (Array.isArray(source[field]) ? source[field].slice(-20) : []).entries()) {
        const text = clean(value, 120);
        if (text) legacy.push({ id: `legacy-${field}-${index}`, kind, text: kind === "preference" && !/^喜欢|^不喜欢/.test(text) ? `喜欢${text}` : text });
      }
    }
    entries = normalizeMemoryEntries(legacy);
  }
  return {
    userName: entries.map(nameOf).filter(Boolean).at(-1) || "",
    preferences: entries.filter((entry) => entry.kind === "preference").map((entry) => entry.text.replace(/^喜欢/, "").slice(0, 120)).slice(-20),
    relationshipFacts: entries.filter((entry) => entry.kind === "event").map((entry) => entry.text.slice(0, 120)).slice(-20),
    entries,
  };
}

export function upsertCompanionMemory(value, patch = {}) {
  const memories = normalizeCompanionMemories(value);
  const previous = memories.entries.find((entry) => entry.id === patch.id);
  const entry = normalizeMemoryEntries([{ ...previous, ...object(patch), id: previous?.id || patch.id || makeId(), createdAt: previous?.createdAt || patch.createdAt || Date.now(), updatedAt: Date.now() }])[0];
  if (!entry) return memories;
  const isName = Boolean(nameOf(entry));
  const entries = memories.entries.filter((item) => item.id !== entry.id && !(isName && nameOf(item)) && !(item.kind === entry.kind && textKey(item.text) === textKey(entry.text)));
  return normalizeCompanionMemories({ entries: [...entries, entry].slice(-80) });
}

/** Deliberately anchored: quoted, hypothetical, negative and interrogative lines do not establish facts. */
export function extractCompanionMemories(content, createdAt = Date.now()) {
  if (typeof content !== "string") return [];
  const entries = [];
  for (const sentence of content.match(/[^。！？!?；;\n]+[。！？!?；;]?/gu) || []) {
    const text = sentence.trim().replace(/[。；;]$/, "").trim();
    if (/[？?]|[“”「」『』"`]|(?:如果|假如|假设|也许|可能|是不是|是否|什么|吗|的话)/u.test(text)) continue;
    const name = text.match(/^(?:以后)?(?:叫我|我叫|我的名字是|我的昵称是)\s*([\p{L}\p{N}_·]{1,24}?)(?:就好|好吗|吧|呀|哦|啦)?[！!]?$/u);
    if (name && !/^(?:以后)?我叫(?:了|你|他|她|它|我们|外卖|出租|救护|一辆|一份)/.test(text)) entries.push({ kind: "fact", text: `用户称呼：${name[1]}` });
    const preference = text.match(/^我(?:最|很|特别)?喜欢([^，,！!]{1,120})[！!]?$/u);
    if (preference && !/(?:还是|或者|不喜欢|并不|才怪|别人说)/.test(preference[1])) entries.push({ kind: "preference", text: `喜欢${preference[1].trim()}` });
    const plan = text.match(/^(?:我(?:们)?(?:计划|打算|准备)|(?:我(?:们)?)(?:明天|后天|周[一二三四五六日末天]|下周|下个月)[^，,]{0,12}要)([^，,！!]{2,120})[！!]?$/u);
    if (plan && !/^我(?:们)?准备(?:好|完|齐)/.test(text)) entries.push({ kind: "plan", text: text.replace(/[！!]$/, "") });
  }
  return entries.map((entry) => ({ ...entry, id: makeId(), createdAt, updatedAt: createdAt, status: "active", source: "chat" }));
}

export function rememberCompanionStatement(memories, content, createdAt = Date.now()) {
  return extractCompanionMemories(content, createdAt).reduce((result, entry) => upsertCompanionMemory(result, entry), normalizeCompanionMemories(memories));
}

function cleanExperience(raw) {
  const source = object(raw);
  const title = clean(source.title, 80);
  if (!EXPERIENCE_KINDS.includes(source.kind) || !title) return null;
  return { id: clean(source.id, 105) || makeId(), kind: source.kind, title, detail: clean(source.detail, 240), createdAt: timestamp(source.createdAt) };
}
const experienceKey = (entry) => `${entry.kind}:${textKey(entry.title)}:${localDate(entry.createdAt)}`;
const experienceText = (entry) => `${entry.title}${entry.detail && entry.detail !== entry.title ? `：${entry.detail}` : ""}`.slice(0, 240);
export function normalizeRelationship(value = {}) {
  const source = object(value);
  const ids = new Set();
  const experiences = [];
  for (const raw of Array.isArray(source.experiences) ? source.experiences : []) {
    const entry = cleanExperience(raw);
    if (!entry || ids.has(entry.id)) continue;
    ids.add(entry.id); experiences.push(entry);
  }
  const recorded = Object.fromEntries(EXPERIENCE_KINDS.map((kind) => [kind, experiences.filter((entry) => entry.kind === kind).length]));
  const kindCounts = Object.fromEntries(EXPERIENCE_KINDS.map((kind) => [kind, Math.max(recorded[kind], Math.min(1000000, Math.max(0, Math.floor(Number(source.kindCounts?.[kind]) || 0))))]));
  // Only opaque IDs remain when a plan is removed or reopened. No deleted text
  // is retained, and toggling a plan cannot award growth a second time.
  const completedPlanIds = [...new Set([
    ...(Array.isArray(source.completedPlanIds) ? source.completedPlanIds : []).map((id) => clean(id, 100)).filter(Boolean),
    ...experiences.filter((entry) => entry.kind === "plan" && entry.id.startsWith("plan:")).map((entry) => entry.id.slice(5)),
  ])].slice(-80);
  return { experiences: experiences.slice(-60), completedCount: Object.values(kindCounts).reduce((sum, count) => sum + count, 0), kindCounts, completedPlanIds };
}

export function syncPlanExperiences(value, memories) {
  const relationship = normalizeRelationship(value);
  const plans = new Map(normalizeCompanionMemories(memories).entries.filter((entry) => entry.kind === "plan" && entry.status === "done").map((entry) => [`plan:${entry.id}`, entry]));
  return { ...relationship, experiences: relationship.experiences.flatMap((entry) => {
    if (entry.kind !== "plan" || !entry.id.startsWith("plan:")) return [entry];
    const plan = plans.get(entry.id);
    if (!plan) return [];
    return experienceText(entry) === plan.text ? [entry] : [{ ...entry, title: plan.text.slice(0, 80), detail: plan.text }];
  }) };
}

export function addCompanionExperience(value, input) {
  const relationship = normalizeRelationship(value);
  const entry = cleanExperience(input);
  // Explicit IDs distinguish real sessions (for example two focus timers).
  // Manual submissions have no ID, so accidental repeat clicks use date/text.
  if (!entry || relationship.experiences.some((item) => item.id === entry.id || !clean(input?.id, 105) && experienceKey(item) === experienceKey(entry))) return relationship;
  const planId = entry.kind === "plan" && entry.id.startsWith("plan:") ? entry.id.slice(5) : "";
  const increment = planId && relationship.completedPlanIds.includes(planId) ? 0 : 1;
  return {
    experiences: [...relationship.experiences, entry].slice(-60),
    completedCount: relationship.completedCount + increment,
    kindCounts: { ...relationship.kindCounts, [entry.kind]: relationship.kindCounts[entry.kind] + increment },
    completedPlanIds: planId ? [...new Set([...relationship.completedPlanIds, planId])].slice(-80) : relationship.completedPlanIds,
  };
}

const STAGES = Object.freeze([
  { stage: "new", label: "初识", description: "从真实完成的小事开始，慢慢了解彼此。", count: 0, kinds: 0, unlocks: [] },
  { stage: "familiar", label: "熟悉", description: "已经积累了一些共同经历，彼此更熟悉。", count: 3, kinds: 2, unlocks: ["回顾共同经历"] },
  { stage: "close", label: "默契", description: "多种共同经历，让陪伴逐渐形成默契。", count: 8, kinds: 3, unlocks: ["回顾共同经历", "一起制定下一次计划"] },
  { stage: "trusted", label: "相伴", description: "持续完成不同的共同经历，留下稳定的陪伴记录。", count: 16, kinds: 4, unlocks: ["回顾共同经历", "一起制定下一次计划", "回顾陪伴里程碑"] },
]);
export function getRelationshipSummary(thread = {}) {
  const relationship = normalizeRelationship(thread?.relationship);
  const kinds = Object.values(relationship.kindCounts).filter((count) => count > 0).length;
  const stage = STAGES.filter((item) => relationship.completedCount >= item.count && kinds >= item.kinds).at(-1);
  const next = STAGES[STAGES.indexOf(stage) + 1];
  return { stage: stage.stage, label: stage.label, description: stage.description, completedCount: relationship.completedCount, nextHint: next ? `再完成${Math.max(0, next.count - relationship.completedCount)}次共同经历，并覆盖${next.kinds}种不同活动，可以走到“${next.label}”。` : "继续记录真正完成的共同经历，离线不会让关系倒退。", unlocks: [...stage.unlocks] };
}

export function normalizeCompanionMood(profile = {}, now = Date.now()) {
  const updatedAt = Number(profile?.moodUpdatedAt);
  return COMPANION_MOODS.includes(profile?.mood) && Number.isFinite(updatedAt) && updatedAt > 0 && now >= updatedAt && now - updatedAt < DAY ? profile.mood : "calm";
}

export const isCompletedPlanQuery = (message) => /已经完成|已完成|完成了/.test(message) && !/未|没/.test(message);
function relevance(entry, message) {
  const query = clean(message, 2000).toLowerCase();
  const text = entry.text.toLowerCase();
  let score = 0;
  const keywords = [...new Set(query.match(/[a-z0-9]{2,}|[\u3400-\u9fff]{2}/g) || [])];
  for (const word of keywords) if (text.includes(word)) score += 4;
  // Overlapping bigrams retain Chinese nouns across question boundaries.
  for (let index = 0; index + 1 < query.length; index++) if (/^[\u3400-\u9fff]{2}$/.test(query.slice(index, index + 2)) && text.includes(query.slice(index, index + 2))) score += 2;
  if (/名字|称呼|我叫/.test(query) && nameOf(entry)) score += 100;
  else if (nameOf(entry)) score += 20;
  if (/喜欢|偏好/.test(query) && entry.kind === "preference") score += 50;
  if (/计划|打算|约定|待办/.test(query) && entry.kind === "plan") {
    score += 50;
    if (isCompletedPlanQuery(query)) score += entry.status === "done" ? 100 : -100;
  }
  if (/经历|一起做|一起完成|共同|发生|相处记录|里程碑/.test(query) && (entry.kind === "event" || entry.kind === "plan" && entry.status === "done")) score += 50;
  if (entry.kind === "plan" && entry.status === "active") score += 12;
  return score;
}
export function buildCompanionContext(thread = {}, message = "", profile = {}) {
  const entries = normalizeCompanionMemories(thread?.memories).entries;
  const experiences = syncPlanExperiences(thread?.relationship, { entries }).experiences
    .filter((entry) => !entries.some((memory) => entry.id === `plan:${memory.id}`))
    .map((entry) => ({ kind: "event", text: experienceText(entry), status: "done", createdAt: entry.createdAt, updatedAt: entry.createdAt }));
  const memories = [...entries, ...experiences]
    .map((entry, index) => ({ entry, score: relevance(entry, message), index }))
    .sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt || b.index - a.index)
    .slice(0, 6).map(({ entry: { kind, text, status, createdAt } }) => ({ kind, text, status, recordedOn: localDate(createdAt) }));
  const { stage, label, completedCount } = getRelationshipSummary(thread);
  return { memories, relationship: { stage, label, completedCount }, personality: clean(profile?.personality, 500), mood: normalizeCompanionMood(profile) };
}

/** Strict request boundary; labels are derived from known stages rather than client prose. */
export function normalizeCompanionContext(value) {
  if (value == null) return null;
  const fail = () => { throw Object.assign(new TypeError("陪伴记忆格式无效。"), { status: 400 }); };
  if (value !== object(value)) fail();
  if (!Array.isArray(value.memories) || value.memories.length > 6) fail();
  const memories = value.memories.map((entry) => {
    if (entry !== object(entry) || !MEMORY_KINDS.includes(entry.kind) || !["active", "done"].includes(entry.status) || typeof entry.text !== "string" || !entry.text.trim() || entry.text.length > 240) fail();
    if (entry.recordedOn !== undefined && (typeof entry.recordedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.recordedOn) || !Number.isFinite(Date.parse(`${entry.recordedOn}T00:00:00Z`)) || new Date(`${entry.recordedOn}T00:00:00Z`).toISOString().slice(0, 10) !== entry.recordedOn)) fail();
    return { kind: entry.kind, text: entry.text.trim(), status: entry.status, ...(entry.recordedOn !== undefined ? { recordedOn: entry.recordedOn } : {}) };
  });
  const relation = object(value.relationship);
  const stage = STAGES.find((entry) => entry.stage === relation.stage);
  if (!stage || !Number.isInteger(relation.completedCount) || relation.completedCount < 0 || relation.completedCount > 6000000) fail();
  if (typeof value.personality !== "string" || value.personality.length > 500 || !COMPANION_MOODS.includes(value.mood)) fail();
  return { memories, relationship: { stage: stage.stage, label: stage.label, completedCount: relation.completedCount }, personality: value.personality.trim(), mood: value.mood };
}
