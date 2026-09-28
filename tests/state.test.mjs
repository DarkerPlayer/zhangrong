import { test } from "node:test";
import assert from "node:assert/strict";
import {
  restoreState,
  appendMessage,
  formatRemaining,
  sceneFromCommand,
} from "../src/state.mjs";
import { getLook } from "../src/looks.mjs";
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
  assert.equal(s.messages.length, 1);
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
test("favorited messages survive rolling history and remain exportable", async () => {
  const { toggleFavorite, exportableMessages } =
    await import("../src/state.mjs");
  let s = restoreState(null);
  s.messages = appendMessage(s.messages, "assistant", "永久珍藏的第一句话");
  const firstId = s.messages[0].id;
  s = toggleFavorite(s, firstId);
  for (let i = 0; i < 210; i++)
    s.messages = appendMessage(s.messages, "user", "后来的消息" + i);
  assert.equal(s.messages.length, 200);
  s = restoreState(JSON.stringify(s));
  assert.equal(s.savedMessages[0].content, "永久珍藏的第一句话");
  assert.equal(
    exportableMessages(s).some((m) => m.id === firstId),
    true,
  );
  s = toggleFavorite(s, firstId);
  assert.equal(s.savedMessages.length, 0);
});
