import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as catalog from "../src/looks.mjs";

test("expanded wardrobe keeps existing IDs and the saved default alongside twenty-three adult companions", () => {
  assert.equal(catalog.LOOKS.length, 52);
  assert.equal(new Set(catalog.LOOKS.map((look) => look.character)).size, 23);
  assert.equal(new Set(catalog.LOOKS.map((look) => look.id)).size, 52);
  assert.equal(catalog.DEFAULT_LOOK_ID, "ruby-velvet");
  for (const id of [
    "noir-evening",
    "noir-office",
    "ruby-velvet",
    "ruby-date",
    "ruby-white-bikini",
    "silver-leather",
    "silver-knit",
  ]) {
    assert.equal(catalog.getLook(id).id, id);
  }
  assert.ok(catalog.LOOKS.every((look) => look.age >= 25));
});

test("search and category filters find compatible looks without replacing the selected identity", () => {
  assert.equal(typeof catalog.filterLooks, "function");
  assert.deepEqual(
    catalog.filterLooks({ category: "中式" }).map((look) => look.id),
    [
      "songyu-azure-robes",
      "yinyue-silver-fox",
      "ziling-violet-dress",
      "ziling-violet-veil",
      "ziling-white-robes",
      "wen-furen-black-gold",
      "ling-yuling-jade-robes",
      "mei-ning-teal-attire",
      "wanhong-vermilion-robes",
      "xuanling-golden-crown",
      "zhixia-qipao",
      "zhixia-city",
      "lingyue-hanfu",
      "lingyue-moon",
    ],
  );
  assert.deepEqual(
    catalog
      .filterLooks({ category: "非洲", query: "阿玛拉" })
      .map((look) => look.id),
    ["amara-royal", "amara-ankara"],
  );
  assert.deepEqual(
    catalog
      .filterLooks({ category: "日系", query: "和服" })
      .map((look) => look.id),
    ["sakura-kimono"],
  );
  assert.equal(catalog.filterLooks({ category: "可爱" }).length, 7);
  assert.equal(catalog.filterLooks({ category: "成熟" }).length, 34);
  assert.equal(catalog.filterLooks({ query: "Ankara" })[0].id, "amara-ankara");
  assert.deepEqual(
    catalog.filterLooks({ category: "日系", query: "非洲公主" }),
    [],
  );
  assert.equal(catalog.getLook("ruby-velvet").id, "ruby-velvet");
});

test("new gown and sleeve looks use a greeting while existing looks retain their wave", () => {
  assert.ok(
    catalog.LOOKS.filter((look) => look.isNew).every(
      (look) => look.greetingMotion === "nod",
    ),
  );
  assert.ok(
    catalog.LOOKS.filter((look) => !look.isNew).every(
      (look) => look.greetingMotion === "wave",
    ),
  );
  assert.equal(catalog.getLook("haru-original").greetingMotion, "wave");
});

test("the Medusa fantasy avatar is selectable and searchable by its character or outfit", () => {
  const id = "xuanling-golden-crown";
  const look = catalog.getLook(id);

  assert.equal(look.id, id);
  assert.equal(look.character, "美杜莎");
  assert.equal(look.age, 28);
  assert.equal(look.outfit, "金枝王冠");
  assert.equal(look.renderer, "glam");
  assert.equal(catalog.isLookId(id), true);
  assert.ok(catalog.filterLooks({ query: "金枝王冠" }).some((item) => item.id === id));
  assert.equal(catalog.matchLookAlias("请换上金枝王冠"), id);
});

test("Wu Duohui is selectable as a new adult agent and searchable by her role or plaid outfit", () => {
  const id = "wuduohui-plaid-agent";
  const look = catalog.getLook(id);

  assert.equal(look.id, id);
  assert.equal(look.character, "吴多慧");
  assert.equal(look.age, 29);
  assert.equal(look.outfit, "格纹代理");
  assert.equal(look.renderer, "glam");
  assert.equal(look.characterDefault, true);
  assert.equal(look.isNew, true);
  assert.equal(look.greetingMotion, "nod");
  assert.ok(catalog.filterLooks({ category: "成熟", query: "吴代理" }).some((item) => item.id === id));
  assert.ok(catalog.filterLooks({ query: "格纹职场" }).some((item) => item.id === id));
  assert.equal(catalog.matchLookAlias("请换成吴多慧代理"), id);
});

test("the discipline lead is a selectable adult character with a complete local model", () => {
  const id = "discipline-lead-noir";
  const look = catalog.getLook(id);

  assert.equal(look.id, id);
  assert.equal(look.character, "调教组长");
  assert.equal(look.age, 30);
  assert.equal(look.outfit, "黑金组长");
  assert.equal(look.renderer, "glam");
  assert.equal(look.characterDefault, true);
  assert.equal(look.isNew, true);
  assert.equal(look.greetingMotion, "nod");
  assert.equal(existsSync(resolve("public/looks", id, "character.png")), true);
  assert.equal(existsSync(resolve("public/looks", id, "rig.json")), true);
  assert.ok(catalog.filterLooks({ category: "成熟", query: "黑金组长" }).some((item) => item.id === id));
  assert.equal(catalog.matchLookAlias("换成调教组长"), id);
});

test("Fancha is selectable by her name and rose office outfit without replacing the saved default", () => {
  const id = "fancha-rose-office";
  const look = catalog.getLook(id);

  assert.equal(look.id, id);
  assert.equal(look.characterId, "fancha");
  assert.equal(look.character, "反差婊");
  assert.equal(look.age, 29);
  assert.equal(look.outfit, "玫瑰职场");
  assert.equal(look.renderer, "glam");
  assert.equal(look.characterDefault, true);
  assert.equal(look.isNew, true);
  assert.equal(look.greetingMotion, "nod");
  assert.ok(catalog.filterLooks().some((item) => item.id === id));
  for (const query of ["反差婊", "反差", "粉色双排扣", "粉色职场裙"]) {
    assert.ok(catalog.filterLooks({ category: "成熟", query }).some((item) => item.id === id), query);
    assert.equal(catalog.matchLookAlias(`请换成${query}`), id, query);
  }
  assert.equal(catalog.getAvailableLookId([], "ruby-velvet"), "ruby-velvet");
  assert.equal(catalog.getAvailableLookId([id], id), "ruby-velvet");
});

test("Linwei walk cycles ship sixteen timed poses with grounded contact metadata", () => {
  for (const id of ["linwei-ivory-wrap", "linwei-red-sole"]) {
    const frames = catalog.getLook(id).actions.sexyWalk;
    assert.equal(frames.length, 16, `${id} should provide a full sixteen-pose walk cycle`);
    assert.ok(new Set(frames.map(({ durationMs }) => durationMs)).size > 1, `${id} should not use equal frame timing`);
    assert.deepEqual(
      frames.filter(({ contact }) => contact).map(({ contact }) => contact),
      ["right", "left"],
      `${id} should mark the two contact poses`,
    );
    for (const frame of frames) {
      assert.equal(typeof frame.phase, "string");
      assert.equal(Number.isFinite(frame.durationMs), true);
      assert.equal(Array.isArray(frame.groundAnchor), true);
      assert.equal(frame.groundAnchor.length, 2);
      assert.equal(existsSync(resolve("public", frame.src.replace(/^\//, ""))), true, frame.src);
    }
  }
});
