import olderSister from "./personas/older-sister.mjs";
import adultYounger from "./personas/adult-younger.mjs";
import bossGirlfriend from "./personas/boss-girlfriend.mjs";

export const INTIMACY_LEVELS = Object.freeze(["sweet", "mature", "adult"]);
export const DEFAULT_PERSONA_TEMPLATE_ID = "older-sister";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const FORBIDDEN_APPEARANCE_KEYS = new Set([
  "lookId",
  "characterId",
  "modelId",
  "asset",
  "rig",
]);
const COMMON_CATEGORIES = Object.freeze([
  "greeting",
  "daily",
  "comfort",
  "jealousy",
  "praise",
  "goodnight",
  "fallback",
]);
const LEVEL_CATEGORIES = Object.freeze(["affection", "teasing", "seduction"]);
const ACTION_CATEGORIES = Object.freeze(["pat", "wave", "outfit"]);
const ALLOWED_PLACEHOLDERS = new Set(["userName", "personaName"]);

function fail(message) {
  throw new TypeError(message);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function rejectAppearanceBindings(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_APPEARANCE_KEYS.has(key)) fail(`人格不得包含外观绑定字段：${key}`);
    rejectAppearanceBindings(child, seen);
  }
}

function cleanString(value, label, max, { allowEmpty = false } = {}) {
  if (typeof value !== "string") fail(`${label}格式无效。`);
  const text = value.trim();
  if (!allowEmpty && !text) fail(`${label}不能为空。`);
  if (text.length > max) fail(`${label}最多${max}字。`);
  for (const match of text.matchAll(/\{([^{}]+)\}/g))
    if (!ALLOWED_PLACEHOLDERS.has(match[1])) fail(`人格语料包含不允许的占位符：${match[0]}`);
  return text;
}

function cleanLines(value, label, minimum = 0) {
  if (!Array.isArray(value)) fail(`${label}必须是数组。`);
  const lines = value.map((line, index) => cleanString(line, `${label}[${index}]`, 240));
  if (lines.length < minimum) fail(`${label}至少需要${minimum}条语料。`);
  return lines;
}

function cleanIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("人格身份格式无效。");
  return {
    selfDescription: cleanString(value.selfDescription, "人格自述", 500),
    relationshipStyle: cleanString(value.relationshipStyle, "关系风格", 500),
    boundaries: cleanLines(value.boundaries, "人格边界", 1),
  };
}

function cleanSpeechStyle(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("语言风格格式无效。");
  return {
    rhythm: cleanString(value.rhythm, "语言节奏", 300),
    vocabulary: cleanLines(value.vocabulary, "常用词", 1),
    teasingStyle: cleanString(value.teasingStyle, "调侃风格", 300),
    forbiddenPatterns: cleanLines(value.forbiddenPatterns, "禁用表达", 1),
  };
}

function cleanCorpora(value, minimums = true) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("人格语料格式无效。");
  const corpora = {};
  for (const category of COMMON_CATEGORIES)
    corpora[category] = cleanLines(value[category], `语料 ${category}`, minimums ? 4 : 1);
  for (const category of LEVEL_CATEGORIES) {
    if (!value[category] || typeof value[category] !== "object" || Array.isArray(value[category]))
      fail(`语料 ${category} 格式无效。`);
    corpora[category] = Object.fromEntries(
      INTIMACY_LEVELS.map((level) => [
        level,
        cleanLines(value[category][level], `语料 ${category}.${level}`, minimums ? 4 : 1),
      ]),
    );
  }
  if (!value.action || typeof value.action !== "object" || Array.isArray(value.action))
    fail("动作语料格式无效。");
  corpora.action = Object.fromEntries(
    ACTION_CATEGORIES.map((category) => [
      category,
      cleanLines(value.action[category], `动作语料 ${category}`, minimums ? 3 : 1),
    ]),
  );
  return corpora;
}

function textSize(value) {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.reduce((total, item) => total + textSize(item), 0);
  if (value && typeof value === "object")
    return Object.values(value).reduce((total, item) => total + textSize(item), 0);
  return 0;
}

function cleanId(value, label = "人格 ID") {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) fail(`${label}格式无效。`);
  return value;
}

function cleanAge(value) {
  const age = Number(value);
  if (!Number.isInteger(age) || age < 25 || age > 99) fail("人格年龄必须为 25 至 99 岁的整数。");
  return age;
}

function cleanIntimacy(value) {
  if (!INTIMACY_LEVELS.includes(value)) fail("人格亲密等级无效。");
  return value;
}

