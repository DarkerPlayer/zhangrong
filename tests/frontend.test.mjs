import { test, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { offlineReply } from "../server/dialogue.mjs";
import { restoreState } from "../src/state.mjs";
import { getAvailableLooks } from "../src/looks.mjs";
import { isAllowedExclusiveCorpusText } from "../server/exclusive-corpus.mjs";

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
              ? "import React from 'react'; export default function LivePet({lookId,appearance,petMode,onReady,action}){React.useEffect(()=>{onReady?.()},[lookId,appearance?.asset,appearance?.rig]);return React.createElement('div',{'data-testid':'live-pet','data-look':lookId,'data-asset':appearance?.asset,'data-full-body':String(Boolean(petMode)),'data-action':action?.kind || ''})}"
              : a.path === "audio"
                ? "export async function speak(t,f,s,o){globalThis.__speechCalls.push(t);globalThis.__speechProfiles.push(o?.voiceProfileId);globalThis.__speechOptions.push(o);if(!globalThis.__holdSpeech)f?.()}export function stopSpeech(){globalThis.__speechStops++} export async function setRain(){}"
                : "export async function readMedia(){return null} export async function saveMedia(){}",
          loader: "js",
        }));
      },
    },
  ],
});
const require = createRequire(import.meta.url),
  App = require(bundle).default;
let chatResolve, chatPayload, chatSignal, voiceSelections, missingVoiceIds, libraryVoices;
beforeEach(() => {
  localStorage.clear();
  globalThis.__speechCalls = [];
  globalThis.__speechProfiles = [];
  globalThis.__speechOptions = [];
  globalThis.__speechStops = 0;
  globalThis.__holdSpeech = false;
  chatPayload = null;
  chatResolve = null;
  chatSignal = null;
  voiceSelections = [];
  missingVoiceIds = new Set();
  libraryVoices = [{id:"builtin",name:"原始参考音色",builtin:true,duration:5.4},{id:"older-voice",name:"旧音色",builtin:false,duration:6}];
  globalThis.fetch = async (url, options) => {
    if (url === "/api/voices") return {ok:true,json:async()=>({selectedId:"builtin",voices:libraryVoices})};
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
      chatSignal = options.signal;
      return new Promise((resolve) => {
        chatResolve = (reply, extra = {}) =>
          resolve(extra.response || {
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

test('text workshop opens from the persona page without changing existing corpus or memories',async()=>{
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>url==='/api/text-packs'?{ok:true,json:async()=>({packs:[]})}:previousFetch(url,options);
  const ui=await mountV2();
  fireEvent.click(ui.getByRole('button',{name:'女友',exact:true}));
  fireEvent.click(ui.getByRole('button',{name:'文本工坊 · 导入书籍'}));
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'文本工坊'})));
  const saved=JSON.parse(localStorage.getItem('muyu-state-v2'));
  assert.equal(saved.personas[saved.activePersonaId].customCorpora.length,0);
  assert.equal(saved.personaThreads[saved.activePersonaId].memories.entries.length,0);
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
function showAllWardrobeItems(ui) {
  assert.equal(ui.getByRole("button", { name: /^角色专属/ }).getAttribute("aria-pressed"), "true");
  fireEvent.click(ui.getByRole("button", { name: /^全部衣橱/ }));
  assert.equal(ui.getByRole("button", { name: /^全部衣橱/ }).getAttribute("aria-pressed"), "true");
}
async function submit(ui, text) {
  fireEvent.change(ui.getByRole("textbox", { name: /说点什么/ }), {
    target: { value: text },
  });
  fireEvent.click(ui.getByRole("button", { name: "发送消息" }));
  await waitFor(() => assert.ok(chatResolve));
}

test("模型改名同步同角色造型、搜索和桌宠，重载后保留且不修改人格", async () => {
  let ui = await mountV2({ lookId: "ruby-velvet" });
  const before = JSON.parse(localStorage.getItem("muyu-state-v2"));
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "修改模型名称" }));
  fireEvent.change(ui.getByRole("textbox", { name: "模型名称" }), { target: { value: "  我的名字  " } });
  fireEvent.click(ui.getByRole("button", { name: "保存模型名称" }));
  assert.ok(ui.getByRole("button", { name: "选择外观模特：我的名字" }));
  fireEvent.change(ui.getByRole("searchbox", { name: "搜索当前模型的造型" }), { target: { value: "我的名字" } });
  const outfits = ui.getAllByRole("button", { name: /^动态换装：我的名字 · / });
  assert.ok(outfits.length > 1);
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.modelNames.ruby, "我的名字");
  assert.deepEqual(saved.personas, before.personas);
  assert.deepEqual(saved.personaThreads, before.personaThreads);
  assert.deepEqual(saved.wardrobeSelections, before.wardrobeSelections);
  ui.unmount();
  ui = render(React.createElement(App));
  await act(async () => {});
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  assert.ok(ui.getByRole("button", { name: "选择外观模特：我的名字" }));
  fireEvent.click(ui.getByRole("button", { name: "关闭衣柜" }));
  fireEvent.click(ui.getByRole("button", { name: "桌宠模式" }));
  fireEvent.click(ui.getByRole("button", { name: "桌宠换装" }));
  assert.ok(ui.getAllByRole("button", { name: /^动态换装：我的名字 · / }).length > 1);
});

test("Haru 可独立改名，取消及空白输入不会覆盖已保存名称", async () => {
  const ui = await mountV2();
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "选择外观模特：Haru" }));
  fireEvent.click(ui.getByRole("button", { name: "修改模型名称" }));
  fireEvent.change(ui.getByRole("textbox", { name: "模型名称" }), { target: { value: "小春" } });
  fireEvent.click(ui.getByRole("button", { name: "保存模型名称" }));
  assert.ok(ui.getByRole("button", { name: "选择外观模特：小春" }));
  assert.deepEqual(JSON.parse(localStorage.getItem("muyu-state-v2")).modelNames, { haru: "小春" });
  fireEvent.click(ui.getByRole("button", { name: "修改模型名称" }));
  fireEvent.change(ui.getByRole("textbox", { name: "模型名称" }), { target: { value: "   " } });
  assert.equal(ui.getByRole("button", { name: "保存模型名称" }).disabled, true);
  fireEvent.click(ui.getByRole("button", { name: "取消改名" }));
  assert.ok(ui.getByRole("button", { name: "选择外观模特：小春" }));
  fireEvent.click(ui.getByRole("button", { name: "选择外观模特：绾红" }));
  fireEvent.click(ui.getByRole("button", { name: "修改模型名称" }));
  fireEvent.change(ui.getByRole("textbox", { name: "模型名称" }), { target: { value: "草稿" } });
  fireEvent.click(ui.getByRole("button", { name: "选择外观模特：小春" }));
  assert.equal(ui.queryByRole("textbox", { name: "模型名称" }), null);
  assert.deepEqual(JSON.parse(localStorage.getItem("muyu-state-v2")).modelNames, { haru: "小春" });
});
async function resolveChat(text = "我听到啦。") {
  await act(async () => {
    chatResolve(text);
    await Promise.resolve();
  });
}

test("衣柜只管理外观，切换模特与背景不改变女友本体", async () => {
  const base = restoreState(null);
  base.lookId = "ruby-velvet";
  base.activePersonaId = "boss-girlfriend";
  base.personaThreads["boss-girlfriend"].messages = [
    { id: "identity-proof", role: "assistant", content: "本体记录", createdAt: 1 },
  ];
  const beforePersona = JSON.stringify(base.personas["boss-girlfriend"]);
  const beforeThread = JSON.stringify(base.personaThreads["boss-girlfriend"]);
  const ui = await mountV2(base);
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));

  const page = ui.getByRole("region", { name: "选一种，陪你的模样" });
  assert.ok(ui.getByRole("heading", { name: "全身衣柜工作台" }));
  assert.equal(page.querySelector('[data-testid="live-pet"]').dataset.fullBody, "true");
  assert.deepEqual(ui.getAllByRole("tab").map((item) => item.textContent), ["完整造型", "单品", "背景"]);
  assert.equal(ui.queryByRole("textbox", { name: "角色名称" }), null);
  assert.equal(ui.queryByRole("tab", { name: "角色语料" }), null);

  fireEvent.click(ui.getByRole("button", { name: "选择外观模特：林薇" }));
  assert.equal(page.querySelector('[data-testid="live-pet"]').dataset.look, "linwei-red-sole");
  fireEvent.click(ui.getByRole("tab", { name: "背景" }));
  fireEvent.click(ui.getByRole("button", { name: "背景：玫瑰影棚" }));
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.backgroundId, "rose-studio");
  assert.equal(saved.lookId, "linwei-red-sole");
  assert.equal(saved.activePersonaId, "boss-girlfriend");
  assert.equal(JSON.stringify({...saved.personas["boss-girlfriend"],appearance:JSON.parse(beforePersona).appearance}), beforePersona);
  assert.equal(saved.personas["boss-girlfriend"].appearance.lookId,"linwei-red-sole");
  assert.equal(JSON.stringify(saved.personaThreads["boss-girlfriend"]), beforeThread);
});

