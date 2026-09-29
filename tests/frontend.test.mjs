import { test, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { offlineReply } from "../server/dialogue.mjs";
import { restoreState } from "../src/state.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:4317",
});
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "localStorage",
  "Event",
  "MouseEvent",
])
  Object.defineProperty(globalThis, name, {
    value: dom.window[name],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const React = await import("react");
const { render, fireEvent, cleanup, act, waitFor } =
  await import("@testing-library/react");
const temporary = await mkdtemp(
  path.join(process.cwd(), "node_modules/.muyu-test-"),
);
const bundle = path.join(temporary, "app.cjs");
await build({
  entryPoints: ["src/App.jsx"],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  define: { "import.meta.env.DEV": "true" },
  external: ["react", "react-dom", "react/jsx-runtime"],
  plugins: [
    {
      name: "isolate-native-boundaries",
      setup(b) {
        b.onResolve({ filter: /^\.\/LivePet\.jsx$/ }, () => ({
          path: "pet",
          namespace: "test",
        }));
        b.onResolve({ filter: /^\.\/audio\.js$/ }, () => ({
          path: "audio",
          namespace: "test",
        }));
        b.onResolve({ filter: /^\.\/media\.mjs$/ }, () => ({
          path: "media",
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, (a) => ({
          contents:
            a.path === "pet"
              ? "import React from 'react'; export default function LivePet({lookId,petMode}){return React.createElement('div',{'data-testid':'live-pet','data-look':lookId,'data-full-body':String(Boolean(petMode))})}"
              : a.path === "audio"
                ? "export async function speak(t,f){globalThis.__speechCalls.push(t);f?.()}export function stopSpeech(){} export async function setRain(){}"
                : "export async function readMedia(){return null} export async function saveMedia(){}",
          loader: "js",
        }));
      },
    },
  ],
});
const require = createRequire(import.meta.url),
  App = require(bundle).default;
let chatResolve, chatPayload, voiceSelections, missingVoiceIds;
beforeEach(() => {
  localStorage.clear();
  globalThis.__speechCalls = [];
  chatPayload = null;
  chatResolve = null;
  voiceSelections = [];
  missingVoiceIds = new Set();
  globalThis.fetch = async (url, options) => {
    if (url === "/api/voices") return {ok:true,json:async()=>({selectedId:"builtin",voices:[{id:"builtin",name:"原始参考音色",builtin:true,duration:5.4}]})};
    if (url === "/api/voices/select") {
      const id = JSON.parse(options.body).id;
      voiceSelections.push(id);
      if (missingVoiceIds.has(id)) return { ok: false, status: 404, json: async () => ({ error: "音色不存在" }) };
      return { ok: true, json: async () => ({ selectedId: id, voices: [] }) };
    }
    if (url === "/api/models")
      return { json: async () => ({ models: [{ name: "available-model" }] }) };
    if (url === "/api/health") return { json: async () => ({ ok: true }) };
    if (url === "/api/chat") {
      chatPayload = JSON.parse(options.body);
      return new Promise((resolve) => {
        chatResolve = (reply, extra = {}) =>
          resolve({
            ok: true,
            json: async () => ({
              reply,
              provider: "ollama",
              action: null,
              ...extra,
            }),
          });
      });
    }
    throw Error("unexpected fetch " + url);
  };
});
afterEach(() => {
  cleanup();
});
after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});
async function mount(extra = {}) {
  localStorage.setItem(
    "muyu-state-v1",
    JSON.stringify({
      settings: { voice: true, motion: false, model: "deleted-model" },
      ...extra,
    }),
  );
  const ui = render(React.createElement(App));
  await act(async () => {});
  return ui;
}
async function mountV2(update = {}) {
  const base = restoreState(null);
  localStorage.setItem(
    "muyu-state-v2",
    JSON.stringify({ ...base, ...update, schemaVersion: 2 }),
  );
  const ui = render(React.createElement(App));
  await act(async () => {});
  return ui;
}
async function submit(ui, text) {
  fireEvent.change(ui.getByRole("textbox", { name: /说点什么/ }), {
    target: { value: text },
  });
  fireEvent.click(ui.getByRole("button", { name: "发送消息" }));
  await waitFor(() => assert.ok(chatResolve));
}
async function resolveChat(text = "我听到啦。") {
  await act(async () => {
    chatResolve(text);
    await Promise.resolve();
  });
}

test("衣柜是全屏工作台，并支持角色切换、改名、独立语料和背景", async () => {
  const ui = await mount({ lookId: "ruby-velvet" });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));

  const page = ui.getByRole("region", { name: "选一种，陪你的模样" });
  assert.ok(ui.getByRole("heading", { name: "全身衣柜工作台" }));
  assert.equal(page.querySelector('[data-testid="live-pet"]').dataset.fullBody, "true");

  fireEvent.click(ui.getByRole("button", { name: "选择人物：林薇" }));
  assert.equal(page.querySelector('[data-testid="live-pet"]').dataset.look, "linwei-red-sole");

  fireEvent.change(ui.getByRole("textbox", { name: "角色名称" }), {
    target: { value: "薇姐" },
  });
  fireEvent.click(ui.getByRole("button", { name: "保存角色名称" }));
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).characterProfiles.linwei
      .displayName,
    "薇姐",
  );

  fireEvent.click(ui.getByRole("tab", { name: "角色语料" }));
  fireEvent.change(ui.getByRole("textbox", { name: "语料标题" }), {
    target: { value: "称呼" },
  });
  fireEvent.change(ui.getByRole("textbox", { name: "语料内容" }), {
    target: { value: "叫我队长" },
  });
  fireEvent.click(ui.getByRole("button", { name: "保存到当前角色" }));
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).characterProfiles.linwei
      .corpora[0].text,
    "叫我队长",
  );

  fireEvent.click(ui.getByRole("button", { name: "选择人物：绯月" }));
  assert.equal(ui.queryByText("叫我队长"), null);
  fireEvent.click(ui.getByRole("tab", { name: "背景" }));
  fireEvent.click(ui.getByRole("button", { name: "背景：玫瑰影棚" }));
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.backgroundId, "rose-studio");
  assert.equal(saved.lookId, "ruby-velvet");
});

