import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { LOOKS } from "../src/looks.mjs";
import { WARDROBE_FITS } from "../server/wardrobe.mjs";
import * as glamMotion from "../src/glam-motion.mjs";
import {
  blinkAt,
  normalizeRig,
  glamPose,
  deformPoint,
  deformArmPoint,
  deformVertices,
  fitGlamModel,
  remapFaceFeature,
  resolveFaceStabilizer,
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

test("home framing is opt-in and the three leg-focused looks fit their complete artwork", () => {
  for (const homeFraming of [undefined, null, 'portrait', 'invalid', true]) {
    assert.equal(normalizeRig({ homeFraming }).homeFraming, 'portrait');
  }
  assert.equal(normalizeRig({ homeFraming: 'full-body' }).homeFraming, 'full-body');
  for (const lookId of ['wen-furen-black-gold', 'ling-yuling-jade-robes', 'mei-ning-teal-attire']) {
    const rig = normalizeRig(JSON.parse(readFileSync(new URL(`../public/looks/${lookId}/rig.json`, import.meta.url))));
    assert.equal(rig.homeFraming, 'full-body');
    const fit = fitGlamModel(700, 790, 1024, 1536, rig.homeFraming === 'full-body', rig);
    assert.ok(fit.y + rig.bounds.top * 1536 * fit.scale >= 0);
    assert.ok(fit.y + rig.bounds.bottom * 1536 * fit.scale <= 790, `${lookId} feet must remain inside the home viewport`);
  }
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

test("crouch face stabilizer maps the authored target face back to the canonical identity", () => {
  const rig = normalizeRig({
    head: { x: 0.48, y: 0.1, radiusX: 0.15, radiusY: 0.085 },
    eyes: [
      { x: 0.45, y: 0.085, rx: 0.018, ry: 0.005 },
      { x: 0.51, y: 0.085, rx: 0.018, ry: 0.005 },
    ],
    actionFaces: {
      squat: { x: 0.515, y: 0.12, radiusX: 0.142, radiusY: 0.09 },
    },
  });

  const crouch = resolveFaceStabilizer(rig, "squat");
  assert.equal(crouch.enabled, 1);
  assert.deepEqual([...crouch.source], [0.48, 0.1, 0.15, 0.085]);
  assert.deepEqual([...crouch.target], [0.515, 0.12, 0.142, 0.09]);

  const walk = resolveFaceStabilizer(rig, "sexyWalk");
  assert.equal(walk.enabled, 0);
  assert.deepEqual([...walk.target], [...walk.source]);

  const mappedLeftEye = remapFaceFeature(rig.eyes[0], rig.head, rig.actionFaces.squat);
  assert.ok(Math.abs(mappedLeftEye.x - 0.4866) < 1e-9);
  assert.ok(Math.abs(mappedLeftEye.y - 0.10411764705882352) < 1e-9);
  assert.ok(Math.abs(mappedLeftEye.rx - rig.eyes[0].rx * (0.142 / 0.15)) < 1e-9);
  assert.ok(Math.abs(mappedLeftEye.ry - rig.eyes[0].ry * (0.09 / 0.085)) < 1e-9);
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

// Decode the real 8-bit RGBA assets so the regression follows changed artwork,
// including fitted shoe variants, rather than a hand-authored shoulder guess.
function readArtwork(file) {
  const png = readFileSync(new URL(file, import.meta.url));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(png[24], 8);
  assert.equal(png[25], 6);
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") {
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const pixels = new Uint8Array(width * height * 4);
  const stride = width * 4;
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const left = x >= 4 ? pixels[i - 4] : 0;
      const up = y > 0 ? pixels[i - stride] : 0;
      const corner = y > 0 && x >= 4 ? pixels[i - stride - 4] : 0;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)][filter];
      assert.notEqual(predictor, undefined);
      pixels[i] = raw[y * (stride + 1) + x + 1] + predictor;
    }
  }
  return { pixels, width, height };
}

test("Linwei's connected top stays on one animated body throughout a wave", () => {
  const { pixels, width, height } = readArtwork("../public/looks/linwei-white-bikini/character.png");
  const rig = normalizeRig(JSON.parse(readFileSync(new URL("../public/looks/linwei-white-bikini/rig.json", import.meta.url))));
  assert.ok(pixels[(Math.floor(height * 0.24) * width + 638) * 4 + 3] > 200,
    "the old split passed through an opaque garment, not a transparent gap");
  const separation = glamMotion.resolveArmSeparation(pixels, width, height, rig);
  assert.equal(separation.separated, false);
  const safeRig = { ...rig, armMobility: separation.armMobility };
  const pose = glamPose({ time: 4160, action: { kind: "wave", elapsed: 950 } });
  for (const [u, v] of [[638 / width, 0.24], [0.70, 0.40], [712 / width, 0.56]]) {
    assert.deepEqual(deformArmPoint(u, v, pose, safeRig, width, height), deformPoint(u, v, pose, safeRig, width, height));
  }
  assert.ok(pose.blink > 0.9);
  assert.ok(Math.abs(pose.breath) > 0.001);
  assert.ok(pose.smile > 0);
});

test("a separated arm keeps every fingertip beyond the old fixed hand cutoff", () => {
  const width = 128, height = 192;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 36; y <= 125; y++) {
    for (let x = 64; x <= 77; x++) pixels[(y * width + x) * 4 + 3] = 255;
    for (let x = 84; x <= 93; x++) pixels[(y * width + x) * 4 + 3] = 255;
  }
  for (let y = 126; y <= 130; y++) {
    for (let x = 64; x <= 77; x++) pixels[(y * width + x) * 4 + 3] = 255;
    for (const x of [84, 85, 88, 89, 93]) pixels[(y * width + x) * 4 + 3] = 255;
  }
  const rig = normalizeRig({ shoulders: { right: [0.625, 0.1875] } });
  const separation = glamMotion.resolveArmSeparation(pixels, width, height, rig);
  assert.equal(separation.separated, true);
  assert.equal(separation.armMobility, 1);
  for (const y of [60, 125, 126, 130]) {
    const boundary = (separation.rows[y * 4] * 256 + separation.rows[y * 4 + 1]) / 65535 * width;
    assert.ok(boundary > 77 && boundary < 84);
    assert.equal(separation.rows[y * 4 + 2], 255, "the entire hand moves on the arm layer");
  }
  assert.equal(separation.rows[131 * 4 + 2], 0, "pixels beneath the hand remain on the body");
  const wave = glamPose({ motion: false, action: { kind: "wave", elapsed: 950 } });
  assert.ok(deformArmPoint(88 / width, 130 / height, wave, rig, width, height).y < 130 / height - 0.005);
});

