import {
  DEFAULT_LOOK_ID,
  cleanRemovedLookIds,
  getAvailableLookId,
  getLook,
  isLookId,
} from "./looks.mjs";
import {
  CHARACTERS,
  getCharacterForLook,
  getDefaultBackgroundId,
  isBackgroundId,
} from "./wardrobe.mjs";
import {
  createBuiltinPersonaProfiles,
  createEmptyPersonaThread,
  normalizePersonaCorpora,
  normalizePersonaMessages,
  normalizePersonaProfile,
  syncPersonaAliases,
} from "./persona-state.mjs";
import { DEFAULT_PERSONA_TEMPLATE_ID } from "./personas.mjs";

export const STORAGE_KEY = "muyu-state-v2";
export const LEGACY_STORAGE_KEY = "muyu-state-v1";

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const SCENES = [
  {
    id: "home",
    name: "初见 · 日常",
    short: "日常",
    desc: "柔软针织，把日子过慢一点。",
    color: "#c9c0ae",
    line: "你来啦。今天过得怎么样？",
  },
  {
    id: "date",
    name: "月色 · 约会",
    short: "约会",
    desc: "留一点浪漫，给今晚的我们。",
    color: "#777787",
    line: "换好啦。今晚，想和我聊点什么？",
  },
  {
    id: "cozy",
    name: "微醺 · 居家",
    short: "居家",
    desc: "卸下一天的疲惫，舒服地待着。",
    color: "#b0a4c5",
    line: "今天就穿得软软的，陪你放松一下。",
  },
  {
    id: "wedding",
    name: "心动 · 婚纱",
    short: "婚纱",
    desc: "把心动，留在这一刻。",
    color: "#e5ddd2",
    line: "这一套，是不是有一点不一样？",
  },
];
export const DEFAULT_SETTINGS = {
  name: "",
  voice: true,
  motion: true,
  volume: 0.35,
  provider: "auto",
  model: "",
  fontSize: "normal",
};

function restoreSettings(value) {
  const x = value && typeof value === "object" ? value : {};
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of ["voice", "motion"])
    if (typeof x[key] === "boolean") settings[key] = x[key];
  if (typeof x.name === "string") settings.name = x.name.slice(0, 24);
  if (typeof x.volume === "number" && x.volume >= 0 && x.volume <= 1)
    settings.volume = x.volume;
  if (["auto", "offline", "ollama"].includes(x.provider))
    settings.provider = x.provider;
  if (typeof x.model === "string") settings.model = x.model.slice(0, 100);
  if (x.fontSize === "large") settings.fontSize = "large";
  return settings;
}

