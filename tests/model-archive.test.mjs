import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { restoreState } from "../src/state.mjs";
import { getAvailableLooks, getLook } from "../src/looks.mjs";
import { getCharacterForLook } from "../src/wardrobe.mjs";

const archivedIds = [
  "amara-royal",
  "amara-ankara",
  "zuri-sun",
  "zuri-pearl",
  "amara-white-bikini",
  "zuri-white-bikini",
];

test("new and legacy state archive every Amara and Zuri outfit", () => {
  for (const raw of [null, JSON.stringify({ schemaVersion: 1 }), JSON.stringify({ schemaVersion: 2 })]) {
    const state = restoreState(raw);
    assert.deepEqual(state.removedLookIds, archivedIds);
    assert.equal(getAvailableLooks(state.removedLookIds).length, 46);
    assert.equal(state.appearanceArchiveVersion, 1);
  }
});

test("archive migration preserves unrelated removals and removes duplicates", () => {
  const state = restoreState(JSON.stringify({
    removedLookIds: ["ruby-date", "amara-royal", "ruby-date", "unknown-look"],
  }));
  assert.deepEqual(state.removedLookIds, ["ruby-date", ...archivedIds]);
});

test("a selected archived outfit falls back to an available appearance", () => {
  for (const lookId of archivedIds) {
    const state = restoreState(JSON.stringify({ lookId, removedLookIds: ["ruby-velvet"] }));
    assert.equal(state.lookId, "songyu-azure-robes");
    assert.equal(state.lastLookByCharacter.songyu, "songyu-azure-robes");
  }
});

test("explicit outfit restoration survives later reloads after archive migration", () => {
  const migrated = restoreState(null);
  const restored = {
    ...migrated,
    lookId: "amara-white-bikini",
    removedLookIds: migrated.removedLookIds.filter((id) => id !== "amara-white-bikini"),
  };
  const once = restoreState(JSON.stringify(restored));
  const twice = restoreState(JSON.stringify(once));
  assert.equal(twice.lookId, "amara-white-bikini");
  assert.deepEqual(twice.removedLookIds, [
    "amara-royal", "amara-ankara", "zuri-sun", "zuri-pearl", "zuri-white-bikini",
  ]);
});

test("archiving appearances preserves persona voices, conversations and appearance profiles", () => {
  const before = restoreState(null);
  delete before.appearanceArchiveVersion;
  before.activePersonaId = "boss-girlfriend";
  before.personas["boss-girlfriend"].voiceProfileId = "custom-voice";
  before.personaThreads["boss-girlfriend"].messages = [
    { id: "kept-message", role: "assistant", content: "保留对话", createdAt: 10 },
  ];
  before.characterProfiles.amara = { displayName: "旧模特档案", corpora: [] };
  before.lastLookByCharacter.amara = "amara-royal";
  const after = restoreState(JSON.stringify(before));
  assert.deepEqual(after.personas, before.personas);
  assert.deepEqual(after.personaThreads, before.personaThreads);
  assert.equal(after.activePersonaId, "boss-girlfriend");
  assert.deepEqual(after.characterProfiles.amara, before.characterProfiles.amara);
  assert.equal(after.lastLookByCharacter.amara, "amara-royal");
});

const temporary = await mkdtemp(path.join(process.cwd(), "node_modules/.model-archive-test-"));
const bundle = path.join(temporary, "wardrobe.cjs");
await build({
  entryPoints: ["src/WardrobePage.jsx"],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["react", "react-dom", "react/jsx-runtime"],
  plugins: [{
    name: "isolate-native-renderer",
    setup(builder) {
      builder.onResolve({ filter: /^\.\/LivePet\.jsx$/ }, () => ({ path: "pet", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export default function LivePet(){return null}", loader: "js" }));
    },
  }],
});
const WardrobePage = createRequire(import.meta.url)(bundle).default;
after(() => rm(temporary, { recursive: true, force: true }));

function renderRoster(state) {
  const available = getAvailableLooks(state.removedLookIds);
  const markup = renderToStaticMarkup(React.createElement(WardrobePage, {
    state,
    currentLook: getLook(state.lookId),
    activeCharacter: getCharacterForLook(state.lookId),
    visibleLooks: available,
    availableLookCount: available.length,
    removedLookIds: state.removedLookIds,
    query: "",
    category: "全部",
    view: "active",
    petProps: {},
  }));
  const dom = new JSDOM(markup);
  const roster = dom.window.document.querySelector('[aria-label="外观模特列表"]');
  const buttons = [...roster.querySelectorAll("button")].filter(button => button.querySelector("img")).map((button) => ({
    label: button.getAttribute("aria-label"),
    thumbnail: button.querySelector("img").getAttribute("src"),
  }));
  dom.window.close();
  return buttons;
}

test("appearance roster hides models without available outfits and shows an explicitly restored model", () => {
  const state = restoreState(null);
  const roster = renderRoster(state);
  assert.equal(roster.length, 21);
  for (const name of ["温夫人", "凌玉灵", "梅凝"]) {
    assert.equal(roster.some(item => item.label === `选择外观模特：${name}`), true);
  }
  assert.equal(roster.some((item) => item.label === "选择外观模特：阿玛拉"), false);
  assert.equal(roster.some((item) => item.label === "选择外观模特：祖莉"), false);
  const restored = restoreState(JSON.stringify({
    ...state,
    removedLookIds: state.removedLookIds.filter((id) => id !== "amara-white-bikini"),
  }));
  const restoredRoster = renderRoster(restored);
  assert.equal(restoredRoster.length, 22);
  assert.deepEqual(restoredRoster.find((item) => item.label === "选择外观模特：阿玛拉"), {
    label: "选择外观模特：阿玛拉",
    thumbnail: "/looks/amara-white-bikini/character.png",
  });
});