test("an arm that reconnects to clothing uses the joined body instead of cutting an opaque seam", () => {
  const width = 128, height = 192;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 36; y <= 125; y++) {
    for (let x = 64; x <= 93; x++) {
      if (y === 80 || x <= 77 || x >= 84) pixels[(y * width + x) * 4 + 3] = 255;
    }
  }
  const separation = glamMotion.resolveArmSeparation(pixels, width, height,
    normalizeRig({ shoulders: { right: [0.625, 0.1875] } }));
  assert.equal(separation.separated, false);
  assert.equal(separation.armMobility, 0);
});

test("all authored looks and fitted shoes avoid opaque arm cuts or use one joined body", () => {
  for (const artwork of [...LOOKS, ...WARDROBE_FITS]) {
    const { pixels, width, height } = readArtwork(`../public${artwork.asset}`);
    const rigFile = artwork.rig || `/looks/${artwork.id}/rig.json`;
    const rig = normalizeRig(JSON.parse(readFileSync(new URL(`../public${rigFile}`, import.meta.url))));
    const separation = glamMotion.resolveArmSeparation(pixels, width, height, rig);
    if (!separation.separated) {
      assert.equal(separation.armMobility, 0, `${artwork.asset} must not separate connected source pixels`);
      continue;
    }
    for (let y = 0; y < height; y++) {
      if (!separation.rows[y * 4 + 2]) continue;
      const boundary = (separation.rows[y * 4] * 256 + separation.rows[y * 4 + 1]) / 65535 * width;
      for (const x of [Math.floor(boundary), Math.ceil(boundary)]) {
        assert.equal(pixels[(y * width + x) * 4 + 3], 0, `${artwork.asset}: opaque cut at ${x},${y}`);
      }
    }
  }
});
test("eye axes follow the source head tilt in pixel space and allow per-eye calibration", async () => {
  const { resolveEyeAxes, normalizeRig } = await import("../src/glam-motion.mjs");
  assert.equal(typeof resolveEyeAxes, "function");
  const rig = normalizeRig({ eyes: [{ x: .5, y: .1 }, { x: .55, y: .11 }] });
  const axes = resolveEyeAxes(rig, 1000, 1500);
  const slope = .015 / .05;
  assert.ok(Math.abs(axes[0][1] / axes[0][0] - slope) < 1e-6);
  assert.deepEqual(axes[0], axes[1]);
  const custom = normalizeRig({ eyes: [{ angle: -8 }, { angle: 5 }] });
  const customAxes = resolveEyeAxes(custom, 1000, 1500);
  assert.ok(customAxes[0][1] < 0 && customAxes[1][1] > 0);
});