test("单品页展示真实库存分类，清空穿搭会切到当前角色的安全底装", async () => {
  const ui = await mount({ lookId: "linwei-red-sole" });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  assert.ok(ui.getByRole("heading", { name: "林薇的专属衣橱" }));
  assert.ok(ui.getByRole("button", { name: "筛选单品：鞋履" }));
  showAllWardrobeItems(ui);
  assert.ok(ui.getByRole("heading", { name: "全部单品衣橱" }));
  fireEvent.click(ui.getByRole("button", { name: "什么都不穿（白色比基尼）" }));
  assert.ok(ui.getByText("已换上白色比基尼安全底装"));
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).lookId,
    "linwei-white-bikini",
  );
});

test("反差婊可以选择并保存，未适配的底装和鞋履保持玫瑰职场造型", async () => {
  const ui = await mount({ lookId: "ruby-velvet" });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "选择外观模特：反差婊" }));
  assert.equal(JSON.parse(localStorage.getItem("muyu-state-v2")).lookId, "fancha-rose-office");

  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  assert.ok(ui.getByRole("button", { name: "鞋履库存：象牙白细跟鞋" }));
  assert.equal(ui.queryByRole("button", { name: "鞋履库存：黑色尖头高跟鞋" }), null);
  showAllWardrobeItems(ui);
  assert.equal(ui.getByRole("button", { name: "鞋履库存：黑色尖头高跟鞋" }).disabled, true);
  assert.equal(ui.getByRole("button", { name: "鞋履库存：象牙白软底拖鞋" }).disabled, true);
  fireEvent.click(ui.getByRole("button", { name: "什么都不穿（白色比基尼）" }));
  assert.ok(ui.getByText("白色比基尼适配待生成"));
  assert.equal(JSON.parse(localStorage.getItem("muyu-state-v2")).lookId, "fancha-rose-office");
  fireEvent.click(ui.getByRole("button", { name: "关闭衣柜" }));
  fireEvent.click(ui.getByRole("button", { name: "桌宠模式" }));
  assert.equal(JSON.parse(localStorage.getItem("muyu-state-v2")).lookId, "fancha-rose-office");
});

test("鞋履库存展示高跟鞋和拖鞋，并按外观模特保存选择", async () => {
  const ui = await mount({ lookId: "xuanling-golden-crown" });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  showAllWardrobeItems(ui);

  assert.ok(ui.getByRole("heading", { name: "独立鞋履库存" }));
  const heels = ui.getByRole("button", { name: "鞋履库存：黑色尖头高跟鞋" });
  assert.ok(ui.getByRole("button", { name: "鞋履库存：象牙白软底拖鞋" }));
  fireEvent.click(heels);

  assert.ok(ui.getByText(/已换上「黑色尖头高跟鞋」/));
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
    assert.equal(saved.wardrobeSelections.medusa.shoes, "black-pointed-heels");
  });
  assert.equal(heels.getAttribute("aria-pressed"), "true");
  const preview = ui.getByRole("region", { name: "选一种，陪你的模样" }).querySelector('[data-testid="live-pet"]');
  assert.match(preview.dataset.asset, /black-pointed-heels/);
  fireEvent.click(ui.getByRole("button", { name: "鞋履库存：象牙白软底拖鞋" }));
  assert.match(preview.dataset.asset, /ivory-soft-slippers/);
  fireEvent.click(ui.getByRole("button", { name: "恢复原造型鞋履" }));
  assert.equal(preview.dataset.asset, "/looks/xuanling-golden-crown/character.png");
});

test("saved fitted shoes survive restart and reach the main and pet renderers", async () => {
  const ui = await mountV2({ lookId: "xuanling-golden-crown", wardrobeSelections: { medusa: { shoes: "black-pointed-heels" } } });
  assert.match(ui.getByTestId("live-pet").dataset.asset, /black-pointed-heels/);
  fireEvent.click(ui.getByRole("button", { name: "桌宠模式" }));
  assert.match(ui.getByTestId("live-pet").dataset.asset, /black-pointed-heels/);
});

test("current Ruby white-base model wears fitted slippers and does not claim unfitted heels", async () => {
  const ui = await mount({ lookId: "ruby-white-bikini" });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  showAllWardrobeItems(ui);
  assert.equal(ui.getByRole("button", { name: "鞋履库存：黑色尖头高跟鞋" }).disabled, true);
  fireEvent.click(ui.getByRole("button", { name: "鞋履库存：象牙白软底拖鞋" }));
  assert.equal(ui.getByTestId("live-pet").dataset.asset, "/wardrobe/fits/ruby-white-bikini/ivory-soft-slippers/character.png");
  assert.equal(JSON.parse(localStorage.getItem("muyu-state-v2")).wardrobeSelections.ruby.shoes, "ivory-soft-slippers");
  fireEvent.click(ui.getByRole("button", { name: "什么都不穿（白色比基尼）" }));
  assert.equal(ui.getByTestId("live-pet").dataset.asset, "/looks/ruby-white-bikini/character.png");
});

test("blocked outfits disable shoe try-on and offer only fitted looks of the same model", async () => {
  const ui = await mount({ lookId: "ruby-white-bikini" });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  showAllWardrobeItems(ui);
  assert.equal(ui.getByRole("button", { name: "鞋履库存：黑色尖头高跟鞋" }).disabled, true);
  assert.ok(ui.getByText(/只推荐当前模特已适配的造型/));
  assert.equal(ui.queryByRole("button", { name: "切换到美杜莎试穿鞋履" }), null);
  fireEvent.click(ui.getByRole("button", { name: "切换到绯月 · 酒红丝绒适配黑色尖头高跟鞋" }));
  assert.equal(ui.getByRole("button", { name: "鞋履库存：黑色尖头高跟鞋" }).disabled, false);
  fireEvent.click(ui.getByRole("button", { name: "鞋履库存：黑色尖头高跟鞋" }));
  assert.match(ui.getByTestId("live-pet").dataset.asset, /ruby-velvet\/black-pointed-heels/);
});

test("reselecting fitted shoes or an already empty outfit does not leave the pet loading", async () => {
  const ui = await mount({ lookId: "linwei-white-bikini" });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  showAllWardrobeItems(ui);
  const heels = ui.getByRole("button", { name: "鞋履库存：黑色尖头高跟鞋" });
  fireEvent.click(heels);
  fireEvent.click(heels);
  fireEvent.click(ui.getByRole("button", { name: "关闭衣柜" }));
  assert.ok(ui.getByText(/正在你身边/));
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  const empty = ui.getByRole("button", { name: "什么都不穿（白色比基尼）" });
  fireEvent.click(empty);
  fireEvent.click(empty);
  fireEvent.click(ui.getByRole("button", { name: "关闭衣柜" }));
  assert.ok(ui.getByText(/正在你身边/));
});

test("same shoe fits independent models and uses each model's artwork", async () => {
  const ui = await mount({ lookId: "linwei-white-bikini" });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  showAllWardrobeItems(ui);
  fireEvent.click(ui.getByRole("button", { name: "鞋履库存：黑色尖头高跟鞋" }));
  assert.match(ui.getByTestId("live-pet").dataset.asset, /linwei-white-bikini\/black-pointed-heels/);
  fireEvent.click(ui.getByRole("button", { name: "选择外观模特：吴多慧" }));
  assert.equal(ui.queryByRole("button", { name: "鞋履库存：黑色尖头高跟鞋" }), null);
  showAllWardrobeItems(ui);
  fireEvent.click(ui.getByRole("button", { name: "鞋履库存：黑色尖头高跟鞋" }));
  assert.match(ui.getByTestId("live-pet").dataset.asset, /wuduohui-plaid-agent\/black-pointed-heels/);
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.wardrobeSelections.linwei.shoes, "black-pointed-heels");
  assert.equal(saved.wardrobeSelections.wuduohui.shoes, "black-pointed-heels");
});

