import test from 'node:test';
import assert from 'node:assert/strict';
import { getLook } from '../server/looks.mjs';
import { CUTE_ACTIONS,CUTE_MESH_ACTIONS,CUTE_FRAME_ACTIONS } from '../server/cute-actions.mjs';
import { createMotionManifest } from '../src/motion/MotionManifest.mjs';
import { MotionController } from '../src/motion/MotionController.mjs';
import { GlamMotionAdapter } from '../src/motion/adapters/GlamMotionAdapter.mjs';
import { sampleCutePose } from '../src/motion/cute-poses.mjs';
import { glamPose } from '../src/glam-motion.mjs';

test('all sixteen Yinyue gestures execute once, interrupt safely and stay unavailable on other looks',()=>{
 const look=getLook('yinyue-silver-fox');const manifest=createMotionManifest(look);
 const adapter=new GlamMotionAdapter({manifest,availableActions:Object.fromEntries(CUTE_FRAME_ACTIONS.map(({kind})=>[kind,3]))});
 const controller=new MotionController({motions:manifest.motions,adapter});
 assert.equal(CUTE_ACTIONS.length,16);
 for(const {kind} of CUTE_ACTIONS){
  assert.equal(controller.playMotion(kind).accepted,true,kind);
  controller.update(manifest.motions[kind].durationMs*.4);
  assert.equal(adapter.getSample().motionId,kind);
  assert.equal(controller.playMotion(kind).accepted,true,'repeat must restart');
  controller.update(manifest.motions[kind].durationMs);
  assert.equal(controller.getMotionState().state,'IDLE',kind);
  assert.equal(adapter.getSample().poseAlpha,0);
 }
 controller.playMotion('cute_heart');controller.update(400);
 assert.equal(controller.playMotion('cute_wink_left').accepted,true);
 assert.equal(adapter.getSample().frame,null,'mesh gesture cannot keep old authored frame');
 controller.stopAllMotions();assert.equal(controller.getMotionState().state,'IDLE');controller.destroy();
 const other=createMotionManifest(getLook('ziling-violet-dress'));
 const c=new MotionController({motions:other.motions,adapter:new GlamMotionAdapter({manifest:other})});
 for(const {kind} of CUTE_ACTIONS)assert.equal(c.playMotion(kind).accepted,false,kind);
 c.destroy();
});

test('winks close only the intended eye, double blink has two distinct closures, all gestures settle',()=>{
 const left=sampleCutePose('cute_wink_left',800,2200),right=sampleCutePose('cute_wink_right',800,2200);
 assert.equal(left.blinkLeft,0);assert.ok(left.blinkRight>.99);
 assert.equal(right.blinkRight,0);assert.ok(right.blinkLeft>.99);
 for(const [t,closed] of [[.31,true],[.46,false],[.60,true],[.80,false]]){
  const p=sampleCutePose('cute_double_blink',t*1900,1900);assert.equal(p.blinkLeft>.95,closed);
 }
 const real=glamPose({time:4160,action:{pose:left}});
 assert.equal(real.blinkLeft,0,'explicit wink keeps other eye open despite ambient blink');
 assert.ok(real.blinkRight>.99);
 for(const {kind,durationMs} of CUTE_MESH_ACTIONS){
  for(const elapsed of [0,durationMs,durationMs+100]){
   const p=sampleCutePose(kind,elapsed,durationMs);
   assert.ok(Object.values(p).every(v=>v===0),`${kind} must return to neutral`);
  }
 }
});
