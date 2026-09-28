import test from "node:test";
import assert from "node:assert/strict";
import * as glamMotion from "../src/glam-motion.mjs";
import {
  blinkAt,
  normalizeRig,
  glamPose,
  deformPoint,
  deformArmPoint,
  deformVertices,
  fitGlamModel,
} from "../src/glam-motion.mjs";

test("ambient animation deforms the head and torso locally while planted feet stay still", () => {
  const rig = normalizeRig({});
  const pose = glamPose({ time: 1400, motion: true, gaze: { x: 0.6, y: 0.2 } });
  const head = deformPoint(0.5, 0.13, pose, rig, 1024, 1536);
  const chest = deformPoint(0.62, 0.32, pose, rig, 1024, 1536);
  const foot = deformPoint(0.55, 0.97, pose, rig, 1024, 1536);
  assert.ok(Math.hypot(head.x - 0.5, head.y - 0.13) > 0.0005);
  assert.ok(Math.hypot(chest.x - 0.62, chest.y - 0.32) > 0.0002);
  assert.deepEqual(foot, { x: 0.55, y: 0.97 });
});

test("V2 body layers counter-rotate chest and hips while keeping facial layers active", () => {
  const rig = normalizeRig({});
  const base = glamPose({
    time: 1000,
    gaze: { x: 0.4, y: -0.2 },
    action: {
      pose: {
        hipX: 0.012,
        hipRoll: 0.035,
        chestRoll: -0.018,
        shoulderRoll: -0.028,
        hairLag: 0.004,
      },
    },
  });
  assert.equal(base.hipRoll, 0.035);
  assert.equal(base.chestRoll, -0.018);
  assert.ok(base.headTurn > 0);
  assert.ok(base.blink >= 0);
  const hip = deformPoint(0.5, 0.55, base, rig);
  const shoulder = deformPoint(0.5, 0.28, base, rig);
  assert.notEqual(hip.x, shoulder.x);
});

test("repeated mesh updates use the undeformed rest pose and never accumulate drift", () => {
  const original = new Float32Array([512, 200, 640, 500, 560, 1490]);
  const rest = new Float32Array(original);
  const output = new Float32Array(original.length);
  const pose = glamPose({ time: 1700, motion: true });
  const rig = normalizeRig({});
  deformVertices(rest, output, pose, rig, 1024, 1536);
  const first = new Float32Array(output);
  for (let i = 0; i < 100; i++) deformVertices(rest, output, pose, rig, 1024, 1536);
  assert.deepEqual(output, first);
  assert.deepEqual(rest, original);
});

test("pausing freezes ambient geometry and blinking but deliberate actions still respond", () => {
  const first = glamPose({ time: 1400, motion: false, gaze: { x: 1, y: 1 } });
  const later = glamPose({ time: 9000, motion: false, gaze: { x: -1, y: -1 } });
  assert.deepEqual(first, later);
  assert.equal(first.blink, 0);
  const rig = normalizeRig({});
  assert.deepEqual(deformPoint(0.5, 0.14, first, rig, 1024, 1536), { x: 0.5, y: 0.14 });
  const wave = glamPose({ time: 9000, motion: false, action: { kind: "wave", elapsed: 950 } });
  const hand = deformArmPoint(0.78, 0.48, wave, rig, 1024, 1536);
  assert.ok(hand.y < 0.475, "the wave must physically lift the hand region");
  assert.ok(Math.abs(wave.armAngle) > 0.12);
  assert.equal(glamPose({ action: { kind: "wave", elapsed: 8000 }, motion: false }).armAngle, 0);
});

test("blinks are brief smooth closures separated by naturally spaced open periods", () => {
  assert.equal(blinkAt(0), 0);
  assert.equal(blinkAt(4000), 0);
  assert.ok(blinkAt(4160) > 0.9);
  assert.equal(blinkAt(4300), 0);
  for (let t = 0; t < 20000; t += 13) assert.ok(blinkAt(t) >= 0 && blinkAt(t) <= 1);
  let closed = 0;
  for (let t = 0; t < 20000; t += 10) if (blinkAt(t) > 0.5) closed++;
  assert.ok(closed > 10 && closed < 70, "blinking should not look like prolonged eye closure");
});