test("已适配角色清空穿搭时会切到白色比基尼安全底装", async () => {
  const ui = await mount({ lookId: "ruby-velvet" });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
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

test("deleting a persona while its reply is pending discards the stale reply", async () => {
  const ui = await mountV2();
  fireEvent.click(ui.getByRole("button", { name: "女友", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "复制当前人格" }));
  fireEvent.click(ui.getByRole("button", { name: "返回陪伴" }));
  await submit(ui, "这是副本的问题");
  fireEvent.click(ui.getByRole("button", { name: "女友", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "删除这个副本" }));
  await resolveChat("过期回复");
  await act(() => new Promise((resolve) => setTimeout(resolve, 250)));

  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(Object.values(saved.personas).some((item) => item.displayName.endsWith("副本")), false);
  assert.doesNotMatch(ui.container.querySelector(".reply-text").textContent, /过期回复/);
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
  assert.deepEqual(voiceSelections, []);
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

test("女友本体页管理三个人格、亲密度、复制与独立语料", async () => {
 try {
  const base = restoreState(null);
  base.lookId = "ruby-velvet";
  const ui = await mountV2(base);
  fireEvent.click(ui.getByRole("button", { name: "女友", exact: true }));
  const page = ui.getByRole("region", { name: "女友本体" });
  await act(async () => {});
  assert.equal(ui.getAllByRole("button", { name: /^选择女友：/ }).length, 3);
  assert.ok(ui.getByText(/当前外观.*只是一层形象|外观.*不改变人格/));

  fireEvent.click(ui.getByRole("button", { name: "选择女友：林岚" }));
  fireEvent.change(ui.getByRole("textbox", { name: "人格名称" }), {
    target: { value: "岚总" },
  });
  fireEvent.click(ui.getByRole("button", { name: "亲密度：甜蜜" }));
  fireEvent.click(ui.getByRole("button", { name: "亲密度：成人" }));
  assert.ok(ui.getByRole("dialog", { name: "确认成人亲密模式" }));
  fireEvent.click(ui.getByRole("button", { name: "取消成人模式" }));
  let saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.personas["boss-girlfriend"].intimacyLevel, "sweet");
  assert.equal(saved.personas["boss-girlfriend"].adultAcknowledged, false);

  fireEvent.click(ui.getByRole("button", { name: "亲密度：成人" }));
  fireEvent.click(ui.getByRole("button", { name: "确认已成年并启用" }));
  saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.personas["boss-girlfriend"].intimacyLevel, "adult");
  assert.equal(saved.personas["boss-girlfriend"].adultAcknowledged, true);

  fireEvent.click(ui.getByRole("button", { name: "复制当前人格" }));
  fireEvent.change(ui.getByRole("spinbutton", { name: "人格年龄" }), {
    target: { value: "36" },
  });
  fireEvent.change(ui.getByRole("textbox", { name: "人格语料内容" }), {
    target: { value: "下班后先让我抱抱你。" },
  });
  fireEvent.click(ui.getByRole("button", { name: "添加人格语料" }));
  assert.ok(ui.getAllByText("下班后先让我抱抱你。").length >= 1);
  fireEvent.click(ui.getByRole("switch", { name: /启用语料/ }));
  fireEvent.click(ui.getByRole("button", { name: /删除人格语料/ }));

  saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  const copy = saved.personas[saved.activePersonaId];
  assert.equal(copy.custom, true);
  assert.equal(copy.age, 36);
  assert.equal(copy.customCorpora.length, 0);
  assert.equal(saved.lookId, "ruby-velvet");
  assert.equal(page.isConnected, true);
  await act(async () => {});
 } catch (error) {
  throw new Error(String(error?.message || error).replace(/\u001b\[[0-9;]*m/g, ""));
 }
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
  fireEvent.click(ui.getByRole("tab", { name: "背景" }));
  fireEvent.click(ui.getByRole("button", { name: /初见 · 日常/ }));
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).avatarMode,
    "photo",
  );
  fireEvent.click(ui.getByRole("button", { name: "选择外观模特：Haru" }));
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
  const savedBeforeSelection = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.deepEqual(
    ui.getAllByRole("button", { name: /^动态换装：/ }).map(button => button.getAttribute("aria-label")).sort(),
    getAvailableLooks(savedBeforeSelection.removedLookIds).map(look => `动态换装：${look.name}`).sort(),
  );
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
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 3);
  fireEvent.click(ui.getByRole("button", { name: "选择外观模特：知夏" }));
  fireEvent.click(ui.getByRole("button", { name: "筛选：中式" }));
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 2);
  fireEvent.change(ui.getByRole("searchbox", { name: "搜索当前模型的造型" }), {
    target: { value: "旗袍" },
  });
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 1);
  fireEvent.click(
    ui.getByRole("button", { name: "动态换装：知夏 · 翡翠旗袍" }),
  );
  fireEvent.change(ui.getByRole("searchbox", { name: "搜索当前模型的造型" }), {
    target: { value: "找不到的穿搭" },
  });
  assert.ok(ui.getByText("没有找到匹配的造型"));
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.lookId, "zhixia-qipao");
  assert.equal(saved.messages[0].content, "继续保留");
  fireEvent.click(ui.getByRole("button", { name: "清除筛选" }));
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 3);
  assert.equal(
    ui
      .getByRole("button", { name: "动态换装：知夏 · 翡翠旗袍" })
      .getAttribute("aria-pressed"),
    "true",
  );
});

test("pet wardrobe filters the expanded collection and keeps the chat draft when selecting a new companion", async () => {
  // This fixture explicitly restores archived appearances to exercise Amara's search results.
  const ui = await mount({ lookId: "ruby-velvet", appearanceArchiveVersion: 1, removedLookIds: [] });
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
  const ui = await mount({ lookId: "zhixia-qipao" });
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  const panel = ui.getByRole("region", { name: "选一种，陪你的模样" });
  panel.scrollTop = 1400;
  fireEvent.click(ui.getByRole("button", { name: "筛选：中式" }));
  assert.equal(panel.scrollTop, 0);
  panel.scrollTop = 777;
  const search = ui.getByRole("searchbox", { name: "搜索当前模型的造型" });
  search.focus();
  fireEvent.change(search, { target: { value: "旗袍" } });
  assert.equal(panel.scrollTop, 0);
  assert.equal(document.activeElement, search);
  assert.equal(ui.getAllByRole("button", { name: /^动态换装：/ }).length, 1);
});

test("pet wardrobe filtering returns to the results without taking search focus", async () => {
  // Intentional restore: filtering archived Amara remains supported after a user restores her.
  const ui = await mount({ appearanceArchiveVersion: 1, removedLookIds: [] });
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

test('persona voice selector previews its own selected profile',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>url==='/api/health'?{json:async()=>({ok:true,voice:true,voiceProfile:{mode:'reference',name:'参考音色',available:true,local:true}})}:original(url,options);
 const ui=await mount();fireEvent.click(ui.getByRole('button',{name:'女友',exact:true}));
 assert.ok(ui.getByRole('heading',{name:'选择沈知意的声音'}));
 fireEvent.click(ui.getByRole('button',{name:'试听当前音色',exact:true}));
 assert.match(globalThis.__speechCalls.at(-1),/你好，我是沈知意/);
 assert.equal(globalThis.__speechProfiles.at(-1),'builtin');
 await act(async()=>{});
});

test("voice settings display the active persona's shared card instead of the legacy backend default", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => url === "/api/health"
    ? { json: async () => ({ok:true,voiceProfile:{mode:"reference",name:"原始参考音色"}}) }
    : original(url, options);
  const base = restoreState(null);
  base.personas["older-sister"].voiceProfileId = "older-voice";
  const ui = await mountV2(base);
  fireEvent.click(ui.getByRole("button", {name:"设置",exact:true}));
  await waitFor(()=>assert.ok(ui.getByText("旧音色 · 本机流式朗读")));
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
 const ui=await mountV2();fireEvent.click(ui.getByRole('button',{name:'女友',exact:true}));
 await waitFor(()=>assert.ok(ui.getByText('温柔声音')));
 fireEvent.click(ui.getByRole('button',{name:'使用音色：温柔声音',exact:true}));
 await waitFor(()=>assert.equal(JSON.parse(localStorage.getItem('muyu-state-v2')).personas['older-sister'].voiceProfileId,'custom'));
 fireEvent.click(ui.getByRole('button',{name:'返回陪伴',exact:true}));
 fireEvent.click(ui.getByRole('button',{name:'朗读',exact:true}));
 await waitFor(()=>assert.ok(ui.getByRole('button',{name:'重命名温柔声音'})));
 fireEvent.click(ui.getByRole('button',{name:'重命名温柔声音'}));fireEvent.change(ui.getByRole('textbox',{name:'新音色名称'}),{target:{value:'夜晚声音'}});fireEvent.click(ui.getByRole('button',{name:'保存名称'}));await waitFor(()=>assert.ok(ui.getByText('夜晚声音')));
 fireEvent.click(ui.getByRole('button',{name:'＋ 添加音色'}));assert.ok(ui.getByLabelText('1. 选择录音'));
});

