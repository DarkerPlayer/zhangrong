import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { LOOKS } from "../server/looks.mjs";
import * as wardrobeCatalog from "../server/wardrobe.mjs";
import {
  BACKGROUNDS,
  CHARACTERS,
  OUTFIT_VARIANTS,
  GARMENT_SLOT_IDS,
  CURATED_STYLE_RECIPES,
  getOutfitVariant,
  getVariantsBySlot,
  resolveEmptyOutfit,
  getCharacter,
  getCharacterForLook,
  getCharacterLooks,
} from "../server/wardrobe.mjs";

const authoredBaseCharacterIds = [
  "discipline-lead", "wuduohui", "linwei", "medusa", "yelan", "ruby",
  "shuanghua", "sakura", "yuki", "zhixia", "lingyue", "elise", "mia",
  "amara", "zuri",
];
const fittedCharacterIds = authoredBaseCharacterIds.filter((id) => !["amara", "zuri"].includes(id));

test("wardrobe contains legacy shoes and six extracted Fancha parts", () => {
  assert.ok(Array.isArray(wardrobeCatalog.WARDROBE_ITEMS));
  assert.deepEqual(
    wardrobeCatalog.getWardrobeItemsBySlot("shoes").map((item) => item.id),
    ["black-pointed-heels", "ivory-soft-slippers", "fancha-ivory-heels"],
  );
  for (const item of wardrobeCatalog.WARDROBE_ITEMS) {
    assert.ok(GARMENT_SLOT_IDS.includes(item.slot));
    assert.equal(item.fitPolicy, "imagegen-adapt");
    if (item.kind === "color") assert.match(item.color, /^#[0-9a-f]{6}$/i);
    else assert.match(item.asset, /^\/wardrobe\/items\/.+\.png$/);
  }
  assert.equal(wardrobeCatalog.getWardrobeItemsBySlot("hair")[0].id, "songyu-halfup-hair");
});

test("fitted shoe selections resolve actual artwork and never borrow another model's body", () => {
  assert.equal(typeof wardrobeCatalog.resolveWardrobeAppearance, "function");
  const base = LOOKS.find((look) => look.id === "xuanling-golden-crown");
  const heels = wardrobeCatalog.resolveWardrobeAppearance(base.id, { shoes: "black-pointed-heels" });
  const slippers = wardrobeCatalog.resolveWardrobeAppearance(base.id, { shoes: "ivory-soft-slippers" });
  assert.notEqual(heels.asset, base.asset);
  assert.notEqual(slippers.asset, base.asset);
  assert.notEqual(heels.asset, slippers.asset);
  assert.equal(heels.characterId, base.characterId);
  assert.equal(heels.id, base.id);
  assert.ok(heels.rig && slippers.rig);
  assert.deepEqual(wardrobeCatalog.resolveWardrobeAppearance(base.id, {}), base);
  const unadapted = LOOKS.find((look) => look.id === "amara-ankara");
  assert.deepEqual(wardrobeCatalog.resolveWardrobeAppearance(unadapted.id, { shoes: "black-pointed-heels" }), unadapted);
  assert.equal(wardrobeCatalog.getWardrobeFit(unadapted.id, "black-pointed-heels"), null);
});

test("each previously fitted model offers both reusable shoes without borrowing another identity", () => {
  for (const characterId of fittedCharacterIds) {
    const character = getCharacter(characterId);
    assert.equal(character.id, characterId);
    for (const item of wardrobeCatalog.WARDROBE_ITEMS.filter(item => item.slot === "shoes" && !item.sourceLookId)) {
      const looks = wardrobeCatalog.getFittedLooksForItem(character.id, item.id);
      assert.ok(looks.length > 0, `${character.id}:${item.id}`);
      assert.ok(looks.every((look) => look.characterId === character.id));
      assert.deepEqual(wardrobeCatalog.getFittedLooksForItem(character.id, item.id, looks.map((look) => look.id)), []);
    }
  }
});

test("every previously processed outfit reports a real fit or an explicit generation issue for each shoe", () => {
  for (const look of LOOKS.filter((item) => fittedCharacterIds.includes(item.characterId))) {
    for (const item of wardrobeCatalog.WARDROBE_ITEMS.filter(item => item.slot === "shoes" && !item.sourceLookId)) {
      const status = wardrobeCatalog.getWardrobeFitStatus(look.id, item.id);
      assert.ok(["ready", "blocked"].includes(status.status), `${look.id}:${item.id}`);
      if (status.status === "ready") assert.ok(wardrobeCatalog.getWardrobeFit(look.id, item.id));
      else assert.match(status.message, /审核|校准|检验/);
    }
  }
  assert.equal(wardrobeCatalog.getWardrobeFitStatus("missing", "unknown").status, "pending");
});

test("every fitted item has a local full-body PNG and its own face rig", async () => {
  for (const fit of wardrobeCatalog.WARDROBE_FITS) {
    const image = await readFile(new URL(`../public${fit.asset}`, import.meta.url));
    if (wardrobeCatalog.getWardrobeItem(fit.itemId)?.slot === "hosiery") {
      assert.ok(image.readUInt32BE(16) >= 512);
      assert.ok(image.readUInt32BE(20) > image.readUInt32BE(16));
    } else {
      assert.equal(image.readUInt32BE(16), 1024);
      assert.equal(image.readUInt32BE(20), 1536);
    }
    assert.equal(image[25], 6);
    const rig = JSON.parse(await readFile(new URL(`../public${fit.rig}`, import.meta.url), "utf8"));
    assert.equal(rig.eyes.length, 2);
    assert.ok(rig.eyes[0].x < rig.eyes[1].x);
    assert.ok(rig.mouth.y > Math.max(...rig.eyes.map((eye) => eye.y)));
    assert.ok(rig.head.y < 0.45, `${fit.lookId}/${fit.itemId}: face must be on the upper body`);
  }
});

test("wardrobe caption stays in a separate layout row instead of covering shoes", async () => {
  const css = await readFile(new URL("../src/wardrobe.css", import.meta.url), "utf8");
  const dom = new JSDOM('<style></style><div class="wardrobe-preview"><div class="wardrobe-preview-model"></div><div class="wardrobe-preview-caption"></div></div>');
  try {
    dom.window.document.querySelector("style").textContent = css;
    const style = (selector) => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
    assert.equal(style(".wardrobe-preview").display, "grid");
    assert.equal(style(".wardrobe-preview").gridTemplateRows, "minmax(0, 1fr) auto");
    assert.equal(style(".wardrobe-preview-model").position, "relative");
    assert.equal(style(".wardrobe-preview-caption").position, "relative");
  } finally {
    dom.window.close();
  }
});

test("wardrobe separates twenty-three stable adult appearance models from outfit variants", () => {
  assert.equal(CHARACTERS.length, 23);
  assert.equal(OUTFIT_VARIANTS.length, LOOKS.length);
  assert.equal(new Set(CHARACTERS.map((item) => item.id)).size, 23);
  assert.ok(CHARACTERS.every((item) => item.age >= 25));
  assert.equal(getCharacterForLook("linwei-red-sole").id, "linwei");
  assert.deepEqual(
    getCharacterLooks("linwei").map((item) => item.id).sort(),
    ["linwei-ivory-wrap", "linwei-red-sole", "linwei-white-bikini"],
  );
  assert.equal(getCharacter("missing").id, getCharacterForLook("ruby-velvet").id);
});

test("runtime chat and wardrobe UI do not import appearance identity or corpus helpers", async () => {
  const sources = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/WardrobePage.jsx", import.meta.url), "utf8"),
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /getCharacterDisplayName/);
    assert.doesNotMatch(source, /getActiveCharacterCorpus/);
  }
});