test("部件页展示可复用槽位，清空穿搭会切到当前角色的安全底装", async () => {
  const ui = await mount({ lookId: "linwei-red-sole" });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "部件" }));
  assert.ok(ui.getByRole("heading", { name: "当前造型部件" }));
  assert.ok(ui.getByRole("button", { name: "筛选部件：鞋履" }));
  fireEvent.click(ui.getByRole("button", { name: "什么都不穿（白色比基尼）" }));
  assert.ok(ui.getByText("已换上白色比基尼安全底装"));
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).lookId,
    "linwei-white-bikini",
  );
});

test("已适配角色清空穿搭时会切到白色比基尼安全底装", async () => {
  const ui = await mount({ lookId: "ruby-velvet" });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "部件" }));
  fireEvent.click(ui.getByRole("button", { name: "什么都不穿（白色比基尼）" }));
  assert.ok(ui.getByText("已换上白色比基尼安全底装"));
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).lookId,
    "ruby-white-bikini",
  );
});
test("deleted saved model falls back to discovered local model; negated outfit stays unchanged", async () => {
  const ui = await mount();
  await submit(ui, "不要换婚纱");
  assert.equal(chatPayload.model, "available-model");
  assert.equal(
    localStorage.getItem("muyu-state-v2").includes('"scene":"home"'),
    true,
  );
  await resolveChat();
  assert.equal(JSON.parse(localStorage.getItem("muyu-state-v2")).scene, "home");
});

test("appearance names and corpora never override the active girlfriend persona", async () => {
  const ui = await mount({
    lookId: "ruby-date",
    characterProfiles: {
      ruby: {
        displayName: "绯月姐姐",
        corpora: [
          { id: "on", title: "风格", text: "说话温柔坦率", enabled: true },
          { id: "off", title: "旧设定", text: "不要携带", enabled: false },
        ],
      },
      linwei: {
        corpora: [{ id: "other", text: "另一个角色的语料", enabled: true }],
      },
    },
  });
  await submit(ui, "你好");
  assert.equal(chatPayload.persona.id, "older-sister");
  assert.equal(chatPayload.persona.name, "沈知意");
  assert.equal("characterName" in chatPayload, false);
  assert.equal("characterCorpus" in chatPayload, false);
  assert.equal(JSON.stringify(chatPayload).includes("绯月姐姐"), false);
  await resolveChat();
});

