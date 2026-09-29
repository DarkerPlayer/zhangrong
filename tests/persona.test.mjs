import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PERSONA_TEMPLATE_ID,
  INTIMACY_LEVELS,
  PERSONA_TEMPLATES,
  getPersonaTemplate,
  normalizePersonaSnapshot,
  resolvePersonaProfile,
  validatePersonaDefinition,
} from "../server/personas.mjs";
import {
  choosePersonaLine,
  detectDialogueIntent,
  selectPersonaReferences,
} from "../server/persona-dialogue.mjs";

const COMMON_CATEGORIES = [
  "greeting",
  "daily",
  "comfort",
  "jealousy",
  "praise",
  "goodnight",
  "fallback",
];
const LEVEL_CATEGORIES = ["affection", "teasing", "seduction"];
const ACTION_CATEGORIES = ["pat", "wave", "outfit"];

test("three adult built-in personas have complete distinct corpora", () => {
  assert.deepEqual(INTIMACY_LEVELS, ["sweet", "mature", "adult"]);
  assert.equal(PERSONA_TEMPLATES.length, 3);
  assert.equal(new Set(PERSONA_TEMPLATES.map((item) => item.id)).size, 3);
  assert.ok(PERSONA_TEMPLATES.every((item) => item.age >= 25));
  for (const persona of PERSONA_TEMPLATES) {
    for (const category of COMMON_CATEGORIES)
      assert.ok(persona.corpora[category].length >= 4, `${persona.id}:${category}`);
    for (const category of LEVEL_CATEGORIES) {
      const groups = INTIMACY_LEVELS.map((level) => persona.corpora[category][level]);
      assert.ok(groups.every((lines) => lines.length >= 4), `${persona.id}:${category}`);
      assert.equal(new Set(groups).size, 3, `${persona.id}:${category}:array identity`);
      assert.equal(new Set(groups.flat()).size, groups.flat().length, `${persona.id}:${category}:content`);
    }
    for (const category of ACTION_CATEGORIES)
      assert.ok(persona.corpora.action[category].length >= 3, `${persona.id}:action:${category}`);
  }
  assert.equal(getPersonaTemplate(DEFAULT_PERSONA_TEMPLATE_ID).id, DEFAULT_PERSONA_TEMPLATE_ID);
});

test("persona definitions cannot bind to an appearance", () => {
  for (const persona of PERSONA_TEMPLATES) {
    assert.doesNotMatch(
      JSON.stringify(persona),
      /lookId|characterId|modelId|\/looks\//,
      persona.id,
    );
    assert.equal(validatePersonaDefinition(persona).id, persona.id);
  }
});

test("adult mode requires acknowledgement and placeholders are allowlisted", () => {
  const validSnapshot = resolvePersonaProfile({
    id: "custom-boss",
    templateId: "boss-girlfriend",
    displayName: "岚姐",
    age: 32,
    intimacyLevel: "adult",
    adultAcknowledged: true,
    customCorpora: [],
  });
  assert.equal(validSnapshot.name, "岚姐");
  assert.equal(validSnapshot.age, 32);
  assert.equal(normalizePersonaSnapshot({
    ...validSnapshot,
    intimacyLevel: "adult",
    adultAcknowledged: false,
  }).intimacyLevel, "mature");
  assert.throws(
    () => normalizePersonaSnapshot({
      ...validSnapshot,
      corpora: { ...validSnapshot.corpora, greeting: ["你好，{unknown}"] },
    }),
    /占位符/,
  );
});

test("invalid persona snapshots reject underage, oversized, and appearance-bound data", () => {
  const valid = resolvePersonaProfile({
    id: "older-sister",
    templateId: "older-sister",
    intimacyLevel: "mature",
    adultAcknowledged: false,
    customCorpora: [],
  });
  assert.throws(() => normalizePersonaSnapshot({ ...valid, age: 17 }), /年龄/);
  assert.throws(
    () => normalizePersonaSnapshot({ ...valid, templateId: "unknown-template" }),
    /模板/,
  );
  assert.throws(() => normalizePersonaSnapshot({ ...valid, lookId: "ruby-velvet" }), /外观/);
  assert.throws(
    () => normalizePersonaSnapshot({
      ...valid,
      corpora: { ...valid.corpora, greeting: ["太".repeat(241)] },
    }),
    /240/,
  );
});

test("dialogue intents select only bounded references from the active intimacy level", () => {
  const profile = {
    id: "boss-girlfriend",
    templateId: "boss-girlfriend",
    intimacyLevel: "adult",
    adultAcknowledged: true,
    customCorpora: [],
  };
  const persona = resolvePersonaProfile(profile);
  assert.equal(detectDialogueIntent("你好呀"), "greeting");
  assert.equal(detectDialogueIntent("今天真的很累"), "comfort");
  assert.equal(detectDialogueIntent("逗逗我"), "teasing");
  assert.equal(detectDialogueIntent("晚安"), "goodnight");
  const references = selectPersonaReferences(persona, "teasing", 4);
  assert.equal(references.length, 4);
  assert.ok(references.every((line) => persona.corpora.teasing.adult.includes(line)));
  assert.ok(references.every((line) => !persona.corpora.teasing.sweet.includes(line)));
});

test("persona line choice avoids the last three assistant replies", () => {
  const persona = resolvePersonaProfile({
    id: "adult-younger",
    templateId: "adult-younger",
    intimacyLevel: "sweet",
    adultAcknowledged: false,
    customCorpora: [],
  });
  const blocked = persona.corpora.greeting.slice(0, 3);
  const line = choosePersonaLine(
    persona,
    "greeting",
    blocked.map((content) => ({ role: "assistant", content })),
    "你好",
    { userName: "阿远", personaName: persona.name },
  );
  assert.equal(blocked.includes(line), false);
});