test("background catalog is independent and has one stable default", () => {
  assert.ok(BACKGROUNDS.length >= 4);
  assert.equal(BACKGROUNDS.filter((item) => item.default).length, 1);
  assert.equal(new Set(BACKGROUNDS.map((item) => item.id)).size, BACKGROUNDS.length);
});

test("every authored outfit exposes normalized reusable garment slots", () => {
  assert.deepEqual(GARMENT_SLOT_IDS, [
    "hair",
    "top",
    "bottom",
    "dress",
    "outerwear",
    "underwear",
    "hosiery",
    "shoes",
    "nails",
    "watch",
    "earrings",
    "accessories",
  ]);
  assert.equal(OUTFIT_VARIANTS.length, LOOKS.length);
  for (const variant of OUTFIT_VARIANTS) {
    assert.deepEqual(Object.keys(variant.slots), GARMENT_SLOT_IDS);
    assert.ok(variant.slots.hair.length > 0);
    for (const slotId of GARMENT_SLOT_IDS) {
      assert.ok(Array.isArray(variant.slots[slotId]));
      assert.ok(
        variant.slots[slotId].every(
          (part) =>
            part.slot === slotId &&
            part.sourceLookId === variant.lookId &&
            part.fitPolicy === "imagegen-adapt",
        ),
      );
    }
  }
  assert.ok(getOutfitVariant("linwei-red-sole").slots.shoes.length > 0);
  assert.ok(getVariantsBySlot("shoes").length > 0);
});

