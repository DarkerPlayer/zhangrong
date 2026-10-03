import { test } from "node:test";
import assert from "node:assert/strict";
import {
  restoreState,
  appendMessage,
  formatRemaining,
  sceneFromCommand,
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
} from "../src/state.mjs";
import { getLook } from "../src/looks.mjs";
import {
  addPersonaCorpus,
  appendPersonaMessage,
  exportablePersonaMessages,
  getActivePersona,
  getPersonaThread,
  setActivePersona,
  togglePersonaFavorite,
} from "../src/persona-state.mjs";
test("corrupt saved data resets without taking down the app", () => {
  assert.equal(restoreState("{bad").scene, "home");
  assert.equal(restoreState("null").settings.motion, true);
});
test("persisted values are validated and unknown role rejected", () => {
  const s = restoreState(
    JSON.stringify({
      scene: "bad",
      messages: [
        { role: "system", content: "bad" },
        { role: "user", content: "Hi" },
      ],
      settings: { volume: 300, provider: "other" },
    }),
  );
  assert.equal(s.scene, "home");
  assert.equal(getPersonaThread(s).messages.length, 1);
  assert.equal(s.settings.volume, 0.35);
  assert.equal(s.settings.provider, "auto");
});
test("chat history has stable bounded length and no blank messages", () => {
  let s = [];
  for (let i = 0; i < 205; i++) s = appendMessage(s, "user", "hello" + i);
  assert.equal(s.length, 200);
  assert.equal(appendMessage(s, "user", "  ").length, 200);
  assert.ok(s[0].id);
});
test("timer formats minutes and clamps expired time", () => {
  assert.equal(formatRemaining(1500), "25:00");
  assert.equal(formatRemaining(-2), "00:00");
});
test("outfit commands map only recognizable choices", () => {
  assert.equal(sceneFromCommand("换上婚纱"), "wedding");
  assert.equal(sceneFromCommand("穿紫色毛衣"), "cozy");
  assert.equal(sceneFromCommand("普通聊天"), null);
});
test("custom media active choice restores explicitly and defaults off", () => {
  assert.equal(restoreState(null).customEnabled, false);
  assert.equal(
    restoreState(JSON.stringify({ customEnabled: true })).customEnabled,
    true,
  );
  assert.equal(
    restoreState(JSON.stringify({ customEnabled: false })).customEnabled,
    false,
  );
});
test("dynamic look selection restores only supported local appearances", () => {
  assert.equal(restoreState(null).lookId, "ruby-velvet");
  assert.equal(getLook("missing-look").id, "ruby-velvet");
  assert.equal(
    restoreState(JSON.stringify({ lookId: "ruby-date" })).lookId,
    "ruby-date",
  );
  assert.equal(
    restoreState(JSON.stringify({ lookId: "haru-original" })).lookId,
    "haru-original",
  );
  assert.equal(
    restoreState(JSON.stringify({ lookId: "missing-look" })).lookId,
    "ruby-velvet",
  );
});
test("favorited persona messages survive rolling history and remain exportable", () => {
  let s = restoreState(null);
  s = appendPersonaMessage(s, "assistant", "永久珍藏的第一句话");
  const firstId = getPersonaThread(s).messages[0].id;
  s = togglePersonaFavorite(s, firstId);
  for (let i = 0; i < 210; i++)
    s = appendPersonaMessage(s, "user", "后来的消息" + i);
  assert.equal(getPersonaThread(s).messages.length, 200);
  s = restoreState(JSON.stringify(s));
  assert.equal(getPersonaThread(s).savedMessages[0].content, "永久珍藏的第一句话");
  assert.equal(
    exportablePersonaMessages(s).some((m) => m.id === firstId),
    true,
  );
  s = togglePersonaFavorite(s, firstId);
  assert.equal(getPersonaThread(s).savedMessages.length, 0);
});

test("new state owns three independent built-in persona threads", () => {
  const state = restoreState(null);
  assert.equal(state.schemaVersion, 2);
  assert.equal(STORAGE_KEY, "muyu-state-v2");
  assert.equal(LEGACY_STORAGE_KEY, "muyu-state-v1");
  assert.equal(Object.keys(state.personas).length, 3);
  assert.deepEqual(getPersonaThread(state).messages, []);
  assert.equal(getActivePersona(state).id, "older-sister");
});

