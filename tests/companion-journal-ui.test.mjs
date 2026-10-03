import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { restoreState } from "../src/state.mjs";
import { resolvePersonaProfile } from "../src/personas.mjs";
import { updatePersonaProfile } from "../src/persona-state.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:4317" });
for (const name of ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent"])
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import("react");
const { render, cleanup, fireEvent, act } = await import("@testing-library/react");
const temporary = await mkdtemp(path.join(process.cwd(), "node_modules/.companion-ui-"));
const bundle = path.join(temporary, "persona.cjs");
await build({
  entryPoints: ["src/PersonaPage.jsx"], outfile: bundle,
  bundle: true, platform: "node", format: "cjs", loader: { ".css": "empty" },
  external: ["react", "react-dom", "react/jsx-runtime"],
});
const PersonaPage = createRequire(import.meta.url)(bundle).default;
let saves, deletions, experiences, experienceUpdates, experienceDeletions, profileChanges, bindings, activities;
beforeEach(() => {
  saves = []; deletions = []; experiences = []; experienceUpdates = []; experienceDeletions = []; profileChanges = []; bindings = []; activities = [];
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ voices: [{ id: "builtin", name: "默认音色", builtin: true }], selectedId: "builtin" }) });
});
afterEach(cleanup);
after(async () => { await rm(temporary, { recursive: true, force: true }); dom.window.close(); });

function seed() {
  const state = restoreState(null);
  state.activePersonaId = "older-sister";
  for (const thread of Object.values(state.personaThreads)) {
    thread.memories.entries = [];
    thread.relationship = { experiences: [] };
  }
  state.personaThreads["older-sister"].memories.entries = [
    { id: "preference-1", kind: "preference", text: "喜欢热拿铁", status: "active", source: "manual", createdAt: 1, updatedAt: 1 },
    { id: "plan-1", kind: "plan", text: "周末一起看电影", status: "active", source: "manual", createdAt: 2, updatedAt: 2 },
  ];
  return state;
}

async function mount({ relationship } = {}) {
  function Harness() {
    const [state, setState] = React.useState(() => { const initial = seed(); if (relationship) initial.personaThreads["older-sister"].relationship = relationship; return initial; });
    const persona = state.personas[state.activePersonaId];
    const changeThread = (update) => setState(current => ({ ...current, personaThreads: {
      ...current.personaThreads,
      [persona.id]: update(current.personaThreads[persona.id]),
    } }));
    return React.createElement(PersonaPage, {
      state, activePersona: persona, activeSnapshot: resolvePersonaProfile(persona),
      appearanceCaption: "绯月 · 酒红丝绒", boundAppearanceCaption: "林薇 · 象牙白通勤",
      selectPersona: id => setState(current => ({ ...current, activePersonaId: id })),
      renamePersona() {}, setPersonaAge() {}, setIntimacy() {}, clonePersona() {}, removePersona() {},
      addCorpus: (text) => saves.push({ personaId: persona.id, corpus: text }), toggleCorpus() {}, deleteCorpus() {},
      onProfileChange: patch => {
        profileChanges.push({ personaId: persona.id, ...patch });
        setState(current => updatePersonaProfile(current, persona.id, { ...patch, ...(patch.mood ? { moodUpdatedAt: Date.now() } : {}) }));
      },
      onBindAppearance: () => bindings.push(persona.id),
      onStartActivity: prompt => activities.push({ personaId: persona.id, prompt }),
      onSaveMemory: entry => {
        saves.push({ personaId: persona.id, ...entry });
        changeThread(thread => ({ ...thread, memories: { ...thread.memories, entries: [
          ...thread.memories.entries.filter(item => item.id !== entry.id),
          { id: entry.id || "new-memory", status: "active", source: "manual", createdAt: 3, updatedAt: 3, ...entry },
        ] } }));
      },
      onDeleteMemory: id => {
        deletions.push({ personaId: persona.id, id });
        changeThread(thread => ({ ...thread, memories: { ...thread.memories, entries: thread.memories.entries.filter(item => item.id !== id) } }));
      },
      onRecordExperience: entry => {
        experiences.push({ personaId: persona.id, ...entry });
        changeThread(thread => ({ ...thread, relationship: { ...thread.relationship, experiences: [
          ...thread.relationship.experiences, { id: "experience-1", createdAt: Date.now(), ...entry },
        ] } }));
      },
      onUpdateExperience: (id, patch) => {
        experienceUpdates.push({ personaId: persona.id, id, ...patch });
        changeThread(thread => ({ ...thread, relationship: { ...thread.relationship, experiences:
          thread.relationship.experiences.map(entry => entry.id === id ? { ...entry, ...patch } : entry),
        } }));
      },
      onDeleteExperience: id => {
        experienceDeletions.push({ personaId: persona.id, id });
        changeThread(thread => ({ ...thread, relationship: { ...thread.relationship, experiences:
          thread.relationship.experiences.filter(entry => entry.id !== id),
        } }));
      },
      voiceProps: { onPreview() {}, onStop() {}, speaking: false }, onClose() {},
    });
  }
  const ui = render(React.createElement(Harness));
  await act(async () => {});
  return ui;
}