test("waving isolates the arm without pulling the adjacent waist and skirt outward", () => {
  const rig = normalizeRig({ shoulders: { right: [0.624, 0.1875] } });
  const wave = glamPose({ motion: false, action: { kind: "wave", elapsed: 950 } });
  const waist = deformPoint(0.61, 0.34, wave, rig, 1024, 1536);
  const skirt = deformPoint(0.65, 0.44, wave, rig, 1024, 1536);
  const hand = deformArmPoint(0.73, 0.49, wave, rig, 1024, 1536);
  assert.deepEqual(waist, { x: 0.61, y: 0.34 });
  assert.deepEqual(skirt, { x: 0.65, y: 0.44 });
  assert.ok(hand.y < 0.48);
  const wristLeft = deformArmPoint(0.7, 0.46, wave, rig, 1024, 1536);
  const wristRight = deformArmPoint(0.74, 0.46, wave, rig, 1024, 1536);
  const wristWidth = Math.hypot((wristRight.x - wristLeft.x) * 1024, (wristRight.y - wristLeft.y) * 1536);
  assert.ok(Math.abs(wristWidth - 40.96) < 0.00001, "the separate arm layer must retain its actual width");
});

test("zero arm mobility keeps joined sleeves on the body mesh throughout a greeting", () => {
  const rig = normalizeRig({ armMobility: 0 });
  const rest = new Float32Array([512, 200, 640, 400, 700, 600, 780, 740, 560, 1490]);
  const body = new Float32Array(rest.length);
  const arm = new Float32Array(rest.length);
  for (const elapsed of [250, 950, 1800, 3000]) {
    const pose = glamPose({ time: 1400, action: { kind: "wave", elapsed } });
    deformVertices(rest, body, pose, rig, 1024, 1536);
    deformVertices(rest, arm, pose, rig, 1024, 1536, true);
    assert.deepEqual(arm, body, "joined clothing must not separate between mesh layers");
    assert.ok(pose.smile > 0, "the greeting still has its facial response");
    assert.notEqual(body[0], rest[0], "head and ambient movement remain active");
  }
});

test("arm mobility defaults to the existing wave and clamps imported values", () => {
  const rig = normalizeRig({});
  assert.equal(rig.armMobility, 1);
  assert.equal(normalizeRig({ armMobility: -1 }).armMobility, 0);
  assert.equal(normalizeRig({ armMobility: 2 }).armMobility, 1);
  assert.equal(normalizeRig({ armMobility: NaN }).armMobility, 1);
  assert.equal(normalizeRig({ armMobility: 0.5 }).armMobility, 0.5);
  const wave = glamPose({ motion: false, action: { kind: "wave", elapsed: 950 } });
  const hand = deformArmPoint(0.78, 0.48, wave, rig, 1024, 1536);
  assert.deepEqual(hand, deformArmPoint(0.78, 0.48, wave, normalizeRig({ armMobility: 1 }), 1024, 1536));
  assert.ok(hand.y < 0.475, "existing rigs keep their original hand lift");
});

test("full-body fitting keeps opaque art and gesture margins inside small and large pets", () => {
  const rig = normalizeRig({ bounds: { left: 0.21, top: 0.04, right: 0.8, bottom: 0.97 } });
  for (const [w, h] of [[320, 480], [180, 300], [700, 790]]) {
    const fit = fitGlamModel(w, h, 1024, 1536, true, rig);
    assert.ok(fit.x + rig.bounds.left * 1024 * fit.scale >= 0);
    assert.ok(fit.x + rig.bounds.right * 1024 * fit.scale <= w);
    assert.ok(fit.y + rig.bounds.top * 1536 * fit.scale >= 0);
    assert.ok(fit.y + rig.bounds.bottom * 1536 * fit.scale <= h);
  }
  const full = fitGlamModel(700, 790, 1024, 1536, true, rig);
  const portrait = fitGlamModel(700, 790, 1024, 1536, false, rig);
  assert.ok(portrait.scale > full.scale * 1.35);
  assert.ok(Number.isFinite(fitGlamModel(0, 0, 0, 0, true, rig).scale));
});

