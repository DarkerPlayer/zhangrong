import test from "node:test";
import assert from "node:assert/strict";
import { getWardrobeInventory, isCharacterWardrobeItem } from "../src/wardrobe-inventory.mjs";
import { WARDROBE_ITEMS, getWardrobeCombinationFit } from "../src/wardrobe.mjs";

test("character inventory contains source items, not shared items merely fitted to the character", () => {
  const own = getWardrobeInventory("fancha");
  assert.equal(own.length, 6);
  assert.ok(own.every(item => item.sourceCharacterId === "fancha"));
  assert.equal(getWardrobeInventory("songyu").filter(item => item.sourceCharacterId === "songyu").length, 7);
  assert.ok(getWardrobeCombinationFit("ruby-velvet", { shoes: "black-pointed-heels" }));
  assert.deepEqual(getWardrobeInventory("ruby"), []);
  assert.deepEqual(getWardrobeInventory("ruby", { scope: "all" }), WARDROBE_ITEMS);
  assert.deepEqual(getWardrobeInventory("fancha", { slotId: "nails" }).map(item => item.id), ["fancha-violet-nails"]);
});

test("source ownership is independent of outfit and only uses exact known source look IDs", () => {
  const looks = [{ id: "alice-a", characterId: "alice" }, { id: "alice-b", characterId: "alice" }, { id: "bob-a", characterId: "bob" }];
  assert.equal(isCharacterWardrobeItem({ sourceLookId: "alice-b" }, "alice", looks), true);
  assert.equal(isCharacterWardrobeItem({ embeddedLookIds: ["alice-a"] }, "alice", looks), true);
  assert.equal(isCharacterWardrobeItem({ sourceCharacterId: "bob", embeddedLookIds: ["alice-a"] }, "alice", looks), false);
  assert.equal(isCharacterWardrobeItem({ sourceLookId: "bob-a", embeddedLookIds: ["alice-a"] }, "alice", looks), false);
  assert.equal(isCharacterWardrobeItem({ sourceLookId: "missing" }, "alice", looks), false);
  assert.equal(isCharacterWardrobeItem({ id: "alice-shoes" }, "alice", looks), false);
  assert.equal(isCharacterWardrobeItem({}, "alice", looks), false);
  assert.equal(isCharacterWardrobeItem({ collectionCharacterIds: ["alice"], sourceCharacterId: "bob" }, "alice", looks), true);
  assert.equal(isCharacterWardrobeItem({ collectionCharacterIds: ["alice"], sourceCharacterId: "bob" }, "bob", looks), true);
  assert.equal(isCharacterWardrobeItem({ availableCharacterIds: ["alice"] }, "alice", looks), false);
  assert.equal(isCharacterWardrobeItem({ collectionCharacterIds: "alice" }, "alice", looks), false);
});

test("local owned items remain scoped while older unassigned imports are retained in all inventory", () => {
  const items = [
    { id: "local-item-new", slot: "hair", sourceCharacterId: "alice" },
    { id: "local-item-legacy", slot: "hair" },
    { id: "local-item-other", slot: "hair", sourceCharacterId: "bob" },
  ];
  assert.deepEqual(getWardrobeInventory("alice", { items }).map(item => item.id), ["local-item-new"]);
  assert.equal(getWardrobeInventory("alice", { items, scope: "all", slotId: "hair" }).length, 3);
  assert.deepEqual(getWardrobeInventory(undefined, { items }), []);
});