test("memory forms add, edit, complete a plan, and delete only the current persona's entries", async () => {
  const ui = await mount();
  fireEvent.click(ui.getByText("添加记忆", { selector: "summary" }));
  fireEvent.change(ui.getByRole("textbox", { name: "记忆内容" }), { target: { value: "下周五参加面试" } });
  fireEvent.click(ui.getByRole("button", { name: "保存记忆" }));
  assert.equal(saves.at(-1).personaId, "older-sister");
  assert.equal(saves.at(-1).text, "下周五参加面试");
  assert.ok(ui.getByText("下周五参加面试"));
  fireEvent.click(ui.getByRole("button", { name: "编辑记忆：喜欢热拿铁" }));
  fireEvent.change(ui.getByRole("textbox", { name: "记忆内容" }), { target: { value: "喜欢少糖热拿铁" } });
  fireEvent.click(ui.getByRole("button", { name: "保存记忆" }));
  assert.equal(saves.at(-1).id, "preference-1");
  assert.ok(ui.getByText("喜欢少糖热拿铁"));
  fireEvent.click(ui.getByRole("button", { name: "完成计划：周末一起看电影" }));
  assert.equal(saves.at(-1).id, "plan-1");
  assert.equal(saves.at(-1).status, "done");
  assert.equal(ui.queryByRole("button", { name: "完成计划：周末一起看电影" }), null);
  fireEvent.click(ui.getByRole("button", { name: "删除记忆：喜欢少糖热拿铁" }));
  assert.deepEqual(deletions, [{ personaId: "older-sister", id: "preference-1" }]);
  assert.equal(ui.queryByText("喜欢少糖热拿铁"), null);
});

test("switching personas isolates unfinished memory, experience, and corpus drafts", async () => {
  const ui = await mount();
  fireEvent.click(ui.getByText("添加记忆", { selector: "summary" }));
  fireEvent.change(ui.getByRole("textbox", { name: "记忆内容" }), { target: { value: "姐姐的记忆草稿" } });
  fireEvent.click(ui.getByText("记录已完成的共同经历", { selector: "summary" }));
  fireEvent.change(ui.getByRole("textbox", { name: "经历标题" }), { target: { value: "姐姐的约会草稿" } });
  fireEvent.change(ui.getByRole("textbox", { name: "人格语料内容" }), { target: { value: "姐姐的语料草稿" } });
  fireEvent.click(ui.getByRole("button", { name: "选择女友：林岚" }));
  assert.equal(ui.getByRole("textbox", { name: "人格语料内容" }).value, "");
  fireEvent.click(ui.getByText("添加记忆", { selector: "summary" }));
  assert.equal(ui.getByRole("textbox", { name: "记忆内容" }).value, "");
  fireEvent.click(ui.getByText("记录已完成的共同经历", { selector: "summary" }));
  assert.equal(ui.getByRole("textbox", { name: "经历标题" }).value, "");
  assert.equal(ui.queryByText("喜欢热拿铁"), null);
  assert.deepEqual(saves, []);
});

test("recording an experience requires a completed activity and submits its actual details", async () => {
  const ui = await mount();
  fireEvent.click(ui.getByText("记录已完成的共同经历", { selector: "summary" }));
  fireEvent.change(ui.getByRole("combobox", { name: "经历类型" }), { target: { value: "movie" } });
  fireEvent.change(ui.getByRole("textbox", { name: "经历标题" }), { target: { value: "一起看了海街日记" } });
  fireEvent.change(ui.getByRole("textbox", { name: "经历详情" }), { target: { value: "看完聊起家乡的夏天" } });
  assert.equal(ui.getByRole("button", { name: "保存共同经历" }).disabled, true);
  fireEvent.click(ui.getByRole("checkbox", { name: "这件事已经一起完成" }));
  fireEvent.click(ui.getByRole("button", { name: "保存共同经历" }));
  assert.deepEqual(experiences, [{ personaId: "older-sister", kind: "movie", title: "一起看了海街日记", detail: "看完聊起家乡的夏天" }]);
  assert.ok(ui.getByText("一起看了海街日记"));
});

test("personality, temporary mood, and saved appearance operate on the selected profile", async () => {
  const ui = await mount();
  fireEvent.change(ui.getByRole("textbox", { name: "自定义性格" }), { target: { value: "说话简洁，喜欢电影，遇事先听我讲完。" } });
  fireEvent.change(ui.getByRole("combobox", { name: "临时心情" }), { target: { value: "playful" } });
  assert.deepEqual(profileChanges.map(item => item.personaId), ["older-sister", "older-sister"]);
  assert.equal(profileChanges[1].mood, "playful");
  assert.ok(ui.getByText("林薇 · 象牙白通勤"));
  fireEvent.click(ui.getByRole("button", { name: "记住当前穿搭" }));
  assert.deepEqual(bindings, ["older-sister"]);
});

