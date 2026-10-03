import {
  DEFAULT_PERSONA_TEMPLATE_ID,
  INTIMACY_LEVELS,
  PERSONA_TEMPLATES,
  getPersonaTemplate,
} from "./personas.mjs";
import {
  MEMORY_VERSION,
  addCompanionExperience,
  normalizeCompanionMemories,
  normalizeCompanionMood,
  normalizeRelationship,
  rememberCompanionStatement,
  syncPlanExperiences,
  upsertCompanionMemory,
} from "./companion-memory.mjs";
import { normalizePersonaAppearance } from "./persona-appearance.mjs";
export { buildCompanionContext, getRelationshipSummary } from "./companion-memory.mjs";

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const cleanText = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function normalizePersonaMessages(items) {
  return (Array.isArray(items) ? items : [])
    .filter(
      (item) =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string" &&
        item.content.trim(),
    )
    .map((item) => ({
      id: typeof item.id === "string" && item.id ? item.id : makeId(),
      role: item.role,
      content: item.content.trim().slice(0, 4000),
      createdAt: Number(item.createdAt) || Date.now(),
      ...(typeof item.provider === "string" ? { provider: item.provider } : {}),
    }));
}

export function normalizePersonaCorpora(items, limit = 40) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item.text === "string" && item.text.trim())
    .map((item) => {
      const text = item.text.trim().slice(0, 240);
      const voiceProfileId = cleanText(item.voiceProfileId, 64);
      return {
        id: typeof item.id === "string" && item.id ? item.id : makeId(),
        title:
          cleanText(item.title, 60) || text.split(/\r?\n/, 1)[0].slice(0, 36),
        text,
        category: [
          "greeting",
          "daily",
          "affection",
          "teasing",
          "seduction",
          "comfort",
          "jealousy",
          "praise",
          "goodnight",
          "fallback",
        ].includes(item.category)
          ? item.category
          : "fallback",
        level: INTIMACY_LEVELS.includes(item.level) ? item.level : "mature",
        enabled: item.enabled !== false,
        createdAt: Number(item.createdAt) || Date.now(),
        ...(voiceProfileId ? { voiceProfileId } : {}),
        ...(normalizeCorpusSource(item.sourcePack) ? {sourcePack: normalizeCorpusSource(item.sourcePack)} : {}),
      };
    })
    .slice(0, limit);
}

function normalizeCorpusSource(value) {
  if (!value || typeof value !== 'object' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id || '') || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value.entryId || '')) return null;
  return {
    id: value.id, entryId: value.entryId,
    title: cleanText(value.title,80), sourceName: cleanText(value.sourceName,160),
    chapter: cleanText(value.chapter,160), speaker: cleanText(value.speaker,60),
    ...(Number.isSafeInteger(value.page) && value.page>0 ? {page:value.page} : {}),
    ...(Number.isSafeInteger(value.paragraph) && value.paragraph>0 ? {paragraph:value.paragraph} : {}),
  };
}

export function createEmptyPersonaThread(seed = {}) {
  if (!seed || typeof seed !== "object") seed = {};
  const messages = normalizePersonaMessages(seed.messages).slice(-200);
  const savedMessages = normalizePersonaMessages(seed.savedMessages);
  let memories = normalizeCompanionMemories(seed.memories);
  // The one-time migration must never replay old messages after a user has
  // edited or deleted an extracted fact, including an intentionally empty list.
  if (seed.memoryVersion !== MEMORY_VERSION && !Array.isArray(seed.memories?.entries)) {
    for (const message of messages)
      if (message.role === "user") memories = rememberCompanionStatement(memories, message.content, message.createdAt);
  }
  return { messages, savedMessages, memories, memoryVersion: MEMORY_VERSION, relationship: syncPlanExperiences(seed.relationship, memories) };
}

export function createBuiltinPersonaProfiles(now = Date.now()) {
  return Object.fromEntries(
    PERSONA_TEMPLATES.map((template) => [
      template.id,
      {
        id: template.id,
        templateId: template.id,
        displayName: template.name,
        age: template.age,
        intimacyLevel: "mature",
        adultAcknowledged: false,
        voiceProfileId: "builtin",
        disabledCorpusIds: [],
        customCorpora: [],
        personality: "",
        mood: "calm",
        moodUpdatedAt: 0,
        appearance: null,
        custom: false,
        createdAt: now,
        updatedAt: now,
      },
    ]),
  );
}

