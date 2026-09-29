import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LOOKS } from "../server/looks.mjs";
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

test("wardrobe separates fifteen stable adult appearance models from outfit variants", () => {
  assert.equal(CHARACTERS.length, 15);
  assert.equal(OUTFIT_VARIANTS.length, LOOKS.length);
  assert.equal(new Set(CHARACTERS.map((item) => item.id)).size, 15);
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

test("empty outfit resolves to an authored white-bikini variant for every character", () => {
  assert.deepEqual(resolveEmptyOutfit("ruby", "ruby-velvet"), {
    status: "ready",
    characterId: "ruby",
    requestedBase: "white-bikini",
    lookId: "ruby-white-bikini",
    message: "已换上白色比基尼安全底装",
  });
  for (const character of CHARACTERS) {
    const result = resolveEmptyOutfit(character.id, character.defaultLookId);
    assert.equal(result.status, "ready", character.id);
    assert.equal(result.characterId, character.id);
    assert.equal(result.lookId, `${character.id}-white-bikini`);
  }
  assert.equal(resolveEmptyOutfit("missing", "ruby-velvet").lookId, "ruby-velvet");
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