test("voice binding follows each persona while auditions leave persisted selections alone", async () => {
  const original = globalThis.fetch;
  const snapshot = () => ({
    selectedId: "builtin",
    voices: [
      { id: "builtin", name: "原始参考音色", builtin: true, duration: 5.4 },
      { id: "custom", name: "姐姐音色", builtin: false, duration: 6 },
    ],
  });
  globalThis.fetch = async (url, options) => {
    if (url === "/api/voices") return { ok: true, json: async () => snapshot() };
    return original(url, options);
  };

  const ui = await mountV2();
  fireEvent.click(ui.getByRole("button", { name: "女友", exact: true }));
  await waitFor(() => assert.ok(ui.getByText("姐姐音色")));
  fireEvent.click(ui.getByRole("button", { name: "使用音色：姐姐音色", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "试听音色：原始参考音色" }));
  assert.equal(globalThis.__speechProfiles.at(-1), "builtin");
  assert.equal(ui.getByRole("button", { name: "使用音色：姐姐音色" }).textContent, "使用中");
  fireEvent.click(ui.getByRole("button", { name: "选择女友：夏桃" }));
  await act(async () => {});

  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
    assert.equal(saved.personas["older-sister"].voiceProfileId, "custom");
    assert.equal(saved.personas["adult-younger"].voiceProfileId, "builtin");
  });
  assert.equal(ui.getByRole("button", { name: "使用音色：原始参考音色" }).textContent, "使用中");
  assert.deepEqual(voiceSelections, []);
});

test("shared voice studio is independent and previews every card without binding a girlfriend", async () => {
  libraryVoices.push({id:"custom",name:"公共音色",builtin:false,duration:6});
  const ui = await mountV2();
  const before = JSON.parse(localStorage.getItem("muyu-state-v2")).personas;
  const opener = ui.getByRole("button", { name: "朗读", exact: true });
  opener.focus();
  fireEvent.click(opener);
  const studio = ui.getByRole("region", { name: "朗读工作台" });
  await waitFor(() => assert.equal(document.activeElement, studio));
  assert.equal(studio.parentElement, document.body);
  assert.equal(ui.container.querySelector("main").hasAttribute("inert"), true);
  assert.equal(ui.container.querySelector("main").getAttribute("aria-hidden"), "true");
  await waitFor(()=>assert.ok(ui.getAllByText("公共音色").length >= 2));
  assert.equal(ui.queryByRole("button", { name: /使用音色：/ }), null);
  fireEvent.click(ui.getByRole("button", { name: "试听音色：公共音色" }));
  assert.equal(globalThis.__speechProfiles.at(-1), "custom");
  assert.deepEqual(JSON.parse(localStorage.getItem("muyu-state-v2")).personas, before);
  assert.deepEqual(voiceSelections, []);
  fireEvent.click(ui.getByRole("button", { name: "返回陪伴", exact: true }));
  await waitFor(() => assert.equal(document.activeElement, opener));
  assert.equal(ui.container.querySelector("main").hasAttribute("inert"), false);
  assert.equal(ui.container.querySelector("main").hasAttribute("aria-hidden"), false);
});

test("a voice referenced by any girlfriend or saved corpus cannot be deleted", async () => {
  libraryVoices.push({id:"custom",name:"保留音色",builtin:false,duration:6});
  const base = restoreState(null);
  base.personas["older-sister"].voiceProfileId = "custom";
  base.personas["adult-younger"].customCorpora = [{
    id: "kept-line",
    title: "保留的语料",
    text: "这条要保留原音色。",
    category: "fallback",
    level: "mature",
    enabled: true,
    voiceProfileId: "custom",
  }];
  const ui = await mountV2(base);
  const before = JSON.parse(localStorage.getItem("muyu-state-v2")).personas;
  fireEvent.click(ui.getByRole("button", {name:"朗读",exact:true}));
  const deleteButton = await waitFor(() =>
    ui.getByRole("button", {name:"删除保留音色"}),
  );
  assert.equal(deleteButton.disabled, true);
  assert.match(deleteButton.title, /正在被女友或语料使用/);
  assert.deepEqual(
    JSON.parse(localStorage.getItem("muyu-state-v2")).personas,
    before,
  );
});

test("an open delete confirmation locks as soon as a corpus starts using that voice", async () => {
  libraryVoices.push({id:"custom",name:"待使用音色",builtin:false,duration:6});
  const ui = await mountV2();
  fireEvent.click(ui.getByRole("button", {name:"朗读",exact:true}));
  await waitFor(() => ui.getByRole("button", {name:"删除待使用音色"}));
  fireEvent.click(ui.getByRole("button", {name:"删除待使用音色"}));
  const confirmDelete = ui.getByRole("button", {name:"确认删除"});
  assert.equal(confirmDelete.disabled, false);

  fireEvent.change(ui.getByRole("combobox", {name:"朗读音色"}), {
    target: {value:"custom"},
  });
  fireEvent.change(ui.getByRole("textbox", {name:"朗读文本"}), {
    target: {value:"保留这次试听的声音。"},
  });
  fireEvent.click(ui.getByRole("button", {name:"保存为沈知意的语料"}));
  await waitFor(() => assert.equal(confirmDelete.disabled, true));
  assert.match(confirmDelete.title, /正在被女友或语料使用/);
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2"))
      .personas["older-sister"].customCorpora[0].voiceProfileId,
    "custom",
  );
});

test("reading studio auditions entered text with the chosen voice and saves that pairing", async () => {
  try {
    libraryVoices.push({ id: "custom", name: "姐姐音色", builtin: false, duration: 6 });
    const ui = await mountV2();

    fireEvent.click(ui.getByRole("button", { name: "朗读", exact: true }));
    assert.ok(ui.getByRole("region", { name: "朗读工作台" }));
    await waitFor(() => assert.ok(ui.getByRole("option", { name: "姐姐音色" })));
    fireEvent.change(ui.getByRole("combobox", { name: "朗读音色" }), {
      target: { value: "custom" },
    });
    fireEvent.change(ui.getByRole("textbox", { name: "语料名称" }), {
      target: { value: "睡前问候" },
    });
    const textArea = ui.getByRole("textbox", { name: "朗读文本" });
    assert.equal(textArea.maxLength, 240);
    fireEvent.change(textArea, {
      target: { value: "晚安，今晚也做个好梦。" },
    });

    globalThis.__holdSpeech = true;
    fireEvent.click(ui.getByRole("button", { name: "读给我听", exact: true }));
    assert.equal(globalThis.__speechCalls.at(-1), "晚安，今晚也做个好梦。");
    assert.equal(globalThis.__speechProfiles.at(-1), "custom");
    const stopsBeforeManualStop = globalThis.__speechStops;
    const stopButton = ui
      .getAllByRole("button", { name: "停止朗读", exact: true })
      .find((button) => button.classList.contains("voice-preview-button"));
    assert.ok(stopButton);
    fireEvent.click(stopButton);
    assert.equal(globalThis.__speechStops, stopsBeforeManualStop + 1);
    globalThis.__holdSpeech = false;

    fireEvent.click(ui.getByRole("button", { name: "保存为沈知意的语料" }));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
      const item = saved.personas["older-sister"].customCorpora[0];
      assert.equal(item.title, "睡前问候");
      assert.equal(item.text, "晚安，今晚也做个好梦。");
      assert.equal(item.voiceProfileId, "custom");
      assert.equal(saved.personas["older-sister"].voiceProfileId, "builtin");
      assert.equal(saved.personas["adult-younger"].customCorpora.length, 0);
    });
    fireEvent.change(ui.getByRole("combobox", { name: "朗读音色" }), {
      target: { value: "builtin" },
    });
    fireEvent.click(ui.getByRole("button", { name: "用姐姐音色朗读语料：睡前问候" }));
    assert.equal(globalThis.__speechCalls.at(-1), "晚安，今晚也做个好梦。");
    assert.equal(globalThis.__speechProfiles.at(-1), "custom");
  } catch (error) {
    throw new Error(String(error?.message || error).replace(/\u001b\[[0-9;]*m/g, ""));
  }
});

