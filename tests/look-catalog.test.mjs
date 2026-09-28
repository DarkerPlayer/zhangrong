import test from "node:test";
import assert from "node:assert/strict";
import * as catalog from "../src/looks.mjs";

test("expanded wardrobe keeps existing IDs and the saved default alongside twelve adult companions", () => {
  assert.equal(catalog.LOOKS.length, 23);
  assert.equal(new Set(catalog.LOOKS.map((look) => look.character)).size, 12);
  assert.equal(new Set(catalog.LOOKS.map((look) => look.id)).size, 23);
  assert.equal(catalog.DEFAULT_LOOK_ID, "ruby-velvet");
  for (const id of [
    "noir-evening",
    "noir-office",
    "ruby-velvet",
    "ruby-date",
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
  assert.equal(catalog.filterLooks({ category: "可爱" }).length, 6);
  assert.equal(catalog.filterLooks({ category: "成熟" }).length, 6);
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