export function normalizePersonaProfile(value, fallbackId) {
  const source = value && typeof value === "object" ? value : {};
  const template = getPersonaTemplate(source.templateId || fallbackId);
  const id =
    typeof source.id === "string" && /^[a-z0-9][a-z0-9-]{1,63}$/.test(source.id)
      ? source.id
      : fallbackId || template.id;
  const custom = source.custom === true || !PERSONA_TEMPLATES.some((item) => item.id === id);
  const age = Number(source.age);
  return {
    id,
    templateId: template.id,
    displayName: cleanText(source.displayName, 24) || template.name,
    age:
      custom && Number.isInteger(age) && age >= 25 && age <= 99
        ? age
        : template.age,
    intimacyLevel: INTIMACY_LEVELS.includes(source.intimacyLevel)
      ? source.intimacyLevel
      : "mature",
    adultAcknowledged: source.adultAcknowledged === true,
    voiceProfileId: cleanText(source.voiceProfileId, 64) || "builtin",
    disabledCorpusIds: (Array.isArray(source.disabledCorpusIds)
      ? source.disabledCorpusIds
      : []
    )
      .filter((item) => typeof item === "string")
      .slice(0, 200),
    customCorpora: normalizePersonaCorpora(source.customCorpora),
    personality: cleanText(source.personality, 500),
    mood: normalizeCompanionMood(source),
    moodUpdatedAt: Number.isFinite(source.moodUpdatedAt) && source.moodUpdatedAt > 0 ? Math.min(source.moodUpdatedAt, Date.now()) : 0,
    appearance: normalizePersonaAppearance(source.appearance),
    custom,
    createdAt: Number(source.createdAt) || Date.now(),
    updatedAt: Number(source.updatedAt) || Date.now(),
  };
}

function activeId(state, requested) {
  if (requested && state.personas?.[requested]) return requested;
  if (state.personas?.[state.activePersonaId]) return state.activePersonaId;
  if (state.personas?.[DEFAULT_PERSONA_TEMPLATE_ID]) return DEFAULT_PERSONA_TEMPLATE_ID;
  return Object.keys(state.personas || {})[0];
}

export function getActivePersona(state) {
  const id = activeId(state);
  return state.personas?.[id];
}

export function getPersonaThread(state, personaId) {
  const id = activeId(state, personaId);
  return state.personaThreads?.[id] || createEmptyPersonaThread();
}

function withLegacyAliases(state) {
  const profile = getActivePersona(state);
  const thread = getPersonaThread(state);
  return {
    ...state,
    messages: thread.messages,
    savedMessages: thread.savedMessages,
    favorites: thread.savedMessages.map((item) => item.id),
    corpora: profile?.customCorpora || [],
  };
}

export function setActivePersona(state, personaId) {
  if (!state.personas?.[personaId]) return state;
  return withLegacyAliases({ ...state, activePersonaId: personaId });
}

export function updatePersonaProfile(state, personaId, patch) {
  const current = state.personas?.[personaId];
  if (!current) return state;
  const next = normalizePersonaProfile(
    {
      ...current,
      ...patch,
      id: current.id,
      templateId: current.templateId,
      age: current.custom ? patch.age ?? current.age : current.age,
      customCorpora: patch.customCorpora ?? current.customCorpora,
      moodUpdatedAt: Object.hasOwn(patch, "mood") ? Date.now() : current.moodUpdatedAt,
      updatedAt: Date.now(),
    },
    current.id,
  );
  return withLegacyAliases({
    ...state,
    personas: { ...state.personas, [personaId]: next },
  });
}