test("opening a side panel focuses it without scrolling the clipped app root", async () => {
  const originalFocus = dom.window.HTMLElement.prototype.focus;
  const calls = [];
  dom.window.HTMLElement.prototype.focus = function (options) {
    calls.push({ label: this.getAttribute("aria-label"), options });
    return originalFocus.call(this, options);
  };
  try {
    const ui = await mountV2();
    fireEvent.click(ui.getByRole("button", { name: "设置", exact: true }));
    await waitFor(() =>
      assert.ok(calls.some((call) => call.label === "让陪伴，更像你喜欢的")),
    );
    const panelFocus = calls.find(
      (call) => call.label === "让陪伴，更像你喜欢的",
    );
    assert.deepEqual(panelFocus.options, { preventScroll: true });
    fireEvent.click(ui.getByRole("button", { name: "关闭面板" }));
    await waitFor(() => assert.ok(calls.length >= 2));
    assert.deepEqual(calls.at(-1).options, { preventScroll: true });
  } finally {
    dom.window.HTMLElement.prototype.focus = originalFocus;
  }
});

test("panel and reading styles preserve wheel, pointer, and touch scrolling", async () => {
  const css = `${await readFile(new URL("../src/styles.css", import.meta.url), "utf8")}
${await readFile(new URL("../src/voice-library.css", import.meta.url), "utf8")}`;
  const layout = new JSDOM(`
    <style>${css}</style>
    <div class="app animated-world">
      <main class="main-stage">
        <section class="voice-studio"><textarea></textarea></section>
        <section class="side-panel settings"><div class="panel-heading"></div></section>
      </main>
      <div class="live-pet"><canvas style="touch-action:none"></canvas></div>
    </div>
  `);
  try {
    const style = (selector) =>
      layout.window.getComputedStyle(layout.window.document.querySelector(selector));
    assert.equal(style(".app").overflow, "clip");
    assert.equal(style(".side-panel").overflowY, "auto");
    assert.equal(style(".panel-heading").position, "sticky");
    assert.equal(style(".voice-studio").pointerEvents, "auto");
    assert.equal(style(".voice-studio textarea").pointerEvents, "auto");
    const compactStudio = layout.window.document.createElement("section");
    compactStudio.className = "voice-studio compact";
    layout.window.document.body.append(compactStudio);
    assert.equal(layout.window.getComputedStyle(compactStudio).left, "0px");
    assert.equal(layout.window.getComputedStyle(compactStudio).bottom, "0px");
    const canvasRule = [...layout.window.document.styleSheets[0].cssRules]
      .find((rule) => rule.selectorText === ".live-pet canvas");
    assert.equal(canvasRule.style.getPropertyValue("touch-action"), "pan-y");
    assert.equal(canvasRule.style.getPropertyPriority("touch-action"), "important");
  } finally {
    layout.window.close();
  }
});

test("leaving reading studio keeps the user's new navigation focus", async () => {
  const ui = await mountV2();
  fireEvent.click(ui.getByRole("button", {name:"朗读",exact:true}));
  await waitFor(() =>
    assert.equal(document.activeElement, ui.getByRole("region", {name:"朗读工作台"})),
  );
  const personasButton = ui.getByRole("button", {name:"女友",exact:true});
  personasButton.focus();
  fireEvent.click(personasButton);
  await waitFor(() => assert.ok(ui.getByRole("region", {name:"女友本体"})));
  assert.equal(document.activeElement, personasButton);
});

test("opening reading studio from settings restores focus to the reading button", async () => {
  const ui = await mountV2();
  fireEvent.click(ui.getByRole("button", {name:"设置",exact:true}));
  await waitFor(() => ui.getByRole("region", {name:"让陪伴，更像你喜欢的"}));
  const readingButton = ui.getByRole("button", {name:"朗读",exact:true});
  readingButton.focus();
  fireEvent.click(readingButton);
  await waitFor(() =>
    assert.equal(document.activeElement, ui.getByRole("region", {name:"朗读工作台"})),
  );
  fireEvent.click(ui.getByRole("button", {name:"返回陪伴",exact:true}));
  await waitFor(() => assert.equal(document.activeElement, readingButton));
});

test("command K exits reading studio and focuses the chat input after inert clears", async () => {
  const ui = await mountV2();
  fireEvent.click(ui.getByRole("button", {name:"朗读",exact:true}));
  await waitFor(() =>
    assert.equal(document.activeElement, ui.getByRole("region", {name:"朗读工作台"})),
  );
  fireEvent.keyDown(window, {key:"k",metaKey:true});
  const input = ui.getByRole("textbox", {name:/对沈知意说点什么/});
  // Focus is deferred until inert clears. Compare identity without serializing
  // the transient DOM/React graph in an assertion error on every polling pass.
  await waitFor(() => assert.ok(document.activeElement === input));
  assert.equal(ui.queryByRole("region", {name:"朗读工作台"}), null);
  assert.equal(ui.container.querySelector("main").hasAttribute("inert"), false);
});

test("saving a new shared voice does not automatically bind it to the active persona", async () => {
  const originalFetch = globalThis.fetch;
  dom.window.AudioContext = class { async decodeAudioData(){ return {duration:6}; } async close(){} };
  globalThis.OfflineAudioContext = class {
    destination = {};
    createBufferSource(){ return {connect(){},start(){}}; }
    async startRendering(){ return {getChannelData:()=>new Float32Array(144000).fill(.1)}; }
  };
  const previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => "blob:voice-import";
  URL.revokeObjectURL = () => {};
  globalThis.fetch = async (url, options) => {
    if(url === "/api/voices" && options?.method === "POST") {
      const payload = JSON.parse(options.body);
      const voice = {id:"new-shared",name:payload.name,referenceText:"新录音台词。",duration:6,builtin:false};
      libraryVoices.push(voice);
      return {ok:true,json:async()=>({voice,voices:libraryVoices,selectedId:"builtin"})};
    }
    return originalFetch(url, options);
  };
  try {
    const ui = await mountV2();
    const before = JSON.parse(localStorage.getItem("muyu-state-v2")).personas;
    fireEvent.click(ui.getByRole("button", {name:"朗读",exact:true}));
    await waitFor(()=>assert.ok(ui.getByText("旧音色")));
    fireEvent.click(ui.getByRole("button", {name:"＋ 添加音色"}));
    await act(async()=>fireEvent.change(ui.getByLabelText("1. 选择录音"), {target:{files:[{name:"新声音.wav",size:1000,arrayBuffer:async()=>new ArrayBuffer(8)}]}}));
    fireEvent.click(ui.getByRole("button", {name:"制作并保存音色"}));
    await waitFor(()=>assert.ok(ui.getAllByText("新声音").length >= 2));
    assert.deepEqual(JSON.parse(localStorage.getItem("muyu-state-v2")).personas, before);
    assert.deepEqual(voiceSelections, []);
  } finally {
    delete dom.window.AudioContext;
    delete globalThis.OfflineAudioContext;
    URL.createObjectURL = previousCreate;
    URL.revokeObjectURL = previousRevoke;
  }
});

