import test from "node:test";
import assert from "node:assert/strict";
import { AUTHORED_ACTIONS } from "../server/authored-actions.mjs";
import { createMotionManifest } from "../src/motion/MotionManifest.mjs";
import { MotionController } from "../src/motion/MotionController.mjs";
import { GlamMotionAdapter } from "../src/motion/adapters/GlamMotionAdapter.mjs";
import { getLook } from "../server/looks.mjs";
import { detectMotionCommand, offlineReply, capabilityReply } from "../server/dialogue.mjs";

test("authored gestures use outfit-specific frames and finish once without fallback", () => {
  for (const {kind, fullBody} of AUTHORED_ACTIONS) {
    const frames = ["prepare", "perform", "recover"].map(phase => ({src:`/${kind}-${phase}.png`,durationMs:500,phase}));
    const manifest = createMotionManifest({actions:{[kind]:frames}});
    const adapter = new GlamMotionAdapter({manifest,availableActions:{[kind]:3}});
    const controller = new MotionController({motions:manifest.motions,adapter});
    assert.equal(controller.playMotion(kind).accepted,true,kind);
    controller.update(500);
    assert.equal(adapter.getSample().frame.phase,"perform");
    assert.equal(adapter.getSample().preserveExpression,true);
    assert.equal(Boolean(adapter.getSample().fullBody),Boolean(fullBody));
    controller.update(1000);
    assert.equal(controller.getMotionState().state,"IDLE");
    assert.equal(adapter.getSample().poseAlpha,0);
    controller.destroy();
    const empty = createMotionManifest({actions:null});
    const unsupported = new MotionController({motions:empty.motions,adapter:new GlamMotionAdapter({manifest:empty})});
    assert.equal(unsupported.playMotion(kind).accepted,false);
    unsupported.destroy();
  }
});

test("Songyu actions are discoverable and accept only direct current-user commands", () => {
  const look = getLook("songyu-azure-robes");
  assert.equal(Object.keys(look.actions).length, AUTHORED_ACTIONS.length);
  for (const {kind,label} of AUTHORED_ACTIONS) {
    assert.equal(detectMotionCommand(`请你${label}吧`)?.motion,kind);
    assert.equal(offlineReply({message:`请你${label}`,avatarMode:"live2d",lookId:look.id}).petAction,kind);
    assert.ok(capabilityReply("有哪些动作","live2d",look.id).includes(label));
    assert.equal(offlineReply({message:label,avatarMode:"live2d",lookId:"ruby-velvet"}).petAction,null);
    for (const message of [`不要${label}`,`我正在${label}`,`她昨天${label}`,`${label}是什么意思`]) {
      assert.equal(detectMotionCommand(message),null,message);
    }
  }
});
