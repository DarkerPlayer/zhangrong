import test from "node:test";
import assert from "node:assert/strict";
import { detectMotionCommand, offlineReply } from "../server/dialogue.mjs";

test("deterministic Chinese commands map to V2 motion ids and arguments", () => {
  for (const [message, motion] of [
    ["走一下", "walk_feminine"],
    ["走过来", "walk_feminine"],
    ["优雅地走过来", "walk_confident"],
    ["自信地走两步", "walk_confident"],
    ["走秀给我看", "walk_runway"],
    ["蹲下", "crouch_enter"],
    ["站起来", "crouch_exit"],
    ["撩一下头发", "idle_hair_touch"],
    ["回头看看", "look_back"],
    ["挥挥手", "wave"],
  ]) assert.equal(detectMotionCommand(message)?.motion, motion, message);
  assert.equal(detectMotionCommand("向左走两步").args.direction, "left");
  assert.equal(detectMotionCommand("向右走一下").args.direction, "right");
});

test("negated or descriptive movement text never becomes a command", () => {
  for (const message of ["不要蹲下", "别站起来", "我昨天走了一下", "走秀是什么意思", "她回头看看我"]) {
    assert.equal(detectMotionCommand(message), null, message);
  }
});

test("Linwei motion commands execute locally while an unsupported look gets an honest fallback", () => {
  const supported = offlineReply({ message: "优雅地走过来", avatarMode: "live2d", lookId: "linwei-red-sole" });
  assert.equal(supported.petAction, "walk_confident");
  assert.match(supported.reply, /走|步/);
  const unsupported = offlineReply({ message: "蹲下", avatarMode: "live2d", lookId: "ruby-velvet" });
  assert.equal(unsupported.petAction, null);
  assert.match(unsupported.reply, /这套造型|林薇/);
});

test("crouch stays down until the separate stand command", () => {
  assert.equal(offlineReply({ message: "蹲下", avatarMode: "live2d", lookId: "linwei-red-sole" }).petAction, "crouch_enter");
  assert.equal(offlineReply({ message: "站起来", avatarMode: "live2d", lookId: "linwei-red-sole" }).petAction, "crouch_exit");
});