test("custom and built-in corpus auditions resolve only allowed names using the persona selected voice", async () => {
  libraryVoices.push({id:"custom",name:"公共音色",builtin:false,duration:6});
  const base = restoreState(null);
  base.personas["older-sister"].voiceProfileId = "custom";
  base.personas["older-sister"].customCorpora = [{id:"line",title:"专属问候",text:"{userName}，{personaName}在这里。",category:"greeting",level:"mature",enabled:true,voiceProfileId:"builtin"}];
  base.personaThreads["older-sister"].memories.entries = [{id:"user-name",kind:"fact",text:"用户称呼：阿远",status:"active",source:"manual",createdAt:Date.now(),updatedAt:Date.now()}];
  const ui = await mountV2(base);
  fireEvent.click(ui.getByRole("button", { name: "女友", exact: true }));
  await waitFor(()=>assert.ok(ui.getByText("公共音色")));
  const before = JSON.parse(localStorage.getItem("muyu-state-v2"));
  fireEvent.click(ui.getByRole("button", { name: "试听语料：专属问候" }));
  assert.equal(globalThis.__speechCalls.at(-1), "阿远，沈知意在这里。");
  assert.equal(globalThis.__speechProfiles.at(-1), "builtin");
  fireEvent.click(ui.getByRole("button", { name: "试听内置语料：见面" }));
  assert.doesNotMatch(globalThis.__speechCalls.at(-1), /\{(?:userName|personaName)\}/);
  assert.equal(globalThis.__speechProfiles.at(-1), "custom");
  assert.deepEqual(JSON.parse(localStorage.getItem("muyu-state-v2")).personas, before.personas);
  assert.deepEqual(voiceSelections, []);
});


test("streaming replies are visible and spoken before completion, then saved exactly once", async () => {
  const ui = await mount({settings:{voice:true,motion:false}});
  await submit(ui,"今天做了很有挑战的事");
  assert.equal(chatPayload.stream,true);
  assert.ok(chatPayload.companionContext.memories.length <= 6);
  let channel;
  const response = new Response(new ReadableStream({start(c){channel=c;}}),{headers:{"Content-Type":"application/x-ndjson"}});
  const emit = value => channel.enqueue(new TextEncoder().encode(JSON.stringify(value)+"\n"));
  await act(async()=>{chatResolve("",{response});emit({delta:"辛苦了。"});await new Promise(resolve=>setTimeout(resolve,0));});
  assert.ok(ui.getByText("辛苦了。"));
  await waitFor(()=>assert.equal(globalThis.__speechCalls[0],"辛苦了。"));
  let saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.messages.filter(item=>item.role==="assistant").length,0);
  await act(async()=>{emit({delta:"喝点水吧。"});emit({done:true,result:{reply:"辛苦了。喝点水吧。",provider:"ollama"}});channel.close();});
  await waitFor(()=>assert.equal(globalThis.__speechCalls.length,2));
  saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.deepEqual(saved.messages.filter(item=>item.role==="assistant").map(item=>item.content),["辛苦了。喝点水吧。"]);
});

test("switching companions while streaming cancels audio and prevents an old reply entering the new thread", async () => {
  const ui = await mountV2();
  await submit(ui,"今天过得怎么样");
  let channel;
  const response = new Response(new ReadableStream({start(c){channel=c;},cancel(){}}),{headers:{"Content-Type":"application/x-ndjson"}});
  await act(async()=>{chatResolve("",{response});channel.enqueue(new TextEncoder().encode('{"delta":"我在听。"}\n'));await new Promise(resolve=>setTimeout(resolve,0));});
  fireEvent.click(ui.getByRole("button",{name:"女友",exact:true}));
  fireEvent.click(ui.getByRole("button",{name:"选择女友：夏桃"}));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(saved.activePersonaId,"adult-younger");
  assert.equal(saved.personaThreads["adult-younger"].messages.length,0);
  assert.equal(saved.personaThreads["older-sister"].messages.filter(item=>item.role==="assistant").length,0);
  assert.equal(ui.queryByText("我在听。"),null);
});


test("switching or deleting a companion with the same appearance keeps the rendered character ready", async () => {
  const ui = await mountV2({lookId:"ruby-velvet",avatarMode:"live2d"});
  await waitFor(()=>assert.equal(ui.queryAllByText(/正在换好衣服/).length,0));
  fireEvent.click(ui.getByRole("button",{name:"女友",exact:true}));
  fireEvent.click(ui.getByRole("button",{name:"选择女友：林岚"}));
  fireEvent.click(ui.getByRole("button",{name:"返回陪伴",exact:true}));
  assert.equal(ui.queryAllByText(/正在换好衣服/).length,0);
});

test("unlocked companion activities stay disabled until the current reply finishes", async () => {
  const base = restoreState(null);
  base.personaThreads["older-sister"].relationship = {
    completedCount: 16,
    kindCounts: {date:5,movie:4,focus:4,support:3},
    experiences: [],
  };
  const ui = await mountV2(base);
  await submit(ui,"先回答这一条");
  try {
    fireEvent.click(ui.getByRole("button",{name:"女友",exact:true}));
    const activity = ui.getByRole("button",{name:"回顾共同经历",exact:true});
    assert.equal(activity.disabled,true);
    fireEvent.click(activity);
    assert.ok(ui.getByRole("region",{name:"女友本体"}));
    assert.equal(chatPayload.message,"先回答这一条");
  } finally {
    await resolveChat("我听到啦，我们慢慢聊。");
  }
  await waitFor(()=>assert.equal(ui.getByRole("button",{name:"回顾共同经历",exact:true}).disabled,false));
});


test("reading studio releases the hidden portrait and returning does not replay a consumed gesture", async () => {
  const ui = await mountV2({ lookId: "yinyue-silver-fox" });
  fireEvent.click(ui.getByRole("button", { name: "银月的动作" }));
  fireEvent.click(ui.getByRole("menuitem", { name: "双手比心" }));
  assert.equal(ui.getByTestId("live-pet").dataset.action, "cute_heart");
  fireEvent.click(ui.getByRole("button", { name: "朗读", exact: true }));
  assert.equal(ui.queryByTestId("live-pet"), null, "covered artwork must release its WebGL renderer");
  fireEvent.click(ui.getByRole("button", { name: "返回陪伴", exact: true }));
  assert.equal(ui.getByTestId("live-pet").dataset.action, "", "return to the resting portrait without reloading the old gesture");
});

function exclusiveState(lookId = "mei-ning-teal-attire") {
  const base = restoreState(null);
  return { ...base, lookId, avatarMode: "live2d", settings: { ...base.settings, voice: true, motion: false } };
}
function storedAssistantLines() {
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  return saved.personaThreads[saved.activePersonaId].messages.filter(item => item.role === "assistant").map(item => item.content);
}
function assertNoCharacterLine(ui) {
  assert.equal(ui.container.querySelector(".reply-text"), null);
  assert.equal(ui.queryByRole("button", { name: "朗读回复" }), null);
  assert.ok(ui.getByRole("status", { name: "角色语料状态" }).textContent.trim());
}

for (const lookId of ["wen-furen-black-gold", "ling-yuling-jade-robes", "mei-ning-teal-attire"]) {
  test(`exclusive corpus ${lookId} starts with a separate status and never stock greetings`, async () => {
    const ui = await mountV2(exclusiveState(lookId));
    assertNoCharacterLine(ui);
    assert.deepEqual(globalThis.__speechCalls, []);
    assert.deepEqual(storedAssistantLines(), []);
  });
}

test("exclusive corpus gestures and focus still work without invented action or completion dialogue", async () => {
  const ui = await mountV2(exclusiveState());
  for (const [name, action] of [["摸摸头", "pat"], ["打个招呼", "wave"], ["害羞一下", "shy"]]) {
    fireEvent.click(ui.getByRole("button", { name, exact: true }));
    assert.equal(ui.getByTestId("live-pet").dataset.action, action);
    assertNoCharacterLine(ui);
  }
  fireEvent.click(ui.getByRole("button", { name: "专注", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "开始专注", exact: true }));
  assertNoCharacterLine(ui);
  const realNow = Date.now;
  Date.now = () => realNow() + 1501000;
  try {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
    await waitFor(() => assert.ok(ui.getByRole("button", { name: "再来一段" })));
  } finally { Date.now = realNow; }
  assertNoCharacterLine(ui);
  assert.deepEqual(globalThis.__speechCalls, []);
  assert.deepEqual(storedAssistantLines(), []);
});

test("exclusive corpus accepts a literal verified reply and binds ordinary speech to its look", async () => {
  const ui = await mountV2(exclusiveState());
  const line = "梅凝一定勉励修行";
  assert.equal(isAllowedExclusiveCorpusText("mei-ning", line), true);
  await submit(ui, "好好修行");
  await resolveChat(line);
  assert.equal(ui.container.querySelector(".reply-text").textContent, line);
  assert.deepEqual(storedAssistantLines(), [line]);
  assert.deepEqual(globalThis.__speechCalls, [line]);
  assert.equal(globalThis.__speechOptions[0].lookId, "mei-ning-teal-attire");
  fireEvent.click(ui.getByRole("button", { name: "朗读回复" }));
  assert.deepEqual(globalThis.__speechCalls, [line, line]);
});

