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
  assert.throws(() => normalizePersonaSnapshot({ ...valid, lookId: "ruby-velvet" }), /外观/);
  assert.throws(
    () => normalizePersonaSnapshot({
      ...valid,
      corpora: { ...valid.corpora, greeting: ["太".repeat(241)] },
    }),
    /240/,
  );
});
