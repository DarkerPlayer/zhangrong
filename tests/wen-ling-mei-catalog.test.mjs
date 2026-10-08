import test from "node:test";
import assert from "node:assert/strict";
import { CHARACTER_ID_BY_NAME } from "../server/looks.mjs";
import { getLook, filterLooks, matchLookAlias, LOOKS } from "../src/looks.mjs";
import { getCharacterForLook, getCharacterLooks } from "../src/wardrobe.mjs";
import { getWardrobeInventory } from "../src/wardrobe-inventory.mjs";
import { withModelName } from "../src/model-names.mjs";
import { restoreState } from "../src/state.mjs";

const additions = [
  ["温夫人", "wen-furen", "wen-furen-black-gold", "黑金披肩"],
  ["凌玉灵", "ling-yuling", "ling-yuling-jade-robes", "白灰金纹长衣"],
  ["梅凝", "mei-ning", "mei-ning-teal-attire", "青绿斜肩行装"],
];

test("the three supplied characters have stable names, paths, search and corpus-only policy", () => {
  for (const [name, characterId, id, outfit] of additions) {
    const look = getLook(id);
    assert.equal(CHARACTER_ID_BY_NAME[name], characterId);
    assert.equal(look.id, id);
    assert.equal(look.characterId, characterId);
    assert.equal(look.character, name);
    assert.equal(look.outfit, outfit);
    assert.equal(look.asset, `/looks/${id}/character.png`);
    assert.equal(look.thumbnail, look.asset);
    assert.equal(look.renderer, "glam");
    assert.equal(look.characterDefault, true);
    assert.equal(look.dialoguePolicy, "provided-corpus-only");
    assert.equal(look.actions, null);
    assert.deepEqual(look.cuteMotions, []);
    assert.equal(matchLookAlias(`换成${name}`), id);
    assert.deepEqual(filterLooks({ query: name, category: "中式" }).map(item => item.id), [id]);
    assert.equal(getCharacterForLook(id).id, characterId);
    assert.deepEqual(getCharacterLooks(characterId).map(item => item.id), [id]);
    assert.deepEqual(getWardrobeInventory(characterId).map(item => item.id), [
      "sheer-black-stockings", "sheer-white-stockings", "black-fishnet-stockings",
    ]);
  }
  assert.deepEqual(LOOKS.filter(look => look.dialoguePolicy === "provided-corpus-only").map(look => look.id).sort(), additions.map(([, , id]) => id).sort());
});

test("new character names and selection persist without changing their corpus policy or identity", () => {
  for (const [name, characterId, id] of additions) {
    const renamed = `${name}自定名`;
    const state = restoreState(JSON.stringify({ ...restoreState(null), lookId: id, modelNames: { [characterId]: renamed } }));
    assert.equal(state.lookId, id);
    assert.equal(state.modelNames[characterId], renamed);
    const look = withModelName(getLook(id), state.modelNames);
    assert.equal(look.character, renamed);
    assert.equal(look.characterId, characterId);
    assert.equal(look.dialoguePolicy, "provided-corpus-only");
    assert.ok(look.aliases.includes(name));
  }
});