test("switching girlfriends preserves appearance and isolates each conversation", async () => {
  const base = restoreState(null);
  base.lookId = "ruby-velvet";
  base.personaThreads["older-sister"].messages = [
    { id: "older-message", role: "assistant", content: "姐姐的独立记录", createdAt: 1 },
  ];
  base.personaThreads["boss-girlfriend"].messages = [
    { id: "boss-message", role: "assistant", content: "上司的独立记录", createdAt: 2 },
  ];
  const ui = await mountV2(base);
  fireEvent.change(ui.getByRole("combobox", { name: "当前女友" }), {
    target: { value: "boss-girlfriend" },
  });
  await waitFor(() => assert.equal(JSON.parse(localStorage.getItem("muyu-state-v2")).activePersonaId, "boss-girlfriend"));
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.lookId, "ruby-velvet");
  assert.equal(saved.personaThreads["older-sister"].messages[0].content, "姐姐的独立记录");
  assert.equal(saved.personaThreads["boss-girlfriend"].messages[0].content, "上司的独立记录");
  fireEvent.click(ui.getByRole("button", { name: "回忆", exact: true }));
  assert.ok(ui.getByText("上司的独立记录"));
  assert.equal(ui.queryByText("姐姐的独立记录"), null);
});

test("chat payload contains only the active persona snapshot, memory, and thread history", async () => {
  const base = restoreState(null);
  base.activePersonaId = "boss-girlfriend";
  base.lookId = "ruby-date";
  base.personaThreads["boss-girlfriend"] = {
    messages: Array.from({ length: 26 }, (_, index) => ({
      id: `boss-${index}`,
      role: index % 2 ? "assistant" : "user",
      content: `上司记录${index}`,
      createdAt: index + 1,
    })),
    savedMessages: [],
    memories: { userName: "队长", preferences: ["黑咖啡"], relationshipFacts: ["周末约会"] },
  };
  base.personaThreads["older-sister"].messages = [
    { id: "other", role: "user", content: "不应发送的姐姐记录", createdAt: 1 },
  ];
  const ui = await mountV2(base);
  await submit(ui, "你好");
  assert.equal(chatPayload.persona.id, "boss-girlfriend");
  assert.equal(chatPayload.persona.name, "林岚");
  assert.deepEqual(chatPayload.personaMemory, base.personaThreads["boss-girlfriend"].memories);
  assert.equal(chatPayload.history.length, 24);
  assert.equal(chatPayload.history.some((item) => item.content.includes("姐姐记录")), false);
  assert.equal("characterName" in chatPayload, false);
  assert.equal("characterCorpus" in chatPayload, false);
  await resolveChat();
});

test("switching persona while a reply is pending never appends it to the new persona", async () => {
  const ui = await mountV2();
  await submit(ui, "只属于姐姐的问题");
  fireEvent.change(ui.getByRole("combobox", { name: "当前女友" }), {
    target: { value: "adult-younger" },
  });
  await resolveChat("不该出现的旧回复");
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.personaThreads["adult-younger"].messages.some((item) => item.content === "不该出现的旧回复"), false);
  assert.equal(saved.personaThreads["older-sister"].messages.some((item) => item.content === "不该出现的旧回复"), false);
});

test("missing persona voice repairs only that persona to builtin", async () => {
  const base = restoreState(null);
  base.personas["boss-girlfriend"].voiceProfileId = "missing-boss-voice";
  base.personas["older-sister"].voiceProfileId = "older-voice";
  missingVoiceIds.add("missing-boss-voice");
  const ui = await mountV2(base);
  fireEvent.change(ui.getByRole("combobox", { name: "当前女友" }), {
    target: { value: "boss-girlfriend" },
  });
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
    assert.equal(saved.personas["boss-girlfriend"].voiceProfileId, "builtin");
  });
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.personas["older-sister"].voiceProfileId, "older-voice");
  assert.ok(voiceSelections.includes("missing-boss-voice"));
  assert.equal(voiceSelections.at(-1), "builtin");
});

