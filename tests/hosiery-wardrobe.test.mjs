import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HOSIERY_ITEMS, HOSIERY_FITS, HOSIERY_LOOK_IDS, HOSIERY_COLLECTION_CHARACTER_IDS } from "../server/hosiery-fits.mjs";
import * as wardrobe from "../server/wardrobe.mjs";
import { getLook } from "../server/looks.mjs";
import { getWardrobeInventory } from "../src/wardrobe-inventory.mjs";
import { planWardrobeSelection } from "../src/wardrobe-selection.mjs";
import { restoreState } from "../src/state.mjs";
import { switchPersonaAppearance } from "../src/persona-appearance.mjs";
import { createMotionManifest } from "../src/motion/MotionManifest.mjs";
import { MotionController } from "../src/motion/MotionController.mjs";
import { GlamMotionAdapter } from "../src/motion/adapters/GlamMotionAdapter.mjs";
import { supportedCuteMotions } from "../server/cute-actions.mjs";
import { offlineReply } from "../server/dialogue.mjs";

const itemIds = ["sheer-black-stockings", "sheer-white-stockings", "black-fishnet-stockings"];

test("three shared stockings belong explicitly to six collections and have 24 exact outfit fits", () => {
  assert.deepEqual(HOSIERY_ITEMS.map(item => item.id), itemIds);
  assert.equal(HOSIERY_COLLECTION_CHARACTER_IDS.length, 6);
  assert.equal(HOSIERY_LOOK_IDS.length, 8);
  assert.equal(HOSIERY_FITS.length, 24);
  assert.equal(new Set(HOSIERY_FITS.map(fit => `${fit.lookId}:${fit.itemId}`)).size, 24);
  for (const characterId of HOSIERY_COLLECTION_CHARACTER_IDS) {
    const own = getWardrobeInventory(characterId);
    assert.deepEqual(own.filter(item => item.slot === "hosiery").map(item => item.id), itemIds);
    assert.equal(own.some(item => item.id === "black-pointed-heels"), false);
    for (const itemId of itemIds) {
      const item = wardrobe.getWardrobeItem(itemId);
      assert.equal(item.slot, "hosiery");
      assert.equal(item.sourceCharacterId, undefined, "assignment must not invent a source owner");
      const looks = wardrobe.getFittedLooksForItem(characterId, itemId);
      assert.equal(looks.length, characterId === "ziling" ? 3 : 1);
      assert.ok(looks.every(look => look.characterId === characterId));
    }
  }
  for (const characterId of ["ruby", "fancha", "wanhong"]) {
    assert.equal(getWardrobeInventory(characterId).some(item => itemIds.includes(item.id)), false);
    assert.deepEqual(getWardrobeInventory(characterId, { scope: "all", slotId: "hosiery" }).map(item => item.id), itemIds);
  }
});

test("all eight looks can equip and replace each stocking, then restore their exact original", () => {
  for (const lookId of HOSIERY_LOOK_IDS) {
    let selection = {};
    for (const itemId of itemIds) {
      const result = planWardrobeSelection({ lookId, selection, slotId: "hosiery", itemId });
      assert.equal(result.status, "ready", `${lookId}:${itemId}`);
      assert.deepEqual(result.selection, { hosiery: itemId });
      assert.equal(result.appearance.asset, `/wardrobe/fits/${lookId}/${itemId}/character.png`);
      assert.equal(result.appearance.rig, `/wardrobe/fits/${lookId}/${itemId}/rig.json`);
      assert.equal(result.appearance.characterId, getLook(lookId).characterId);
      selection = result.selection;
    }
    const restored = planWardrobeSelection({ lookId, selection, slotId: "hosiery", itemId: null });
    assert.equal(restored.status, "ready");
    assert.deepEqual(restored.selection, {});
    assert.equal(restored.appearance, getLook(lookId));
  }
});

test("stocking fits never substitute for missing complete combinations or other characters", () => {
  const lookId = "mei-ning-teal-attire";
  const selection = { hosiery: itemIds[0] };
  const before = wardrobe.resolveWardrobeAppearance(lookId, selection);
  const result = planWardrobeSelection({ lookId, selection, slotId: "nails", itemId: "fancha-violet-nails" });
  assert.equal(result.status, "pending");
  assert.deepEqual(result.selection, { hosiery: itemIds[0], nails: "fancha-violet-nails" });
  assert.equal(result.appearance, undefined);
  assert.equal(wardrobe.getWardrobeCombinationFit(lookId, result.selection), null);
  assert.equal(wardrobe.resolveWardrobeAppearance(lookId, selection).asset, before.asset);
  assert.equal(wardrobe.getWardrobeFit("ruby-velvet", itemIds[0]), null);
});