test("persona threads and appearance selections are orthogonal", () => {
  let state = restoreState(null);
  const lookId = state.lookId;
  state = setActivePersona(state, "boss-girlfriend");
  assert.equal(state.lookId, lookId);
  state = appendPersonaMessage(state, "user", "以后叫我队长");
  assert.equal(getPersonaThread(state).memories.userName, "队长");
  assert.equal(getPersonaThread(state, "older-sister").messages.length, 0);
});

test("saved persona corpus keeps the auditioned voice across restart", () => {
  let state = restoreState(null);
  state = addPersonaCorpus(
    state,
    state.activePersonaId,
    "晚安，今晚也做个好梦。",
    "睡前问候",
    "goodnight",
    "mature",
    "older-voice",
  );
  assert.equal(getActivePersona(state).customCorpora[0].voiceProfileId, "older-voice");

  const restored = restoreState(JSON.stringify(state));
  assert.equal(
    getActivePersona(restored).customCorpora[0].voiceProfileId,
    "older-voice",
  );
});

test("legacy global chat and corpus migrate to an independent Zhang Rong persona", () => {
  const s = restoreState(
    JSON.stringify({
      lookId: "linwei-red-sole",
      settings: { name: "队长" },
      messages: [{ id: "m1", role: "user", content: "我喜欢茉莉花茶", createdAt: 10 }],
      savedMessages: [{ id: "m2", role: "assistant", content: "记得喝茶", createdAt: 11 }],
      corpora: [
        { id: "legacy", title: "称呼", text: "叫我阿薇", createdAt: 12 },
      ],
    }),
  );
  const profile = getActivePersona(s);
  const thread = getPersonaThread(s);
  assert.equal(profile.displayName, "张容");
  assert.equal(profile.customCorpora[0].text, "叫我阿薇");
  assert.equal(thread.messages[0].content, "我喜欢茉莉花茶");
  assert.equal(thread.savedMessages[0].content, "记得喝茶");
  assert.equal(thread.memories.userName, "队长");
  assert.equal(s.lastLookByCharacter.linwei, "linwei-red-sole");
  assert.equal(s.lookId, "linwei-red-sole");
});

test("legacy appearance profiles become unique personas without runtime appearance bindings", () => {
  const s = restoreState(
    JSON.stringify({
      lookId: "ruby-date",
      backgroundId: "missing-background",
      characterProfiles: {
        ruby: {
          displayName: "薇姐",
          corpora: [
            { id: "ok", title: "风格", text: "温柔但不含糊", enabled: true },
            { id: "bad", title: "空", text: "  ", enabled: true },
          ],
        },
        linwei: {
          displayName: "薇姐",
          corpora: [{ id: "direct", title: "风格", text: "说话直接", enabled: true }],
        },
      },
      lastLookByCharacter: {
        ruby: "ruby-velvet",
        linwei: "missing-look",
      },
    }),
  );
  assert.equal(s.backgroundId, "moon-room");
  const migrated = Object.values(s.personas).filter((item) => item.displayName === "薇姐");
  assert.equal(migrated.length, 2);
  assert.equal(new Set(migrated.map((item) => item.id)).size, 2);
  assert.ok(migrated.every((item) => !JSON.stringify(item).includes("characterId")));
  assert.deepEqual(
    migrated.map((item) => item.customCorpora[0].text).sort(),
    ["温柔但不含糊", "说话直接"],
  );
  assert.equal(s.lastLookByCharacter.ruby, "ruby-date");
  assert.equal("linwei" in s.lastLookByCharacter, false);
});

test("v2 recovery repairs a missing active persona and thread without changing appearance", () => {
  const original = restoreState(null);
  const corrupt = {
    ...original,
    activePersonaId: "missing-persona",
    lookId: "linwei-red-sole",
    personaThreads: {},
  };
  const repaired = restoreState(JSON.stringify(corrupt));
  assert.equal(repaired.activePersonaId, "older-sister");
  assert.equal(repaired.lookId, "linwei-red-sole");
  assert.deepEqual(getPersonaThread(repaired).messages, []);
});

test("restoring migrated v2 state twice never duplicates personas or messages", () => {
  const migrated = restoreState(JSON.stringify({
    messages: [{ id: "once", role: "user", content: "只迁移一次", createdAt: 1 }],
  }));
  const once = restoreState(JSON.stringify(migrated));
  const twice = restoreState(JSON.stringify(once));
  assert.deepEqual(Object.keys(twice.personas), Object.keys(once.personas));
  assert.equal(getPersonaThread(twice).messages.length, 1);
  assert.equal(getPersonaThread(twice).messages[0].id, "once");
});