export function restoreState(raw) {
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    p = {};
  }
  if (!p || typeof p !== "object") p = {};
  const settings = restoreSettings(p.settings);
  const removedLookIds = cleanRemovedLookIds(p.removedLookIds);
  const savedLookId = isLookId(p.lookId) ? p.lookId : DEFAULT_LOOK_ID;
  const lookId = getAvailableLookId(removedLookIds, savedLookId);
  const activeCharacterId = getCharacterForLook(lookId).id;
  const rawProfiles =
    p.characterProfiles && typeof p.characterProfiles === "object"
      ? p.characterProfiles
      : {};
  const characterProfiles = Object.fromEntries(
    CHARACTERS.flatMap((character) => {
      const rawProfile = rawProfiles[character.id];
      if (!rawProfile || typeof rawProfile !== "object") return [];
      const displayName =
        typeof rawProfile.displayName === "string"
          ? rawProfile.displayName.trim().slice(0, 24)
          : "";
      const profileCorpora = normalizePersonaCorpora(rawProfile.corpora, 40);
      if (!displayName && !profileCorpora.length) return [];
      return [
        [
          character.id,
          {
            ...(displayName ? { displayName } : {}),
            corpora: profileCorpora,
          },
        ],
      ];
    }),
  );
  const lastLookByCharacter = Object.fromEntries(
    Object.entries(
      p.lastLookByCharacter && typeof p.lastLookByCharacter === "object"
        ? p.lastLookByCharacter
        : {},
    ).filter(([characterId, candidateLookId]) => {
      if (!CHARACTERS.some((item) => item.id === characterId)) return false;
      if (!isLookId(candidateLookId) || candidateLookId === "haru-original") return false;
      return getLook(candidateLookId).characterId === characterId;
    }),
  );
  if (lookId !== "haru-original") lastLookByCharacter[activeCharacterId] = lookId;
  const builtins = createBuiltinPersonaProfiles();
  let personas = { ...builtins };
  let personaThreads = Object.fromEntries(
    Object.keys(builtins).map((id) => [id, createEmptyPersonaThread()]),
  );
  let activePersonaId = DEFAULT_PERSONA_TEMPLATE_ID;

  if (p.schemaVersion === 2 && p.personas && typeof p.personas === "object") {
    for (const [id, value] of Object.entries(p.personas)) {
      if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) continue;
      const profile = normalizePersonaProfile({ ...value, id }, id);
      personas[id] = profile;
      personaThreads[id] = createEmptyPersonaThread(p.personaThreads?.[id]);
    }
    if (typeof p.activePersonaId === "string" && personas[p.activePersonaId])
      activePersonaId = p.activePersonaId;
  } else {
    const messages = normalizePersonaMessages(p.messages).slice(-200);
    const oldFavorites = Array.isArray(p.favorites) ? p.favorites : [];
    const savedMessages = normalizePersonaMessages(
      Array.isArray(p.savedMessages)
        ? p.savedMessages
        : messages.filter((message) => oldFavorites.includes(message.id)),
    );
    const corpora = normalizePersonaCorpora(p.corpora, 40);
    const hasGlobalPersonaData = Boolean(
      messages.length || savedMessages.length || corpora.length || settings.name,
    );
    if (hasGlobalPersonaData) {
      const id = "legacy-zhangrong";
      personas[id] = normalizePersonaProfile(
        {
          id,
          templateId: DEFAULT_PERSONA_TEMPLATE_ID,
          displayName: "张容",
          age: 29,
          intimacyLevel: "mature",
          voiceProfileId: "builtin",
          customCorpora: corpora,
          custom: true,
        },
        id,
      );
      personaThreads[id] = createEmptyPersonaThread({
        messages,
        savedMessages,
        memories: { userName: settings.name },
      });
      activePersonaId = id;
    }
    let legacyIndex = 0;
    for (const character of CHARACTERS) {
      const rawProfile = rawProfiles[character.id];
      if (!rawProfile || typeof rawProfile !== "object") continue;
      const displayName =
        typeof rawProfile.displayName === "string"
          ? rawProfile.displayName.trim().slice(0, 24)
          : "";
      const customCorpora = normalizePersonaCorpora(rawProfile.corpora, 40);
      if (!displayName && !customCorpora.length) continue;
      legacyIndex += 1;
      const id = `legacy-persona-${legacyIndex}`;
      personas[id] = normalizePersonaProfile(
        {
          id,
          templateId: DEFAULT_PERSONA_TEMPLATE_ID,
          displayName: displayName || character.defaultName,
          age: character.age,
          customCorpora,
          custom: true,
        },
        id,
      );
      personaThreads[id] = createEmptyPersonaThread();
    }
  }

  if (!personas[activePersonaId]) activePersonaId = DEFAULT_PERSONA_TEMPLATE_ID;
  for (const id of Object.keys(personas))
    if (!personaThreads[id]) personaThreads[id] = createEmptyPersonaThread();

  return syncPersonaAliases({
    schemaVersion: 2,
    activePersonaId,
    personas,
    personaThreads,
    avatarMode: p.avatarMode === "photo" ? "photo" : "live2d",
    lookId,
    removedLookIds,
    backgroundId: isBackgroundId(p.backgroundId)
      ? p.backgroundId
      : getDefaultBackgroundId(),
    characterProfiles,
    lastLookByCharacter,
    customEnabled: p.customEnabled === true,
    scene: SCENES.some((s) => s.id === p.scene) ? p.scene : "home",
    settings,
    startedAt: Number(p.startedAt) || Date.now(),
  });
}
export function createCorpus(text, title = "") {
  const content = text.trim().slice(0, 1500);
  return {
    id: makeId(),
    title:
      title.trim().slice(0, 60) || content.split(/\r?\n/, 1)[0].slice(0, 36),
    text: content,
    createdAt: Date.now(),
  };
}
export function appendMessage(messages, role, content, extra = {}) {
  if (!content.trim()) return messages;
  return [
    ...messages,
    {
      id: makeId(),
      role,
      content: content.trim().slice(0, 4000),
      createdAt: Date.now(),
      ...extra,
    },
  ].slice(-200);
}
export function formatRemaining(seconds) {
  const n = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
export function sceneFromCommand(t) {
  if (/婚纱|新娘/.test(t)) return "wedding";
  if (/紫色|毛衣|居家|睡衣/.test(t)) return "cozy";
  if (/约会|礼服|黑裙/.test(t)) return "date";
  if (/日常|针织|初见|换回/.test(t)) return "home";
  return null;
}

export function toggleFavorite(state, id) {
  const saved = state.savedMessages || [];
  const message = state.messages.find((m) => m.id === id);
  const savedMessages = saved.some((m) => m.id === id)
    ? saved.filter((m) => m.id !== id)
    : message
      ? [...saved, { ...message }]
      : saved;
  return { ...state, savedMessages, favorites: savedMessages.map((m) => m.id) };
}
export function exportableMessages(state) {
  return [
    ...new Map(
      [...(state.savedMessages || []), ...state.messages].map((m) => [m.id, m]),
    ).values(),
  ].sort((a, b) => a.createdAt - b.createdAt);
}