test("favoriting and clearing affect only the active girlfriend thread", async () => {
  const base = restoreState(null);
  base.activePersonaId = "boss-girlfriend";
  base.personaThreads["boss-girlfriend"].messages = [
    { id: "boss-only", role: "assistant", content: "只属于上司", createdAt: 2 },
  ];
  base.personaThreads["older-sister"].messages = [
    { id: "older-only", role: "assistant", content: "只属于姐姐", createdAt: 1 },
  ];
  const ui = await mountV2(base);
  fireEvent.click(ui.getByRole("button", { name: "回忆", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "收藏这条消息" }));
  let saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.deepEqual(saved.personaThreads["boss-girlfriend"].savedMessages.map((item) => item.id), ["boss-only"]);
  assert.deepEqual(saved.personaThreads["older-sister"].savedMessages, []);
  fireEvent.click(ui.getByRole("button", { name: "设置", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "清空记录", exact: true }));
  saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.deepEqual(saved.personaThreads["boss-girlfriend"].messages, []);
  assert.equal(saved.personaThreads["older-sister"].messages[0].content, "只属于姐姐");
});

test("development motion gallery exposes telemetry and P0 preview controls only on its route", async () => {
  dom.window.history.pushState({}, "", "/dev/motions");
  try {
    const ui = await mount({ avatarMode: "live2d", lookId: "linwei-red-sole" });
    assert.ok(ui.getByRole("heading", { name: "Motion Gallery" }));
    assert.ok(ui.getByRole("button", { name: "轻盈走路" }));
    assert.ok(ui.getByRole("button", { name: "自然蹲下" }));
    assert.ok(ui.getByRole("button", { name: "停止并待机" }));
    assert.ok(ui.getByRole("button", { name: "0.5×" }));
    assert.ok(ui.getByText("当前动作"));
    assert.ok(ui.getByText("当前帧"));
    assert.ok(ui.getByText("帧时长"));
    assert.ok(ui.getByText("动作相位"));
    assert.ok(ui.getByText("脚接触"));
    assert.ok(ui.getByText("Ground Anchor"));
    assert.ok(ui.getByText("安全退出"));
    assert.ok(ui.getByRole("button", { name: "上一帧" }));
    assert.ok(ui.getByRole("button", { name: "下一帧" }));
    assert.ok(ui.getByLabelText("Motion Ground Overlay"));
  } finally {
    cleanup();
    dom.window.history.pushState({}, "", "/");
  }
});
test("turning voice off during generation prevents the delayed reply from speaking", async () => {
  const ui = await mount();
  await submit(ui, "今天过得怎样");
  fireEvent.click(ui.getByRole("button", { name: "关闭语音朗读" }));
  await resolveChat();
  assert.deepEqual(globalThis.__speechCalls, []);
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).messages.length,
    2,
  );
});
test("clearing history while response is pending prevents stale messages reappearing", async () => {
  const ui = await mount();
  await submit(ui, "这条应该被清除");
  fireEvent.click(ui.getByRole("button", { name: "设置", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "清空记录", exact: true }));
  await resolveChat("不能重新出现");
  assert.deepEqual(
    JSON.parse(localStorage.getItem("muyu-state-v2")).messages,
    [],
  );
  assert.deepEqual(globalThis.__speechCalls, []);
});
test("completed focus session can restart with the selected duration", async () => {
  const ui = await mount({ settings: { voice: false, motion: false } });
  fireEvent.click(ui.getByRole("button", { name: "专注", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "开始专注", exact: true }));
  const realNow = Date.now;
  Date.now = () => realNow() + 1501000;
  try {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    await waitFor(() =>
      assert.ok(ui.getByRole("button", { name: "再来一段" })),
    );
  } finally {
    Date.now = realNow;
  }
  fireEvent.click(ui.getByRole("button", { name: "再来一段" }));
  assert.ok(ui.getByRole("button", { name: "暂停一下" }));
  assert.ok(ui.getAllByText("25:00").length > 0);
});
test("new animated view and pet preview preserve existing conversation and mode choice", async () => {
  const ui = await mount({
    messages: [
      { id: "kept", role: "user", content: "保留这句话", createdAt: 1 },
    ],
  });
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).avatarMode,
    "live2d",
  );
  fireEvent.click(ui.getByRole("button", { name: "桌宠模式" }));
  assert.ok(ui.getByRole("button", { name: "返回陪伴窗口" }));
  fireEvent.click(ui.getByRole("button", { name: "聊天" }));
  assert.ok(ui.getByRole("textbox", { name: /说点什么/ }));
  fireEvent.click(ui.getByRole("button", { name: "返回陪伴窗口" }));
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).messages[0].content,
    "保留这句话",
  );
  fireEvent.click(ui.getByRole("button", { name: "衣橱" }));
  fireEvent.click(ui.getByRole("button", { name: /初见 · 日常/ }));
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).avatarMode,
    "photo",
  );
  fireEvent.click(ui.getByRole("button", { name: /Haru · 动态陪伴/ }));
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).avatarMode,
    "live2d",
  );
});