test("exclusive corpus drops generated and other-character replies without saving or speaking them", async () => {
  const ui = await mountV2(exclusiveState());
  await submit(ui, "讲个太空旅行笑话");
  await resolveChat("今天也会一直陪着你。");
  assertNoCharacterLine(ui);
  assert.match(ui.getByRole("status", { name: "角色语料状态" }).textContent, /没有适合|没有匹配/);
  chatResolve = null;
  await submit(ui, "身体如何");
  await resolveChat("并无大碍");
  assertNoCharacterLine(ui);
  assert.deepEqual(storedAssistantLines(), []);
  assert.deepEqual(globalThis.__speechCalls, []);
});

test("exclusive corpus empty and failing requests show status rather than assistant fallback messages", async () => {
  const ui = await mountV2(exclusiveState("wen-furen-black-gold"));
  await submit(ui, "你好");
  await resolveChat("");
  assertNoCharacterLine(ui);
  assert.match(ui.getByRole("status", { name: "角色语料状态" }).textContent, /尚待核验/);
  chatResolve = null;
  await submit(ui, "请回复");
  await act(async () => { chatResolve("", { response: { ok: false, json: async () => ({ error: "fixture failure" }) } }); });
  assertNoCharacterLine(ui);
  assert.match(ui.getByRole("status", { name: "角色语料状态" }).textContent, /服务暂不可用/);
  assert.deepEqual(storedAssistantLines(), []);
  assert.deepEqual(globalThis.__speechCalls, []);
});

test("exclusive corpus stream withholds every delta until its complete literal reply is verified", async () => {
  const ui = await mountV2(exclusiveState());
  await submit(ui, "修行加油");
  let channel;
  const response = new Response(new ReadableStream({ start(c) { channel = c; } }), { headers: { "Content-Type": "application/x-ndjson" } });
  const emit = value => channel.enqueue(new TextEncoder().encode(JSON.stringify(value) + "\n"));
  await act(async () => {
    chatResolve("", { response });
    emit({ delta: "这是一条未核验的流式台词。" });
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  assertNoCharacterLine(ui);
  assert.equal(ui.queryByText("这是一条未核验的流式台词。"), null);
  assert.deepEqual(globalThis.__speechCalls, []);
  assert.deepEqual(storedAssistantLines(), []);
  await act(async () => {
    emit({ done: true, result: { reply: "梅凝一定勉励修行", provider: "corpus" } });
    channel.close();
  });
  assert.equal(ui.container.querySelector(".reply-text").textContent, "梅凝一定勉励修行");
  assert.deepEqual(globalThis.__speechCalls, ["梅凝一定勉励修行"]);
  assert.deepEqual(storedAssistantLines(), ["梅凝一定勉励修行"]);
});

test("exclusive corpus hides incompatible old history but preserves it and excludes it from requests", async () => {
  const base = exclusiveState();
  base.personaThreads["older-sister"].messages = [
    { id: "old", role: "assistant", content: "属于旧角色的问候", createdAt: 1 },
    { id: "verified", role: "assistant", content: "梅凝一定勉励修行", createdAt: 2 },
  ];
  const ui = await mountV2(base);
  fireEvent.click(ui.getByRole("button", { name: "回忆", exact: true }));
  assert.equal(ui.queryByText("属于旧角色的问候"), null);
  assert.equal(ui.container.querySelector(".memory-message.assistant p").textContent, "梅凝一定勉励修行");
  fireEvent.click(ui.getByRole("button", { name: "回忆", exact: true }));
  await submit(ui, "修行");
  assert.deepEqual(chatPayload.history, [{ role: "assistant", content: "梅凝一定勉励修行" }]);
  await resolveChat("梅凝一定勉励修行");
  assert.deepEqual(storedAssistantLines(), ["属于旧角色的问候", "梅凝一定勉励修行", "梅凝一定勉励修行"]);
});

test("switching the visual character aborts old chat and stops voice before any late reply can arrive", async () => {
  const ui = await mountV2(exclusiveState("ruby-velvet"));
  await submit(ui, "请晚一点回复");
  const previousSignal = chatSignal;
  const oldReply = chatResolve;
  const beforeStops = globalThis.__speechStops;
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "选择外观模特：梅凝" }));
  assert.equal(previousSignal.aborted, true);
  assert.ok(globalThis.__speechStops > beforeStops);
  await act(async () => { oldReply("不能带进梅凝的旧回复"); });
  fireEvent.click(ui.getByRole("button", { name: "关闭衣柜" }));
  assertNoCharacterLine(ui);
  assert.equal(ui.queryByText("不能带进梅凝的旧回复"), null);
  assert.deepEqual(storedAssistantLines(), []);
  assert.deepEqual(globalThis.__speechCalls, []);
});

test("switching persona into a restricted appearance gates the greeting and cancels its predecessor", async () => {
  const base = exclusiveState("ruby-velvet");
  base.personas["adult-younger"].appearance = { lookId: "ling-yuling-jade-robes" };
  const ui = await mountV2(base);
  await submit(ui, "请晚一点回复");
  const previousSignal = chatSignal;
  fireEvent.click(ui.getByRole("button", { name: "女友", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "选择女友：夏桃" }));
  await resolveChat("旧人格的延迟回复");
  fireEvent.click(ui.getByRole("button", { name: "返回陪伴", exact: true }));
  assert.equal(previousSignal.aborted, true);
  assert.equal(ui.getByTestId("live-pet").dataset.look, "ling-yuling-jade-robes");
  assertNoCharacterLine(ui);
  assert.deepEqual(globalThis.__speechCalls, []);
  assert.deepEqual(storedAssistantLines(), []);
});

test("chat wardrobe commands still apply while their unverified target-character dialogue is blocked", async () => {
  const ui = await mountV2(exclusiveState("ruby-velvet"));
  await submit(ui, "换成梅凝");
  await act(async () => { chatResolve("我换好了，继续陪着你。", { lookAction: "mei-ning-teal-attire", petAction: "wave" }); });
  assert.equal(ui.getByTestId("live-pet").dataset.look, "mei-ning-teal-attire");
  assert.equal(ui.getByTestId("live-pet").dataset.action, "wave");
  assertNoCharacterLine(ui);
  assert.deepEqual(globalThis.__speechCalls, []);
  assert.deepEqual(storedAssistantLines(), []);
});

test("character corpus auditions are gated while independent reading remains available without a look binding", async () => {
  const base = exclusiveState();
  base.personas["older-sister"].customCorpora = [{ id: "line", title: "自编问候", text: "{userName}，一直陪着你。", category: "greeting", level: "mature", enabled: true, voiceProfileId: "builtin" }];
  const ui = await mountV2(base);
  fireEvent.click(ui.getByRole("button", { name: "女友", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "试听语料：自编问候" }));
  fireEvent.click(ui.getByRole("button", { name: "试听内置语料：见面" }));
  assert.deepEqual(globalThis.__speechCalls, []);
  assert.match(ui.getByRole("status", { name: "角色语料状态" }).textContent, /未朗读/);
  fireEvent.click(ui.getByRole("button", { name: "返回陪伴", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "朗读", exact: true }));
  await waitFor(() => assert.ok(ui.getByRole("option", { name: "旧音色" })));
  fireEvent.change(ui.getByRole("textbox", { name: "朗读文本" }), { target: { value: "用户自己的文章可以在这里朗读。" } });
  fireEvent.click(ui.getByRole("button", { name: "读给我听", exact: true }));
  assert.deepEqual(globalThis.__speechCalls, ["用户自己的文章可以在这里朗读。"]);
  assert.equal(globalThis.__speechOptions[0].lookId, undefined);
  assert.deepEqual(storedAssistantLines(), []);
});

test("exclusive corpus desktop pet displays an independent status and never a stock empty-state bubble", async () => {
  const base = exclusiveState("wen-furen-black-gold");
  const ui = await mountV2({ ...base, petMode: true });
  assert.ok(ui.getByRole("status", { name: "角色语料状态" }));
  assert.equal(ui.container.querySelector(".pet-bubble"), null);
  fireEvent.click(ui.getByRole("button", { name: "摸摸头", exact: true }));
  assert.equal(ui.getByTestId("live-pet").dataset.action, "pat");
  assert.equal(ui.container.querySelector(".pet-bubble"), null);
  assert.deepEqual(globalThis.__speechCalls, []);
});