test("empty outfit resolves to the existing authored white-bikini variant for all fifteen completed characters", () => {
  assert.deepEqual(resolveEmptyOutfit("ruby", "ruby-velvet"), {
    status: "ready",
    characterId: "ruby",
    requestedBase: "white-bikini",
    lookId: "ruby-white-bikini",
    message: "已换上白色比基尼安全底装",
  });
  for (const characterId of authoredBaseCharacterIds) {
    const character = getCharacter(characterId);
    assert.equal(character.id, characterId);
    const result = resolveEmptyOutfit(character.id, character.defaultLookId);
    assert.equal(result.status, "ready", character.id);
    assert.equal(result.characterId, character.id);
    assert.equal(result.lookId, `${character.id}-white-bikini`);
  }
  assert.equal(resolveEmptyOutfit("missing", "ruby-velvet").lookId, "ruby-velvet");
});

test("Fancha keeps her rose office outfit while her independent safe base is pending", () => {
  assert.equal(getCharacter("fancha").defaultLookId, "fancha-rose-office");
  assert.deepEqual(getCharacterLooks("fancha").map((look) => look.id), ["fancha-rose-office"]);
  assert.deepEqual(resolveEmptyOutfit("fancha", "fancha-rose-office"), {
    status: "pending",
    characterId: "fancha",
    requestedBase: "white-bikini",
    lookId: "fancha-rose-office",
    message: "白色比基尼适配待生成",
  });
});

test("Fancha reports pending shoe fits and never substitutes another character's artwork", () => {
  const look = LOOKS.find((item) => item.id === "fancha-rose-office");
  assert.ok(look);
  for (const item of wardrobeCatalog.WARDROBE_ITEMS.filter(item => item.slot === "shoes" && !item.sourceLookId)) {
    assert.equal(wardrobeCatalog.getWardrobeFitStatus(look.id, item.id).status, "pending");
    assert.equal(wardrobeCatalog.getWardrobeFit(look.id, item.id), null);
    assert.deepEqual(wardrobeCatalog.getFittedLooksForItem("fancha", item.id), []);
    assert.deepEqual(wardrobeCatalog.resolveWardrobeAppearance(look.id, { shoes: item.id }), look);
  }
});

test("日韩成年穿搭配方可作为后续合身生成单", () => {
  assert.ok(CURATED_STYLE_RECIPES.length >= 8);
  assert.ok(CURATED_STYLE_RECIPES.every((recipe) => ["日系", "韩系"].includes(recipe.region)));
  assert.ok(CURATED_STYLE_RECIPES.every((recipe) => recipe.audience === "adult"));
  assert.ok(CURATED_STYLE_RECIPES.every((recipe) => Object.keys(recipe.slots).length > 0));
  assert.equal(
    CURATED_STYLE_RECIPES.some((recipe) => /校服|制服|未成年/.test(JSON.stringify(recipe))),
    false,
  );
});