test("local catalog reload preserves static stocking fits and exact local overrides remain reversible", () => {
  const sample = HOSIERY_FITS[0];
  const override = { ...sample, asset: "/local-studio/assets/hosiery-new/character.png", rig: "/local-studio/assets/hosiery-new/rig.json" };
  try {
    wardrobe.setLocalWardrobe({ items: [], fits: [override] });
    for (const fit of HOSIERY_FITS) {
      const current = wardrobe.getWardrobeFit(fit.lookId, fit.itemId);
      assert.ok(current);
      assert.equal(current.asset, fit === sample ? override.asset : fit.asset);
    }
    wardrobe.setLocalWardrobe({ items: [], fits: [] });
    for (const fit of HOSIERY_FITS) assert.equal(wardrobe.getWardrobeFit(fit.lookId, fit.itemId).asset, fit.asset);
    assert.ok(wardrobe.getWardrobeFit("ruby-velvet", "black-pointed-heels"));
  } finally { wardrobe.setLocalWardrobe(); }
});

test("hosiery selections persist separately across characters, personas and all three Ziling looks", () => {
  const base = restoreState(null);
  const selections = Object.fromEntries(HOSIERY_COLLECTION_CHARACTER_IDS.map((id, i) => [id, { hosiery: itemIds[i % 3] }]));
  let state = restoreState(JSON.stringify({ ...base, lookId: "ziling-violet-dress", wardrobeSelections: selections }));
  assert.deepEqual(state.wardrobeSelections, selections);
  for (const lookId of HOSIERY_LOOK_IDS.filter(id => id.startsWith("ziling-"))) {
    assert.equal(wardrobe.resolveWardrobeAppearance(lookId, state.wardrobeSelections.ziling).asset,
      `/wardrobe/fits/${lookId}/${selections.ziling.hosiery}/character.png`);
  }
  state = switchPersonaAppearance(state, "adult-younger");
  state = { ...state, wardrobeSelections: { ziling: { hosiery: itemIds[0] } } };
  state = switchPersonaAppearance(state, "older-sister");
  assert.deepEqual(state.wardrobeSelections, selections);
});

test("fitted stockings retain mesh gestures and source dialogue policy without old whole-body frames", () => {
  for (const fit of HOSIERY_FITS) {
    const original = getLook(fit.lookId);
    const appearance = wardrobe.resolveWardrobeAppearance(fit.lookId, fit.selection);
    assert.equal(appearance.actions, null);
    assert.equal(appearance.dialoguePolicy, original.dialoguePolicy);
    const manifest = createMotionManifest(appearance);
    assert.ok(Object.values(manifest.motions).every(motion => motion.source !== "frames"));
    assert.deepEqual(supportedCuteMotions(appearance), supportedCuteMotions(original));
    const adapter = new GlamMotionAdapter({ manifest });
    const controller = new MotionController({ motions: manifest.motions, adapter });
    for (const { kind, durationMs } of supportedCuteMotions(appearance)) {
      assert.equal(controller.playMotion(kind).accepted, true);
      controller.update(durationMs / 2);
      assert.equal(adapter.getSample().frame, null);
      controller.update(durationMs);
      assert.equal(controller.getMotionState().state, "IDLE");
    }
    controller.destroy();
  }
  assert.equal(offlineReply({ lookId: "wen-furen-black-gold", message: "你好", avatarMode: "live2d" }).reply, "");
  assert.equal(offlineReply({ lookId: "mei-ning-teal-attire", message: "修行", avatarMode: "live2d" }).reply, "梅凝一定勉励修行");
});

test("Songyu stockings stay explicit about complete skirt coverage", () => {
  const fits = HOSIERY_FITS.filter(fit => fit.lookId === "songyu-azure-robes");
  assert.equal(fits.length, 3);
  for (const fit of fits) {
    assert.equal(fit.visibility, "fully-occluded");
    assert.match(fit.visibilityNote, /长裙遮住袜子/);
  }
});

test("hosiery assets exist as real transparent PNGs with calibrated portrait rigs", async () => {
  for (const itemId of itemIds) {
    const image = await readFile(new URL(`../public/wardrobe/items/${itemId}.png`, import.meta.url));
    assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.equal(image[25], 6, `${itemId} must retain RGBA`);
  }
  for (const fit of HOSIERY_FITS) {
    const image = await readFile(new URL(`../public${fit.asset}`, import.meta.url));
    assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.equal(image[25], 6, `${fit.asset} must retain RGBA`);
    assert.ok(image.readUInt32BE(16) >= 512);
    assert.ok(image.readUInt32BE(20) > image.readUInt32BE(16));
    const rig = JSON.parse(await readFile(new URL(`../public${fit.rig}`, import.meta.url), "utf8"));
    assert.equal(rig.eyes.length, 2);
    assert.ok(rig.eyes[0].x < rig.eyes[1].x);
    for (const eye of rig.eyes) assert.ok(eye.x > 0 && eye.x < 1 && eye.y > 0 && eye.y < .5);
    assert.ok(rig.mouth.y > Math.max(...rig.eyes.map(eye => eye.y)));
    assert.ok(rig.head.y > 0 && rig.head.y < .45);
    assert.ok(rig.bounds.bottom > rig.bounds.top && rig.bounds.right > rig.bounds.left);
  }
});