test("outfit request from pet preview returns to the matching visible photo scene", async () => {
  const ui = await mount();
  fireEvent.click(ui.getByRole("button", { name: "桌宠模式" }));
  fireEvent.click(ui.getByRole("button", { name: "聊天" }));
  await submit(ui, "换上婚纱");
  assert.equal(chatPayload.avatarMode, "live2d");
  await act(async () => {
    chatResolve("切换到婚纱照片啦。", { action: "wedding" });
    await Promise.resolve();
  });
  assert.ok(ui.getByRole("button", { name: "桌宠模式" }));
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).avatarMode,
    "photo",
  );
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).scene,
    "wedding",
  );
});

test("selecting a dynamic wardrobe look restores animation and keeps photo choice and memories", async () => {
  const ui = await mount({
    avatarMode: "photo",
    scene: "cozy",
    messages: [
      { id: "kept", role: "user", content: "保留的对话", createdAt: 1 },
    ],
    savedMessages: [
      { id: "saved", role: "assistant", content: "珍藏的话", createdAt: 1 },
    ],
  });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(
    ui.getByRole("button", { name: "动态换装：绯月 · 约会礼服" }),
  );
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.avatarMode, "live2d");
  assert.equal(saved.lookId, "ruby-date");
  assert.equal(saved.scene, "cozy");
  assert.equal(saved.messages[0].content, "保留的对话");
  assert.equal(saved.savedMessages[0].content, "珍藏的话");
  assert.equal(ui.getByTestId("live-pet").dataset.look, "ruby-date");
  assert.equal(
    ui
      .getByRole("button", { name: "动态换装：绯月 · 约会礼服" })
      .getAttribute("aria-pressed"),
    "true",
  );
});

test("pet wardrobe changes the visible look without leaving pet mode or closing its chat", async () => {
  const ui = await mount({ lookId: "noir-office" });
  fireEvent.click(ui.getByRole("button", { name: "桌宠模式" }));
  fireEvent.click(ui.getByRole("button", { name: "聊天" }));
  fireEvent.change(ui.getByRole("textbox", { name: /说点什么/ }), {
    target: { value: "还没发出的消息" },
  });
  fireEvent.click(ui.getByRole("button", { name: "桌宠换装" }));
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 42);
  fireEvent.click(
    ui.getByRole("button", { name: "动态换装：霜华 · 机车皮衣" }),
  );
  assert.ok(ui.getByRole("button", { name: "返回陪伴窗口" }));
  assert.equal(
    ui.getByRole("textbox", { name: /说点什么/ }).value,
    "还没发出的消息",
  );
  assert.equal(ui.queryByRole("dialog", { name: "桌宠衣橱" }), null);
  assert.equal(ui.getByTestId("live-pet").dataset.look, "silver-leather");
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).lookId,
    "silver-leather",
  );
});

test("a chat clothing command changes the pet look while keeping its window and history", async () => {
  const ui = await mount({ lookId: "ruby-velvet", scene: "cozy" });
  fireEvent.click(ui.getByRole("button", { name: "桌宠模式" }));
  fireEvent.click(ui.getByRole("button", { name: "聊天" }));
  await submit(ui, "换黑丝通勤");
  assert.equal(chatPayload.lookId, "ruby-velvet");
  await act(async () => {
    const result = offlineReply(chatPayload);
    chatResolve(result.reply, result);
  });
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.lookId, "noir-office");
  assert.equal(saved.avatarMode, "live2d");
  assert.equal(saved.scene, "cozy");
  assert.equal(saved.messages.length, 2);
  assert.ok(ui.getByRole("button", { name: "返回陪伴窗口" }));
  assert.ok(ui.getByRole("textbox", { name: /说点什么/ }));
});

