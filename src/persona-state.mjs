import {
  DEFAULT_PERSONA_TEMPLATE_ID,
  INTIMACY_LEVELS,
  PERSONA_TEMPLATES,
  getPersonaTemplate,
} from "./personas.mjs";

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
      };
    })
    .slice(0, limit);
}

function normalizeMemories(value = {}) {
  const list = (items) =>
    (Array.isArray(items) ? items : [])
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim().slice(0, 120))
      .slice(-20);
  return {
    userName: cleanText(value.userName, 24),
    preferences: list(value.preferences),
    relationshipFacts: list(value.relationshipFacts),
  };
}

function remember(memories, content) {
  const next = normalizeMemories(memories);
  const nickname = content.match(
    /(?:以后)?(?:叫我|我叫|我的名字是|我的昵称是)\s*([\p{L}\p{N}_·]{1,16})/u,
  );
  if (nickname)
    next.userName = nickname[1].replace(/(?:就好|好吗|吧|呀|哦|啦)$/u, "");
  const preference = content.match(
    /我(?:最|很|特别)?喜欢([^。！？!?\n，,]{1,28})/u,
  );
  if (preference && !/[什么吗么？?]/.test(preference[1])) {
    const text = preference[1].trim().slice(0, 120);
    next.preferences = [...next.preferences.filter((item) => item !== text), text].slice(-20);
  }
  return next;
}

export function createEmptyPersonaThread(seed = {}) {
  const messages = normalizePersonaMessages(seed.messages).slice(-200);
  const savedMessages = normalizePersonaMessages(seed.savedMessages);
  let memories = normalizeMemories(seed.memories);
  for (const message of messages)
    if (message.role === "user") memories = remember(memories, message.content);
  return { messages, savedMessages, memories };
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
        role === "user" ? remember(thread.memories, message.content) : thread.memories,
    };
  });
}

export function clearPersonaThread(state) {
  return updateThread(state, state.activePersonaId, () => createEmptyPersonaThread());
}

export function updatePersonaMemories(state, personaId, patch) {
  return updateThread(state, personaId, (thread) => ({
    ...thread,
    memories: normalizeMemories({ ...thread.memories, ...patch }),
  }));
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

export function addPersonaCorpus(state, personaId, text, title = "") {
  const content = cleanText(text, 240);
  if (!content) return state;
  const profile = state.personas?.[personaId];
  if (!profile) return state;
  const item = {
    id: makeId(),
    title: cleanText(title, 60) || content.split(/\r?\n/, 1)[0].slice(0, 36),
    text: content,
    category: "fallback",
    level: "mature",
    enabled: true,
    createdAt: Date.now(),
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
