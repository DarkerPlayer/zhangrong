import test from "node:test";
import assert from "node:assert/strict";
import { restoreState } from "../src/state.mjs";
import { filterLooks, getLook, ORIGINAL_LOOK } from "../src/looks.mjs";
import { filterLooks as filterCatalogLooks } from "../server/looks.mjs";
import { getModelName, normalizeModelNames, withModelName } from "../src/model-names.mjs";

test("model names survive state recovery without renaming a persona", () => {
  const original = restoreState(null);
  const restored = restoreState(JSON.stringify({
    ...original,
    modelNames: { ruby: "我的模特", haru: "小春", "local-character-pending": "待载入模特" },
  }));
  assert.deepEqual(restored.modelNames, {
    ruby: "我的模特", haru: "小春", "local-character-pending": "待载入模特",
  });
  assert.deepEqual(restored.personas, original.personas);
  assert.deepEqual(restoreState(JSON.stringify(restored)).modelNames, restored.modelNames);
});

test("state recovery rejects malformed names without dropping unloaded model IDs", () => {
  const restored = restoreState(JSON.stringify({
    schemaVersion: 2,
    modelNames: {
      ruby: "  新名字  ",
      haru: " ",
      "local-character-waiting": "月".repeat(30),
      "bad id": "不可用", "../model": "不可用", "": "不可用",
      yuki: 123, sakura: null, mia: {},
    },
  }));
  assert.deepEqual(restored.modelNames, {
    ruby: "新名字", "local-character-waiting": "月".repeat(24),
  });
  for (const modelNames of [null, [], "旧名字", 42]) {
    assert.deepEqual(restoreState(JSON.stringify({ modelNames })).modelNames, {});
  }
});

test("all outfits of a renamed model are searchable by new and original names", () => {
  const renamed = filterLooks({ query: "自定义绯色", modelNames: { ruby: "自定义绯色" } });
  assert.deepEqual(renamed.map((look) => look.id).sort(), [
    "ruby-date", "ruby-velvet", "ruby-white-bikini",
  ]);
  assert.ok(renamed.every((look) => look.character === "自定义绯色"));
  assert.ok(renamed.every((look) => look.name.startsWith("自定义绯色 · ")));
  const originalSearch = filterLooks({ query: "绯月", modelNames: { ruby: "自定义绯色" } });
  assert.deepEqual(originalSearch.map((look) => look.id).sort(), renamed.map((look) => look.id).sort());
  assert.equal(getLook("ruby-velvet").character, "绯月");
});

test("renamed models remain searchable after their outfits are removed", () => {
  const options = { query: "自定义绯色", modelNames: { ruby: "自定义绯色" }, removedLookIds: ["ruby-velvet"] };
  assert.deepEqual(filterLooks({ ...options, view: "removed" }).map((look) => look.id), ["ruby-velvet"]);
  assert.ok(filterLooks(options).every((look) => look.id !== "ruby-velvet"));
});

test("catalog filtering searches an explicitly supplied look list", () => {
  const look = getLook("ruby-velvet");
  assert.deepEqual(filterCatalogLooks({ query: "绯月", looks: [look] }), [look]);
});

test("Haru keeps its original title suffix and identity when renamed", () => {
  const look = withModelName(ORIGINAL_LOOK, { haru: "小春", ruby: "另一个模特" });
  assert.equal(look.character, "小春");
  assert.equal(look.name, "小春 · 动态陪伴");
  assert.equal(look.characterId, "haru");
  assert.equal(look.id, "haru-original");
  assert.equal(look.outfit, "原始造型");
  assert.ok(look.aliases.includes("Haru"));
  assert.ok(look.aliases.includes("Haru · 动态陪伴"));
  assert.equal(ORIGINAL_LOOK.character, "Haru");
});

test("unnamed models keep their catalog object and fall back from invalid or inherited values", () => {
  const look = getLook("ruby-velvet");
  assert.equal(withModelName(look), look);
  assert.equal(withModelName(look, { ruby: " " }), look);
  assert.equal(withModelName(look, { ruby: 12 }), look);
  assert.equal(getModelName("ruby", "原名", Object.create({ ruby: "继承名" })), "原名");
  assert.equal(getModelName("ruby", "原名", { ruby: "  新名  " }), "新名");
});

test("normalization bounds names by whole characters and excludes invalid ID keys", () => {
  const names = normalizeModelNames({
    ruby: "🌙".repeat(30),
    ["a".repeat(101)]: "过长ID",
    "-ruby": "错误ID",
    "local-character-missing": "尚未加载",
  });
  assert.deepEqual(names, { ruby: "🌙".repeat(24), "local-character-missing": "尚未加载" });
  assert.deepEqual(normalizeModelNames(JSON.parse('{"__proto__":"不可用"}')), {});
});