export function validatePersonaDefinition(value) {
  rejectAppearanceBindings(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("人格定义格式无效。");
  if (value.schemaVersion !== 1) fail("人格定义版本无效。");
  if (value.relationship !== "girlfriend") fail("人格关系必须是 girlfriend。");
  const result = {
    schemaVersion: 1,
    id: cleanId(value.id),
    name: cleanString(value.name, "人格名称", 24),
    age: cleanAge(value.age),
    archetype: cleanString(value.archetype, "人格类型", 60),
    relationship: "girlfriend",
    identity: cleanIdentity(value.identity),
    speechStyle: cleanSpeechStyle(value.speechStyle),
    corpora: cleanCorpora(value.corpora, true),
  };
  if (textSize(result) > 12000) fail("人格文本总量不能超过12000字。");
  return deepFreeze(result);
}

export const PERSONA_TEMPLATES = deepFreeze([
  validatePersonaDefinition(olderSister),
  validatePersonaDefinition(adultYounger),
  validatePersonaDefinition(bossGirlfriend),
]);

const templateById = new Map(PERSONA_TEMPLATES.map((item) => [item.id, item]));

export function getPersonaTemplate(id) {
  return templateById.get(id) || templateById.get(DEFAULT_PERSONA_TEMPLATE_ID);
}

function cloneCorpora(corpora) {
  return {
    ...Object.fromEntries(COMMON_CATEGORIES.map((category) => [category, [...corpora[category]]])),
    ...Object.fromEntries(
      LEVEL_CATEGORIES.map((category) => [
        category,
        Object.fromEntries(INTIMACY_LEVELS.map((level) => [level, [...corpora[category][level]]])),
      ]),
    ),
    action: Object.fromEntries(ACTION_CATEGORIES.map((category) => [category, [...corpora.action[category]]])),
  };
}

function mergeCustomCorpora(corpora, items = []) {
  for (const item of Array.isArray(items) ? items.slice(0, 40) : []) {
    if (!item || item.enabled === false || typeof item.text !== "string") continue;
    const text = cleanString(item.text, "自定义语料", 240);
    const category = [...COMMON_CATEGORIES, ...LEVEL_CATEGORIES].includes(item.category)
      ? item.category
      : "fallback";
    if (LEVEL_CATEGORIES.includes(category)) {
      const level = INTIMACY_LEVELS.includes(item.level) ? item.level : "mature";
      corpora[category][level].push(text);
    } else {
      corpora[category].push(text);
    }
  }
  return corpora;
}

export function resolvePersonaProfile(profile = {}) {
  const template = getPersonaTemplate(profile.templateId || profile.id);
  const snapshot = {
    id: cleanId(profile.id || template.id),
    templateId: template.id,
    name: cleanString(profile.displayName || template.name, "人格名称", 24),
    age: cleanAge(profile.age ?? template.age),
    archetype: template.archetype,
    relationship: "girlfriend",
    identity: template.identity,
    speechStyle: template.speechStyle,
    intimacyLevel: INTIMACY_LEVELS.includes(profile.intimacyLevel) ? profile.intimacyLevel : "mature",
    adultAcknowledged: profile.adultAcknowledged === true,
    corpora: mergeCustomCorpora(cloneCorpora(template.corpora), profile.customCorpora),
  };
  return normalizePersonaSnapshot(snapshot);
}

export function normalizePersonaSnapshot(value) {
  rejectAppearanceBindings(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("人格快照格式无效。");
  const acknowledged = value.adultAcknowledged === true;
  const requestedLevel = cleanIntimacy(value.intimacyLevel);
  const templateId = cleanId(value.templateId, "人格模板 ID");
  if (!templateById.has(templateId)) fail("人格模板不存在。");
  const result = {
    id: cleanId(value.id),
    templateId,
    name: cleanString(value.name, "人格名称", 24),
    age: cleanAge(value.age),
    archetype: cleanString(value.archetype, "人格类型", 60),
    relationship: value.relationship === "girlfriend" ? "girlfriend" : fail("人格关系必须是 girlfriend。"),
    identity: cleanIdentity(value.identity),
    speechStyle: cleanSpeechStyle(value.speechStyle),
    intimacyLevel: requestedLevel === "adult" && !acknowledged ? "mature" : requestedLevel,
    adultAcknowledged: acknowledged,
    corpora: cleanCorpora(value.corpora, false),
  };
  if (textSize(result) > 12000) fail("人格文本总量不能超过12000字。");
  return result;
}

export const PERSONA_CORPUS_CATEGORIES = Object.freeze({
  common: COMMON_CATEGORIES,
  leveled: LEVEL_CATEGORIES,
  action: ACTION_CATEGORIES,
});