export function clonePersona(state, personaId) {
  const source = state.personas?.[personaId];
  if (!source) return state;
  const id = makeId();
  const copy = normalizePersonaProfile(
    {
      ...source,
      id,
      displayName: `${source.displayName}副本`.slice(0, 24),
      custom: true,
      customCorpora: source.customCorpora.map((item) => ({ ...item, id: makeId() })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    id,
  );
  return withLegacyAliases({
    ...state,
    activePersonaId: id,
    personas: { ...state.personas, [id]: copy },
    personaThreads: { ...state.personaThreads, [id]: createEmptyPersonaThread() },
  });
}

export function removePersona(state, personaId) {
  const profile = state.personas?.[personaId];
  if (!profile?.custom || Object.keys(state.personas).length <= 1) return state;
  const personas = { ...state.personas };
  const personaThreads = { ...state.personaThreads };
  delete personas[personaId];
  delete personaThreads[personaId];
  const activePersonaId =
    state.activePersonaId === personaId
      ? personas[DEFAULT_PERSONA_TEMPLATE_ID]
        ? DEFAULT_PERSONA_TEMPLATE_ID
        : Object.keys(personas)[0]
      : state.activePersonaId;
  return withLegacyAliases({ ...state, personas, personaThreads, activePersonaId });
}

function updateThread(state, personaId, updater) {
  const id = activeId(state, personaId);
  if (!id) return state;
  const current = getPersonaThread(state, id);
  const next = updater(current);
  return withLegacyAliases({
    ...state,
    personaThreads: { ...state.personaThreads, [id]: next },
  });
}

export function appendPersonaMessage(state, role, content, extra = {}) {
  if (!["user", "assistant"].includes(role) || typeof content !== "string" || !content.trim())
    return state;
  return updateThread(state, state.activePersonaId, (thread) => {
    const message = {
      id: makeId(),
      role,
      content: content.trim().slice(0, 4000),
      createdAt: Date.now(),
      ...extra,
    };
    return {
      ...thread,
      messages: [...thread.messages, message].slice(-200),
      memories:
        role === "user" ? rememberCompanionStatement(thread.memories, message.content, message.createdAt) : thread.memories,
    };
  });
}

export function clearPersonaThread(state) {
  return updateThread(state, state.activePersonaId, (thread) => ({
    ...thread, messages: [], savedMessages: [],
  }));
}

export function updatePersonaMemories(state, personaId, patch) {
  if (!state.personas?.[personaId]) return state;
  return updateThread(state, personaId, (thread) => {
    let memories = normalizeCompanionMemories(thread.memories);
    if (Array.isArray(patch.entries)) memories = normalizeCompanionMemories({ entries: patch.entries });
    else {
      const replaces = (entry) =>
        (Object.hasOwn(patch, "userName") && entry.kind === "fact" && /^用户称呼[：:]/.test(entry.text)) ||
        (Object.hasOwn(patch, "preferences") && entry.kind === "preference") ||
        (Object.hasOwn(patch, "relationshipFacts") && entry.kind === "event");
      const additions = normalizeCompanionMemories(patch).entries;
      memories = normalizeCompanionMemories({ entries: [...memories.entries.filter((entry) => !replaces(entry)), ...additions] });
    }
    return { ...thread, memories, relationship: syncPlanExperiences(thread.relationship, memories), memoryVersion: MEMORY_VERSION };
  });
}

export function upsertPersonaMemory(state, personaId, entry) {
  if (!state.personas?.[personaId]) return state;
  return updateThread(state, personaId, (thread) => {
    const memories = upsertCompanionMemory(thread.memories, entry);
    const updated = memories.entries.find((item) => item.id === entry?.id) || memories.entries.at(-1);
    const previous = thread.memories?.entries?.find((item) => item.id === updated?.id);
    const syncedRelationship = syncPlanExperiences(thread.relationship, memories);
    const relationship = updated?.kind === "plan" && updated.status === "done" && (previous?.status !== "done" || previous?.kind !== "plan")
      ? addCompanionExperience(syncedRelationship, { id: `plan:${updated.id}`, kind: "plan", title: updated.text, detail: updated.text, createdAt: updated.updatedAt })
      : syncedRelationship;
    return { ...thread, memories, relationship, memoryVersion: MEMORY_VERSION };
  });
}

export function removePersonaMemory(state, personaId, id) {
  if (!state.personas?.[personaId]) return state;
  return updateThread(state, personaId, (thread) => {
    const memories = normalizeCompanionMemories({ entries: normalizeCompanionMemories(thread.memories).entries.filter((entry) => entry.id !== id) });
    return { ...thread, memoryVersion: MEMORY_VERSION, memories, relationship: syncPlanExperiences(thread.relationship, memories) };
  });
}

export function recordPersonaExperience(state, personaId, experience) {
  if (!state.personas?.[personaId]) return state;
  return updateThread(state, personaId, (thread) => ({
    ...thread, relationship: addCompanionExperience(thread.relationship, experience),
  }));
}

export function updatePersonaExperience(state, personaId, id, patch = {}) {
  if (!state.personas?.[personaId] || !getPersonaThread(state, personaId).relationship?.experiences?.some((entry) => entry.id === id)) return state;
  return updateThread(state, personaId, (thread) => {
    const relationship = normalizeRelationship(thread.relationship);
    const previous = relationship.experiences.find((entry) => entry.id === id);
    const title = Object.hasOwn(patch, "title") ? cleanText(patch.title, 80) : previous.title;
    if (!title) return thread;
    const detail = Object.hasOwn(patch, "detail") ? cleanText(patch.detail, 240) : previous.detail;
    const updated = { ...previous, title, detail };
    let memories = normalizeCompanionMemories(thread.memories);
    const plan = previous.kind === "plan" && id.startsWith("plan:") ? memories.entries.find((entry) => entry.id === id.slice(5) && entry.kind === "plan") : null;
    if (plan) memories = upsertCompanionMemory(memories, { ...plan, text: `${title}${detail && detail !== title ? `：${detail}` : ""}`.slice(0, 240) });
    return { ...thread, memories, memoryVersion: MEMORY_VERSION, relationship: syncPlanExperiences({ ...relationship, experiences: relationship.experiences.map((entry) => entry.id === id ? updated : entry) }, memories) };
  });
}

export function removePersonaExperience(state, personaId, id) {
  if (!state.personas?.[personaId] || !getPersonaThread(state, personaId).relationship?.experiences?.some((entry) => entry.id === id)) return state;
  return updateThread(state, personaId, (thread) => {
    const relationship = normalizeRelationship(thread.relationship);
    const previous = relationship.experiences.find((entry) => entry.id === id);
    const memories = normalizeCompanionMemories({ entries: normalizeCompanionMemories(thread.memories).entries.filter((entry) => !(previous.kind === "plan" && id === `plan:${entry.id}`)) });
    return { ...thread, memories, memoryVersion: MEMORY_VERSION, relationship: syncPlanExperiences({ ...relationship, experiences: relationship.experiences.filter((entry) => entry.id !== id) }, memories) };
  });
}

export function togglePersonaFavorite(state, messageId) {
  return updateThread(state, state.activePersonaId, (thread) => {
    const exists = thread.savedMessages.some((item) => item.id === messageId);
    const message = thread.messages.find((item) => item.id === messageId);
    return {
      ...thread,
      savedMessages: exists
        ? thread.savedMessages.filter((item) => item.id !== messageId)
        : message
          ? [...thread.savedMessages, { ...message }]
          : thread.savedMessages,
    };
  });
}

export function exportablePersonaMessages(state) {
  const thread = getPersonaThread(state);
  return [
    ...new Map(
      [...thread.savedMessages, ...thread.messages].map((item) => [item.id, item]),
    ).values(),
  ].sort((a, b) => a.createdAt - b.createdAt);
}

export function addPersonaCorpus(
  state,
  personaId,
  text,
  title = "",
  category = "fallback",
  level = "mature",
  voiceProfileId = "",
) {
  const content = cleanText(text, 240);
  if (!content) return state;
  const profile = state.personas?.[personaId];
  if (!profile) return state;
  const item = {
    id: makeId(),
    title: cleanText(title, 60) || content.split(/\r?\n/, 1)[0].slice(0, 36),
    text: content,
    category: ["greeting", "daily", "affection", "teasing", "seduction", "comfort", "jealousy", "praise", "goodnight", "fallback"].includes(category) ? category : "fallback",
    level: INTIMACY_LEVELS.includes(level) ? level : "mature",
    enabled: true,
    createdAt: Date.now(),
    ...(cleanText(voiceProfileId, 64)
      ? { voiceProfileId: cleanText(voiceProfileId, 64) }
      : {}),
  };
  return updatePersonaProfile(state, personaId, {
    customCorpora: [item, ...profile.customCorpora].slice(0, 40),
  });
}

export function togglePersonaCorpus(state, personaId, corpusId) {
  const profile = state.personas?.[personaId];
  if (!profile) return state;
  return updatePersonaProfile(state, personaId, {
    customCorpora: profile.customCorpora.map((item) =>
      item.id === corpusId ? { ...item, enabled: item.enabled === false } : item,
    ),
  });
}

export function deletePersonaCorpus(state, personaId, corpusId) {
  const profile = state.personas?.[personaId];
  if (!profile) return state;
  return updatePersonaProfile(state, personaId, {
    customCorpora: profile.customCorpora.filter((item) => item.id !== corpusId),
  });
}

export function syncPersonaAliases(state) {
  return withLegacyAliases(state);
}
