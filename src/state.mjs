import {
  DEFAULT_LOOK_ID,
  cleanRemovedLookIds,
  getAvailableLookId,
  isLookId,
} from "./looks.mjs";

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
export function restoreState(raw) {
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    p = {};
  }
  if (!p || typeof p !== "object") p = {};
  const x = p.settings || {},
    settings = { ...DEFAULT_SETTINGS };
  for (const k of ["voice", "motion"])
    if (typeof x[k] === "boolean") settings[k] = x[k];
  if (typeof x.name === "string") settings.name = x.name.slice(0, 24);
  if (typeof x.volume === "number" && x.volume >= 0 && x.volume <= 1)
    settings.volume = x.volume;
  if (["auto", "offline", "ollama"].includes(x.provider))
    settings.provider = x.provider;
  if (typeof x.model === "string") settings.model = x.model.slice(0, 100);
  if (x.fontSize === "large") settings.fontSize = "large";
  const normalizeMessages = (items) =>
    (Array.isArray(items) ? items : [])
      .filter(
        (m) =>
          m &&
          ["user", "assistant"].includes(m.role) &&
          typeof m.content === "string" &&
          m.content.trim(),
      )
      .map((m) => ({
        id: typeof m.id === "string" ? m.id : makeId(),
        role: m.role,
        content: m.content.slice(0, 4000),
        createdAt: Number(m.createdAt) || Date.now(),
        provider: m.provider,
      }));
  const messages = normalizeMessages(p.messages).slice(-200);
  const oldFavorites = Array.isArray(p.favorites) ? p.favorites : [];
  const savedMessages = normalizeMessages(
    Array.isArray(p.savedMessages)
      ? p.savedMessages
      : messages.filter((m) => oldFavorites.includes(m.id)),
  );
  const corpora = (Array.isArray(p.corpora) ? p.corpora : [])
    .filter((item) => item && typeof item.text === "string" && item.text.trim())
    .map((item) => {
      const text = item.text.trim().slice(0, 1500);
      const title =
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim().slice(0, 60)
          : text.split(/\r?\n/, 1)[0].slice(0, 36);
      return {
        id: typeof item.id === "string" ? item.id : makeId(),
        title,
        text,
        createdAt: Number(item.createdAt) || Date.now(),
      };
    })
    .slice(0, 100);
  const removedLookIds = cleanRemovedLookIds(p.removedLookIds);
  const savedLookId = isLookId(p.lookId) ? p.lookId : DEFAULT_LOOK_ID;
  return {
    avatarMode: p.avatarMode === "photo" ? "photo" : "live2d",
    lookId: getAvailableLookId(removedLookIds, savedLookId),
    removedLookIds,
    customEnabled: p.customEnabled === true,
    scene: SCENES.some((s) => s.id === p.scene) ? p.scene : "home",
    settings,
    messages,
    savedMessages,
    corpora,
    favorites: savedMessages.map((m) => m.id),
    startedAt: Number(p.startedAt) || Date.now(),
  };
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