test("unlocked companionship starts a real conversation while another persona has its own progress", async () => {
  const ui = await mount({ relationship: { experiences: [], kindCounts: { date: 5, movie: 4, focus: 4, support: 3 } } });
  fireEvent.click(ui.getByRole("button", { name: "回顾共同经历" }));
  fireEvent.click(ui.getByRole("button", { name: "一起制定下一次计划" }));
  fireEvent.click(ui.getByRole("button", { name: "回顾陪伴里程碑" }));
  assert.deepEqual(activities.map(item => item.prompt), [
    "我们最近一起完成了哪些事？挑一件和我聊聊。",
    "根据我们之前的共同经历，一起想个下次可以完成的小计划。",
    "回顾一下我们的相处记录，有哪些值得纪念的变化？",
  ]);
  fireEvent.click(ui.getByRole("button", { name: "选择女友：林岚" }));
  assert.equal(ui.queryByRole("button", { name: "回顾共同经历" }), null);
});

test("typing personality text retains spaces while the persisted profile is normalized", async () => {
  const ui = await mount();
  const field = ui.getByRole("textbox", { name: "自定义性格" });
  fireEvent.change(field, { target: { value: "喜欢 indie " } });
  assert.equal(field.value, "喜欢 indie ");
  fireEvent.change(field, { target: { value: `${field.value}电影` } });
  assert.equal(profileChanges.at(-1).personality, "喜欢 indie 电影");
  fireEvent.click(ui.getByRole("button", { name: "选择女友：林岚" }));
  assert.equal(ui.getByRole("textbox", { name: "自定义性格" }).value, "");
});

test("experience corrections preserve the type, isolate editing drafts, and can be cancelled or forgotten", async () => {
  const ui = await mount({ relationship: { experiences: [
    { id: "movie-1", kind: "movie", title: "周五电影", detail: "记错的细节", createdAt: 1 },
  ], kindCounts: { movie: 1 } } });
  fireEvent.click(ui.getByText("共同经历日志 · 1 条", { selector: "summary" }));
  assert.ok(ui.getByText("忘记会移除内容，已积累的成长保留。"));
  fireEvent.click(ui.getByRole("button", { name: "编辑经历：周五电影" }));
  assert.equal(ui.getByRole("textbox", { name: "经历标题" }).value, "周五电影");
  assert.equal(ui.queryByRole("combobox", { name: "经历类型" }), null);
  assert.equal(ui.queryByRole("checkbox", { name: "这件事已经一起完成" }), null);
  fireEvent.change(ui.getByRole("textbox", { name: "经历标题" }), { target: { value: "周六一起看电影" } });
  fireEvent.change(ui.getByRole("textbox", { name: "经历详情" }), { target: { value: "看完一起聊了结尾" } });
  fireEvent.click(ui.getByRole("button", { name: "保存更正" }));
  assert.deepEqual(experienceUpdates, [{ personaId: "older-sister", id: "movie-1", title: "周六一起看电影", detail: "看完一起聊了结尾" }]);
  assert.deepEqual(experiences, []);

  fireEvent.click(ui.getByRole("button", { name: "编辑经历：周六一起看电影" }));
  fireEvent.change(ui.getByRole("textbox", { name: "经历标题" }), { target: { value: "还没保存的更正" } });
  fireEvent.click(ui.getByRole("button", { name: "选择女友：林岚" }));
  fireEvent.click(ui.getByText("记录已完成的共同经历", { selector: "summary" }));
  assert.equal(ui.getByRole("textbox", { name: "经历标题" }).value, "");
  fireEvent.click(ui.getByRole("button", { name: "选择女友：沈知意" }));
  fireEvent.click(ui.getByText("更正共同经历", { selector: "summary" }));
  assert.equal(ui.getByRole("textbox", { name: "经历标题" }).value, "还没保存的更正");
  fireEvent.click(ui.getByRole("button", { name: "取消编辑经历" }));
  assert.equal(ui.getByRole("textbox", { name: "经历标题" }).value, "");
  assert.equal(ui.getByRole("checkbox", { name: "这件事已经一起完成" }).checked, false);
  assert.equal(ui.getByRole("button", { name: "保存共同经历" }).disabled, true);
  assert.equal(experienceUpdates.length, 1);

  fireEvent.click(ui.getByText("共同经历日志 · 1 条", { selector: "summary" }));
  fireEvent.click(ui.getByRole("button", { name: "编辑经历：周六一起看电影" }));
  fireEvent.click(ui.getByRole("button", { name: "忘记经历：周六一起看电影" }));
  assert.deepEqual(experienceDeletions, [{ personaId: "older-sister", id: "movie-1" }]);
  assert.equal(ui.queryByText("周六一起看电影"), null);
  assert.equal(ui.getByRole("textbox", { name: "经历标题" }).value, "");
  assert.equal(ui.queryByRole("button", { name: "保存更正" }), null);
});