test("a named dynamic outfit requested from a photo scene switches to the animated look", async () => {
  const ui = await mount({ avatarMode: "photo", scene: "wedding" });
  await submit(ui, "换约会礼服");
  await act(async () => {
    const result = offlineReply(chatPayload);
    chatResolve(result.reply, result);
  });
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.lookId, "ruby-date");
  assert.equal(saved.avatarMode, "live2d");
  assert.equal(saved.scene, "wedding");
});

test("a pending photo outfit response exits pet mode entered after the request began", async () => {
  const ui = await mount({ lookId: "ruby-velvet" });
  await submit(ui, "换婚纱");
  fireEvent.click(ui.getByRole("button", { name: "桌宠模式" }));
  assert.ok(ui.getByRole("button", { name: "返回陪伴窗口" }));
  await act(async () => {
    const result = offlineReply(chatPayload);
    chatResolve(result.reply, result);
  });
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.avatarMode, "photo");
  assert.equal(saved.scene, "wedding");
  assert.ok(ui.getByRole("button", { name: "桌宠模式" }));
  assert.equal(ui.queryByRole("button", { name: "返回陪伴窗口" }), null);
});

test("expanded wardrobe combines search and filters while keeping the selected look and memories", async () => {
  const ui = await mount({
    lookId: "ruby-velvet",
    messages: [{ id: "kept", role: "user", content: "继续保留", createdAt: 1 }],
  });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  assert.ok(ui.getByText("15位伙伴 · 42套穿搭"));
  fireEvent.click(ui.getByRole("button", { name: "筛选：中式" }));
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 5);
  fireEvent.change(ui.getByRole("searchbox", { name: "搜索伙伴或穿搭" }), {
    target: { value: "旗袍" },
  });
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 1);
  fireEvent.click(
    ui.getByRole("button", { name: "动态换装：知夏 · 翡翠旗袍" }),
  );
  fireEvent.change(ui.getByRole("searchbox", { name: "搜索伙伴或穿搭" }), {
    target: { value: "找不到的穿搭" },
  });
  assert.ok(ui.getByText("没有找到匹配的造型"));
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.lookId, "zhixia-qipao");
  assert.equal(saved.messages[0].content, "继续保留");
  fireEvent.click(ui.getByRole("button", { name: "清除筛选" }));
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 42);
  assert.equal(
    ui
      .getByRole("button", { name: "动态换装：知夏 · 翡翠旗袍" })
      .getAttribute("aria-pressed"),
    "true",
  );
});

test("pet wardrobe filters the expanded collection and keeps the chat draft when selecting a new companion", async () => {
  const ui = await mount({ lookId: "ruby-velvet" });
  fireEvent.click(ui.getByRole("button", { name: "桌宠模式" }));
  fireEvent.click(ui.getByRole("button", { name: "聊天" }));
  fireEvent.change(ui.getByRole("textbox", { name: /说点什么/ }), {
    target: { value: "还在聊天" },
  });
  fireEvent.click(ui.getByRole("button", { name: "桌宠换装" }));
  fireEvent.click(ui.getByRole("button", { name: "筛选：非洲" }));
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 4);
  fireEvent.change(ui.getByRole("searchbox", { name: "搜索伙伴或穿搭" }), {
    target: { value: "阿玛拉" },
  });
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 2);
  fireEvent.click(
    ui.getByRole("button", { name: "动态换装：阿玛拉 · 彩织华服" }),
  );
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).lookId,
    "amara-ankara",
  );
  assert.equal(
    ui.getByRole("textbox", { name: /说点什么/ }).value,
    "还在聊天",
  );
  assert.ok(ui.getByRole("button", { name: "返回陪伴窗口" }));
});

test("new companion greeting labels and local replies stay accurate in the main window and pet", async () => {
  const ui = await mount({
    lookId: "lingyue-hanfu",
    settings: { voice: false, motion: false },
  });
  assert.ok(ui.getByRole("button", { name: "打个招呼", exact: true }));
  assert.equal(ui.queryByRole("button", { name: "挥挥手", exact: true }), null);
  fireEvent.click(ui.getByRole("button", { name: "打个招呼", exact: true }));
  assert.ok(ui.getByText(/我在这里|看见你了|今天也把你等到了/));
  fireEvent.click(ui.getByRole("button", { name: "桌宠模式" }));
  assert.ok(ui.getByRole("button", { name: "打个招呼", exact: true }));
  assert.equal(ui.queryByRole("button", { name: "挥挥手", exact: true }), null);
});

