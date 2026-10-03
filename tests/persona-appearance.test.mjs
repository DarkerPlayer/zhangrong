import test from "node:test";
import assert from "node:assert/strict";
import { restoreState } from "../src/state.mjs";
import {
  capturePersonaAppearance,
  switchPersonaAppearance,
  normalizePersonaAppearance,
} from "../src/persona-appearance.mjs";

test("switching companions remembers outfits independently, including the same model with different shoes", () => {
  let state = {
    ...restoreState(null),
    lookId: "linwei-red-sole",
    avatarMode: "live2d",
    wardrobeSelections: { linwei: { shoes: "black-pointed-heels" } },
  };
  state = switchPersonaAppearance(state, "boss-girlfriend");
  state = {
    ...state,
    lookId: "ruby-date",
    wardrobeSelections: { ruby: { shoes: "ivory-soft-slippers" } },
  };
  state = switchPersonaAppearance(state, "older-sister");
  assert.equal(state.lookId, "linwei-red-sole");
  assert.equal(state.wardrobeSelections.linwei.shoes, "black-pointed-heels");
  assert.equal(
    state.personas["boss-girlfriend"].appearance.lookId,
    "ruby-date",
  );
  const restored = restoreState(JSON.stringify(state));
  assert.equal(
    switchPersonaAppearance(restored, "boss-girlfriend").lookId,
    "ruby-date",
  );
});

test("appearance restoration falls back safely when the bound look is archived", () => {
  let state = {
    ...restoreState(null),
    lookId: "ruby-date",
    avatarMode: "live2d",
  };
  state = switchPersonaAppearance(state, "boss-girlfriend");
  state = { ...state, removedLookIds: [...state.removedLookIds, "ruby-date"] };
  state = switchPersonaAppearance(state, "older-sister");
  assert.notEqual(state.lookId, "ruby-date");
  assert.equal(state.removedLookIds.includes(state.lookId), false);
});

test("captured appearance is independent data and ignores invalid snapshot fields", () => {
  const state = {
    ...restoreState(null),
    wardrobeSelections: { linwei: { shoes: "black-pointed-heels" } },
  };
  const appearance = capturePersonaAppearance(state);
  state.wardrobeSelections.linwei.shoes = null;
  assert.equal(
    appearance.wardrobeSelections.linwei.shoes,
    "black-pointed-heels",
  );
  assert.equal(normalizePersonaAppearance(null), null);
  assert.equal(normalizePersonaAppearance({ lookId: 22 }), null);
});