test("exclusive corpus photo scene and clearing history cannot supply stock character dialogue", async () => {
  const ui = await mountV2(exclusiveState());
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "背景" }));
  fireEvent.click(ui.getByRole("button", { name: /初见 · 日常/ }));
  assert.equal(JSON.parse(localStorage.getItem("muyu-state-v2")).avatarMode, "photo");
  fireEvent.click(ui.getByRole("button", { name: "关闭衣柜" }));
  assertNoCharacterLine(ui);
  fireEvent.click(ui.getByRole("button", { name: "设置", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "清空记录", exact: true }));
  assertNoCharacterLine(ui);
  assert.deepEqual(globalThis.__speechCalls, []);
  assert.deepEqual(storedAssistantLines(), []);
});

test("exclusive corpus stream rejects an unverified final result as well as its partial sentences", async () => {
  const ui = await mountV2(exclusiveState());
  await submit(ui, "说点什么");
  const encoder = new TextEncoder();
  const response = new Response(new ReadableStream({ start(channel) {
    channel.enqueue(encoder.encode(JSON.stringify({ delta: "未核验的开头。" }) + "\n"));
    channel.enqueue(encoder.encode(JSON.stringify({ done: true, result: { reply: "未核验的开头。未核验的结尾。", provider: "ollama" } }) + "\n"));
    channel.close();
  } }), { headers: { "Content-Type": "application/x-ndjson" } });
  await act(async () => { chatResolve("", { response }); });
  assertNoCharacterLine(ui);
  assert.deepEqual(globalThis.__speechCalls, []);
  assert.deepEqual(storedAssistantLines(), []);
});

test("verified source dialogue picker plays exact material and clearly identifies an empty corpus", async () => {
  let ui = await mountV2(exclusiveState());
  const picker = ui.container.querySelector(".source-dialogue-picker");
  assert.ok(picker);
  assert.equal(picker.open, false);
  assert.match(picker.querySelector("summary").textContent, /^素材原句（[1-9]\d*）$/);
  fireEvent.click(picker.querySelector("summary"));
  const literal = "梅凝一定勉励修行";
  fireEvent.click(ui.getByRole("button", { name: `说这句：${literal}` }));
  assert.equal(ui.container.querySelector(".reply-text").textContent, literal);
  assert.deepEqual(globalThis.__speechCalls, [literal]);
  assert.equal(globalThis.__speechOptions[0].lookId, "mei-ning-teal-attire");
  assert.equal(chatPayload, null);
  cleanup();
  ui = await mountV2(exclusiveState("wen-furen-black-gold"));
  const emptyPicker = ui.container.querySelector(".source-dialogue-picker");
  assert.equal(emptyPicker.querySelector("summary").textContent, "素材原句（0）");
  fireEvent.click(emptyPicker.querySelector("summary"));
  assert.match(emptyPicker.textContent, /温夫人目前有 0 条已核验的本人台词/);
  assert.equal(ui.queryByRole("button", { name: /^说这句：/ }), null);
});

test("a successful switch from an empty exclusive corpus accepts the new character's real source reply", async () => {
  const ui = await mountV2(exclusiveState("wen-furen-black-gold"));
  await submit(ui, "换成梅凝，修行");
  const result = offlineReply(chatPayload);
  assert.equal(result.lookAction, "mei-ning-teal-attire");
  assert.equal(result.reply, "梅凝一定勉励修行");
  assert.equal(isAllowedExclusiveCorpusText("wen-furen", result.reply), false);
  await act(async () => { chatResolve(result.reply, result); });
  assert.equal(ui.getByTestId("live-pet").dataset.look, result.lookAction);
  assert.equal(ui.container.querySelector(".reply-text")?.textContent, result.reply);
  assert.deepEqual(storedAssistantLines(), [result.reply]);
  assert.deepEqual(globalThis.__speechCalls, [result.reply]);
  assert.equal(globalThis.__speechOptions[0].lookId, result.lookAction);
});

for (const [sourceLook, label] of [["ling-yuling-jade-robes", "previous character"], ["wen-furen-black-gold", "third character"]]) {
  test(`a successful exclusive character switch rejects the ${label}'s verified line`, async () => {
    const ui = await mountV2(exclusiveState(sourceLook));
    const otherLine = "并无大碍";
    assert.equal(isAllowedExclusiveCorpusText("ling-yuling", otherLine), true);
    assert.equal(isAllowedExclusiveCorpusText("mei-ning", otherLine), false);
    await submit(ui, "换成梅凝，修行");
    const result = offlineReply(chatPayload);
    assert.equal(result.lookAction, "mei-ning-teal-attire");
    await act(async () => { chatResolve(otherLine, { ...result, reply: otherLine }); });
    assert.equal(ui.getByTestId("live-pet").dataset.look, result.lookAction);
    assertNoCharacterLine(ui);
    assert.deepEqual(storedAssistantLines(), []);
    assert.deepEqual(globalThis.__speechCalls, []);
  });
}

test("stockings equip, switch and restore on a corpus-only character without introducing dialogue", async () => {
  const ui = await mountV2(exclusiveState("wen-furen-black-gold"));
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  fireEvent.click(ui.getByRole("button", { name: "筛选单品：袜类" }));
  for (const [itemId, name] of [["sheer-black-stockings", "黑色丝袜"], ["sheer-white-stockings", "白色丝袜"], ["black-fishnet-stockings", "黑色渔网袜"]]) {
    fireEvent.click(ui.getByRole("button", { name: `袜类库存：${name}` }));
    assert.equal(ui.getByTestId("live-pet").dataset.asset, `/wardrobe/fits/wen-furen-black-gold/${itemId}/character.png`);
    assert.equal(JSON.parse(localStorage.getItem("muyu-state-v2")).wardrobeSelections["wen-furen"].hosiery, itemId);
  }
  fireEvent.click(ui.getByRole("button", { name: "恢复原造型袜类" }));
  assert.equal(ui.getByTestId("live-pet").dataset.asset, "/looks/wen-furen-black-gold/character.png");
  assert.equal(JSON.parse(localStorage.getItem("muyu-state-v2")).wardrobeSelections["wen-furen"]?.hosiery, undefined);
  fireEvent.click(ui.getByRole("button", { name: "关闭衣柜" }));
  assertNoCharacterLine(ui);
  assert.deepEqual(globalThis.__speechCalls, []);
});

test("stockings survive character switches and reload while Yinyue keeps mesh gestures in her fitted portrait", async () => {
  const initial = exclusiveState("yinyue-silver-fox");
  let ui = await mountV2(initial);
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  fireEvent.click(ui.getByRole("button", { name: "筛选单品：袜类" }));
  fireEvent.click(ui.getByRole("button", { name: "袜类库存：黑色丝袜" }));
  fireEvent.click(ui.getByRole("button", { name: "选择外观模特：紫灵" }));
  fireEvent.click(ui.getByRole("button", { name: "袜类库存：白色丝袜" }));
  fireEvent.click(ui.getByRole("button", { name: "选择外观模特：银月" }));
  const saved = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.deepEqual(saved.wardrobeSelections.yinyue, { hosiery: "sheer-black-stockings" });
  assert.deepEqual(saved.wardrobeSelections.ziling, { hosiery: "sheer-white-stockings" });
  cleanup();
  ui = await mountV2(saved);
  assert.equal(ui.getByTestId("live-pet").dataset.asset, "/wardrobe/fits/yinyue-silver-fox/sheer-black-stockings/character.png");
  fireEvent.click(ui.getByRole("button", { name: "银月的动作" }));
  fireEvent.click(ui.getByRole("menuitem", { name: "俏皮双眨眼" }));
  assert.equal(ui.getByTestId("live-pet").dataset.action, "cute_double_blink");
  assert.equal(ui.getByTestId("live-pet").dataset.asset, "/wardrobe/fits/yinyue-silver-fox/sheer-black-stockings/character.png");
  fireEvent.click(ui.getByRole("button", { name: "银月的动作" }));
  assert.equal(ui.queryByRole("menuitem", { name: "双手比心" }), null);
});