test("existing companions retain the wave label in the main window and pet", async () => {
  const ui = await mount({ lookId: "ruby-velvet" });
  assert.ok(ui.getByRole("button", { name: "挥挥手", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "桌宠模式" }));
  assert.ok(ui.getByRole("button", { name: "挥挥手", exact: true }));
});

test("main wardrobe filtering returns to the results without taking search focus", async () => {
  const ui = await mount();
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  const panel = ui.getByRole("region", { name: "选一种，陪你的模样" });
  panel.scrollTop = 1400;
  fireEvent.click(ui.getByRole("button", { name: "筛选：中式" }));
  assert.equal(panel.scrollTop, 0);
  panel.scrollTop = 777;
  const search = ui.getByRole("searchbox", { name: "搜索伙伴或穿搭" });
  search.focus();
  fireEvent.change(search, { target: { value: "旗袍" } });
  assert.equal(panel.scrollTop, 0);
  assert.equal(document.activeElement, search);
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 1);
});

test("pet wardrobe filtering returns to the results without taking search focus", async () => {
  const ui = await mount();
  fireEvent.click(ui.getByRole("button", { name: "桌宠模式" }));
  fireEvent.click(ui.getByRole("button", { name: "桌宠换装" }));
  const results = ui.container.querySelector(".pet-look-results");
  results.scrollTop = 500;
  fireEvent.click(ui.getByRole("button", { name: "筛选：非洲" }));
  assert.equal(results.scrollTop, 0);
  results.scrollTop = 200;
  const search = ui.getByRole("searchbox", { name: "搜索伙伴或穿搭" });
  search.focus();
  fireEvent.change(search, { target: { value: "阿玛拉" } });
  assert.equal(results.scrollTop, 0);
  assert.equal(document.activeElement, search);
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 2);
});

test('reference voice settings identify local synthesis and preview the selected voice',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>url==='/api/health'?{json:async()=>({ok:true,voice:true,voiceProfile:{mode:'reference',name:'参考音色',available:true,local:true}})}:original(url,options);
 const ui=await mount();fireEvent.click(ui.getByRole('button',{name:'设置',exact:true}));
 assert.ok(ui.getByText('参考音色 · 本机流式朗读'));
 fireEvent.click(ui.getByRole('button',{name:'试听当前音色',exact:true}));
 assert.match(globalThis.__speechCalls.at(-1),/你好，我是沈知意/);
});

test('saved voice cards can switch the active voice and rename without changing appearance', async()=>{
 const base=globalThis.fetch;let selected='builtin',renamed='温柔声音';
 const snapshot=()=>({selectedId:selected,voices:[{id:'builtin',name:'原始参考音色',builtin:true,duration:5.4},{id:'custom',name:renamed,builtin:false,duration:6}]});
 globalThis.fetch=async(url,options)=>{
  if(url==='/api/voices')return {ok:true,json:async()=>snapshot()};
  if(url==='/api/voices/select'){selected=JSON.parse(options.body).id;return {ok:true,json:async()=>snapshot()}}
  if(url==='/api/voices/rename'){renamed=JSON.parse(options.body).name;return {ok:true,json:async()=>snapshot()}}
  return base(url,options);
 };
 const ui=render(React.createElement(App));fireEvent.click(ui.getByRole('button',{name:'设置',exact:true}));
 await waitFor(()=>assert.ok(ui.getByText('温柔声音')));
 fireEvent.click(ui.getByRole('button',{name:'使用音色',exact:true}));await waitFor(()=>assert.equal(selected,'custom'));
 await waitFor(()=>assert.equal(JSON.parse(localStorage.getItem('muyu-state-v2')).personas['older-sister'].voiceProfileId,'custom'));
 await waitFor(()=>assert.equal(ui.getByRole('button',{name:'重命名温柔声音'}).disabled,false));
 fireEvent.click(ui.getByRole('button',{name:'重命名温柔声音'}));fireEvent.change(ui.getByRole('textbox',{name:'新音色名称'}),{target:{value:'夜晚声音'}});fireEvent.click(ui.getByRole('button',{name:'保存名称'}));await waitFor(()=>assert.ok(ui.getByText('夜晚声音')));
 fireEvent.click(ui.getByRole('button',{name:'＋ 添加音色'}));assert.ok(ui.getByLabelText('1. 选择录音'));
});