test("crouch framing reveals the complete pose in a short portrait viewport", () => {
  const width = 270;
  const height = 251;
  const imageWidth = 1024;
  const imageHeight = 1536;
  const rig = normalizeRig({ bounds: { left: 0.25, top: 0.005, right: 0.75, bottom: 0.99 } });
  const portrait = fitGlamModel(width, height, imageWidth, imageHeight, false, rig);
  const fullBody = fitGlamModel(width, height, imageWidth, imageHeight, true, rig);

  const crouched = glamMotion.resolveActionFit(portrait, fullBody, {
    motionId: "crouch_idle",
    pose: { crouchAmount: 1 },
  });
  assert.ok(crouched.y >= 0);
  assert.ok(crouched.y + imageHeight * crouched.scale <= height);
  assert.ok(crouched.x >= 0);
  assert.ok(crouched.x + imageWidth * crouched.scale <= width);

  const halfway = glamMotion.resolveActionFit(portrait, fullBody, {
    motionId: "crouch_enter",
    pose: { crouchAmount: 0.5 },
  });
  assert.ok(halfway.scale < portrait.scale && halfway.scale > fullBody.scale);
  assert.deepEqual(
    glamMotion.resolveActionFit(portrait, fullBody, { motionId: "walk_feminine", pose: {} }),
    portrait,
  );
});

test("malformed facial coordinates cannot poison shader uniforms or mesh positions", () => {
  const rig = normalizeRig({ head: { x: NaN }, eyes: [{ x: 9, y: -2, rx: 0, skin: [255, NaN, 0] }] });
  assert.ok(Number.isFinite(rig.head.x));
  assert.ok(rig.eyes[0].x >= 0 && rig.eyes[0].x <= 1);
  assert.ok(rig.eyes[0].y >= 0 && rig.eyes[0].y <= 1);
  assert.ok(rig.eyes[0].rx > 0);
  assert.ok(rig.eyes[0].skin.every(Number.isFinite));
  assert.ok(rig.eyes[1]);
});

test("an interaction received during artwork loading plays once on readiness and never survives disposal", () => {
  assert.equal(typeof glamMotion.createGlamActionQueue, "function");
  const queue = glamMotion.createGlamActionQueue();
  const played = [];
  queue.send("pat");
  queue.send("wave");
  queue.connect((kind) => played.push(kind));
  assert.deepEqual(played, ["wave"], "only the most recent deliberate action should run");
  queue.send("shy");
  assert.deepEqual(played, ["wave", "shy"]);
  queue.disconnect();
  queue.send("pat");
  queue.disconnect();
  queue.connect((kind) => played.push(kind));
  assert.deepEqual(played, ["wave", "shy"], "a disposed look must not replay its pending action");
});

test("arm splitting follows the transparent gap so detached body and hair pixels stay behind", () => {
  assert.equal(typeof glamMotion.armSplitRows, "function");
  const width = 128, height = 192;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 35; y < 100; y++) {
    for (let x = 64; x <= 78; x++) pixels[(y * width + x) * 4 + 3] = 255;
    for (let x = 84; x <= 93; x++) pixels[(y * width + x) * 4 + 3] = 255;
  }
  for (let x = 84; x <= 103; x++) pixels[(96 * width + x) * 4 + 3] = x <= 90 && x >= 88 || x >= 96 ? 255 : 0;
  const rows = glamMotion.armSplitRows(pixels, width, height, normalizeRig({ shoulders: { right: [0.625, 0.1875] } }));
  const split = rows[60 * 4] / 255 * width;
  assert.ok(split > 78 && split < 84, "the body and arm must fall on opposite sides of the matte");
  assert.ok(rows[96 * 4] / 255 * width < 88, "all disconnected fingers belong to the same arm");
});
