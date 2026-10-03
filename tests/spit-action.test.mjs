import test from "node:test";
import assert from "node:assert/strict";
import { getLook, LOOKS } from "../server/looks.mjs";
import { capabilityReply, createMessages, detectMotionCommand, offlineReply } from "../server/dialogue.mjs";
import { createMotionManifest } from "../src/motion/MotionManifest.mjs";
import { MotionController } from "../src/motion/MotionController.mjs";
import { GlamMotionAdapter, sampleFrameSequence } from "../src/motion/adapters/GlamMotionAdapter.mjs";

test("the authored spit action progresses through prepare, release and recover once, then rests", () => {
  const look = getLook("fancha-rose-office");
  const manifest = createMotionManifest(look);
  const adapter = new GlamMotionAdapter({ manifest, availableActions: { spit: 3 } });
  const controller = new MotionController({ motions: manifest.motions, adapter });
  assert.equal(controller.playMotion("spit").motionId, "spit");
  assert.equal(adapter.getSample().frame?.phase, "prepare");
  controller.update(550);
  assert.equal(adapter.getSample().frame?.phase, "release");
  controller.update(350);
  assert.equal(adapter.getSample().frame?.phase, "recover");
  controller.update(699);
  assert.equal(adapter.getSample().frame?.nextIndex, 2, "the last phase must never blend back into preparation");
  controller.update(1);
  assert.equal(controller.getMotionState().state, "IDLE");
  assert.equal(adapter.getSample().poseAlpha, 0);
  controller.update(3000);
  assert.equal(adapter.getSample().frame, null, "a single request must not repeat");
  controller.destroy();
});

test("spit never silently falls back to another animation on a look without authored frames", () => {
  for (const look of LOOKS.filter((look) => look.id !== "fancha-rose-office")) {
    const manifest = createMotionManifest(look);
    const adapter = new GlamMotionAdapter({ manifest });
    const controller = new MotionController({ motions: manifest.motions, adapter });
    assert.equal(controller.canPlayMotion("spit"), false, look.id);
    assert.equal(controller.playMotion("spit").accepted, false, look.id);
    controller.destroy();
  }
});

test("explicit spit commands play only on the supported dynamic look and negation is respected", () => {
  for (const message of ["吐口水", "吐一下口水", "请你吐一下口水吧", "我想看你吐口水"]) {
    assert.equal(detectMotionCommand(message)?.motion, "spit");
    const reply = offlineReply({ message, avatarMode: "live2d", lookId: "fancha-rose-office" });
    assert.equal(reply.petAction, "spit");
    assert.match(reply.reply, /吐口水/);
    for (const lookId of ["ruby-velvet", "haru"]) {
      const missing = offlineReply({ message, avatarMode: "live2d", lookId });
      assert.equal(missing.petAction, null);
      assert.match(missing.reply, /没有.*动作/);
    }
    assert.equal(offlineReply({ message, avatarMode: "photo", lookId: "fancha-rose-office" }).petAction, null);
  }
  for (const message of ["不要吐口水", "不许吐一下口水", "吐口水是什么意思", "她吐口水", "我昨天吐口水", "我吐口水了", "我想吐口水", "吐口水是不对的"]) {
    assert.equal(detectMotionCommand(message), null, message);
    assert.equal(offlineReply({ message, avatarMode: "live2d", lookId: "fancha-rose-office" }).petAction, null, message);
  }
  for (const message of ["给我生成一个吐口水视频", "给我生成视频来演示吐口水"]) {
    const video = offlineReply({ message, avatarMode: "live2d", lookId: "fancha-rose-office" });
    assert.equal(video.petAction, null);
    assert.match(video.reply, /不能生成.*视频/);
  }
});

test("spit phases remain crisp until a brief transition and recovery never repeats preparation", () => {
  const frames = getLook("fancha-rose-office").actions.spit;
  assert.equal(sampleFrameSequence(frames, 460, { loop: false }).blend, 0);
  assert.ok(sampleFrameSequence(frames, 525, { loop: false }).blend > 0);
  const ended = sampleFrameSequence(frames, 5000, { loop: false });
  assert.equal(ended.phase, "recover");
  assert.equal(ended.nextIndex, 2);
  assert.equal(ended.blend, 0);
});

test("action discovery and model context report spit only on its supported look", () => {
  assert.match(capabilityReply("有哪些动作", "live2d", "fancha-rose-office"), /吐口水/);
  assert.doesNotMatch(capabilityReply("有哪些动作", "live2d", "ruby-velvet"), /吐口水/);
  const messages = createMessages({ message: "今天好", avatarMode: "live2d", lookId: "fancha-rose-office" });
  assert.match(messages[0].content, /吐口水/);
});

test("spit frame offsets keep the authored shoe soles aligned with the resting portrait", () => {
  const manifest = createMotionManifest(getLook("fancha-rose-office"));
  const adapter = new GlamMotionAdapter({ manifest, availableActions: { spit: 3 } });
  const motion = manifest.motions.spit;
  for (const [elapsedMs, soleY] of [[0, 1475], [550, 1475], [900, 1476]]) {
    adapter.play(motion, { elapsedMs });
    const { anchorOffset } = adapter.getSample().frame;
    const screenSoleY = soleY + anchorOffset.y * 1536;
    assert.ok(Math.abs(screenSoleY - 1506) < 0.5,
      `phase at ${elapsedMs} ms must land at the resting portrait's shoe sole, got ${screenSoleY}`);
    assert.equal(anchorOffset.x, 0);
  }
  adapter.destroy();
});
