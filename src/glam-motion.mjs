const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const number = (value, fallback, low = 0, high = 1) =>
  Number.isFinite(value) ? clamp(value, low, high) : fallback;
const smooth = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const color = (value, fallback) =>
  fallback.map((component, i) => number(value?.[i], component));

/** Each asset has normalized coordinates: facial artwork stays attached to its UVs. */
export function normalizeRig(input = {}) {
  const head = input.head || {};
  const normalizedHead = {
    x: number(head.x, 0.5),
    y: number(head.y, 0.13),
    neckY: number(head.neckY, 0.22, 0.1, 0.4),
    radiusX: number(head.radiusX, 0.19, 0.03, 0.4),
    radiusY: number(head.radiusY, 0.09, 0.02, 0.25),
  };
  const actionFaces = Object.fromEntries(
    Object.entries(input.actionFaces || {})
      .filter(([, source]) => source && typeof source === "object")
      .map(([kind, source]) => [kind, {
        x: number(source.x, normalizedHead.x),
        y: number(source.y, normalizedHead.y),
        radiusX: number(source.radiusX, normalizedHead.radiusX, 0.03, 0.4),
        radiusY: number(source.radiusY, normalizedHead.radiusY, 0.02, 0.25),
      }]),
  );
  const eye = (source, x) => ({
    x: number(source?.x, x),
    y: number(source?.y, 0.128),
    rx: number(source?.rx, 0.026, 0.001, 0.1),
    ry: number(source?.ry, 0.0065, 0.001, 0.06),
    angle: Number.isFinite(source?.angle) ? number(source.angle, 0, -45, 45) : undefined,
    skin: color(source?.skin, [0.96, 0.82, 0.76]),
    lid: color(source?.lid, [0.18, 0.10, 0.14]),
  });
  const mouth = input.mouth || {};
  const bounds = input.bounds || {};
  const point = (source, fallback) => fallback.map((v, i) => number(source?.[i], v));
  return {
    homeFraming: input.homeFraming === 'full-body' ? 'full-body' : 'portrait',
    armMobility: number(input.armMobility, 1),
    mouthCovered: input.mouthCovered === true,
    // Reference portraits keep their own expression and skin colour. Speech
    // remains subtle; an individually calibrated rig may explicitly override.
    expression: {
      speechStrength: number(input.expression?.speechStrength, 0.25),
      blushStrength: number(input.expression?.blushStrength, 0),
    },
    head: normalizedHead,
    actionFaces,
    eyes: [eye(input.eyes?.[0], 0.455), eye(input.eyes?.[1], 0.545)],
    mouth: {
      x: number(mouth.x, 0.5),
      y: number(mouth.y, 0.157),
      rx: number(mouth.rx, 0.021, 0.001, 0.08),
      ry: number(mouth.ry, 0.009, 0.001, 0.04),
      skin: color(mouth.skin, [0.96, 0.82, 0.76]),
      lip: color(mouth.lip, [0.62, 0.26, 0.32]),
      inner: color(mouth.inner, [0.21, 0.055, 0.08]),
    },
    shoulders: {
      left: point(input.shoulders?.left, [0.36, 0.25]),
      right: point(input.shoulders?.right, [0.64, 0.25]),
    },
    bounds: {
      left: number(bounds.left, 0.12, 0, 0.45),
      top: number(bounds.top, 0.015, 0, 0.25),
      right: number(bounds.right, 0.88, 0.55, 1),
      bottom: number(bounds.bottom, 0.985, 0.75, 1),
    },
  };
}

const faceVector = (face) => [face.x, face.y, face.radiusX, face.radiusY];

/** Eye axes are measured in pixels: normalized UVs have a different aspect. */
export function resolveEyeAxes(rig, width, height) {
  const [left, right] = rig.eyes;
  const tilt = Math.atan2((right.y - left.y) * height, (right.x - left.x) * width);
  return rig.eyes.map(eye => {
    const radians = Number.isFinite(eye.angle) ? eye.angle * Math.PI / 180 : clamp(tilt, -Math.PI / 4, Math.PI / 4);
    return new Float32Array([Math.cos(radians), Math.sin(radians)]);
  });
}

/** Map the canonical portrait face into an authored action frame. */
export function resolveFaceStabilizer(rig, actionKind) {
  const source = rig?.head || normalizeRig({}).head;
  const target = rig?.actionFaces?.[actionKind] || source;
  return {
    enabled: target === source ? 0 : 1,
    source: faceVector(source),
    target: faceVector(target),
  };
}

/** Keep eye and mouth animation attached after the canonical face is relocated. */
export function remapFaceFeature(feature, source, target) {
  const scaleX = target.radiusX / source.radiusX;
  const scaleY = target.radiusY / source.radiusY;
  return {
    ...feature,
    x: target.x + (feature.x - source.x) * scaleX,
    y: target.y + (feature.y - source.y) * scaleY,
    rx: feature.rx * scaleX,
    ry: feature.ry * scaleY,
  };
}

/** Four short closures in a 20-second irregular cycle; 0 is fully open. */
export function blinkAt(time) {
  const t = Math.max(0, Number(time) || 0) % 20000;
  for (const start of [4100, 9650, 13350, 18720]) {
    const elapsed = t - start;
    if (elapsed >= 0 && elapsed < 150) {
      return elapsed <= 65
        ? smooth(0, 65, elapsed)
        : 1 - smooth(65, 150, elapsed);
    }
  }
  return 0;
}

export const GLAM_ACTION_DURATION = Object.freeze({
  wave: 3300,
  pat: 2600,
  happy: 3000,
  shy: 2900,
  idle: 1600,
  squat: 3700,
  sexyWalk: 4400,
});

/** Keep the latest tap while a look loads; disposal cancels that look's request. */
export function createGlamActionQueue() {
  let handler = null;
  let pending = null;
  return {
    send(kind, options) {
      if (handler) handler(kind, false, options);
      else pending = { kind, options };
    },
    connect(perform) {
      handler = perform;
      if (pending) {
        const request = pending;
        pending = null;
        handler(request.kind, false, request.options);
      }
    },
    disconnect() {
      handler = null;
      pending = null;
    },
  };
}

/**
 * A split is safe only if the arm has a real transparent gap from the shoulder
 * through every fingertip. Connected clothing cannot be rotated as two images
 * without exposing a hole, so it keeps the complete animated body mesh.
 * RG stores a 16-bit boundary; B enables only rows that actually contain arm art.
 */
export function resolveArmSeparation(pixels, width, height, rig) {
  const rows = new Uint8Array(height * 4);
  for (let y = 0; y < height; y++) {
    rows[y * 4] = rows[y * 4 + 1] = rows[y * 4 + 3] = 255;
  }
  const joined = () => ({ rows, separated: false, armMobility: 0 });
  if (!rig.armMobility || width < 1 || height < 1 || pixels.length < width * height * 4) return joined();
  const shoulder = rig.shoulders.right;
  const firstRow = Math.floor(shoulder[1] * height);
  const gapWidth = Math.max(3, Math.ceil(width * 0.006));
  let previousBoundary;
  let armRows = 0;
  for (let y = firstRow; y < height; y++) {
    const runs = [];
    let start = -1;
    for (let x = Math.floor(width * 0.5); x <= width; x++) {
      // Even translucent antialias pixels must stay with their source limb.
      const opaque = x < width && pixels[(y * width + x) * 4 + 3] > 0;
      if (opaque && start < 0) start = x;
      if (!opaque && start >= 0) {
        runs.push({ start, end: x - 1 });
        start = -1;
      }
    }
    // The first external run starts the arm; every later run on this row is
    // another finger, rather than another candidate for the body boundary.
    const armIndex = runs.findIndex((run, index) => index > 0 &&
      run.start > width * (shoulder[0] - 0.045) &&
      run.end < width * (shoulder[0] + 0.23) &&
      run.end - run.start < width * 0.16 &&
      run.start - runs[index - 1].end >= gapWidth);
    if (armIndex < 0) {
      if (!armRows || runs.some((run) => run.end > previousBoundary)) return joined();
      break; // Actual end of the hand, not a fixed offset from the shoulder.
    }
    const body = runs[armIndex - 1];
    const arm = runs[armIndex];
    const boundary = (body.end + arm.start) / 2;
    // A jump to a different detached object is not reliable limb tracking.
    if (previousBoundary !== undefined && Math.abs(boundary - previousBoundary) > width * 0.025) return joined();
    previousBoundary = boundary;
    const encoded = Math.round(boundary / width * 65535);
    rows[y * 4] = encoded >> 8;
    rows[y * 4 + 1] = encoded & 255;
    rows[y * 4 + 2] = 255;
    armRows++;
  }
  if (armRows < height * 0.08 || rows[(height - 1) * 4 + 2]) return joined();
  return { rows, separated: true, armMobility: rig.armMobility };
}

/** Compatibility helper for consumers that only need the 1×height matte. */
export function armSplitRows(pixels, width, height, rig) {
  return resolveArmSeparation(pixels, width, height, rig).rows;
}

/** A bounded pose, independent of previous vertices and the display refresh rate. */
export function glamPose({ time = 0, motion = true, gaze = {}, action, mood = "idle" } = {}) {
  const seconds = time / 1000;
  const ambient = motion ? 1 : 0;
  const gx = number(gaze.x, 0, -0.8, 0.8) * ambient;
  const gy = number(gaze.y, 0, -0.65, 0.65) * ambient;
  const pose = {
    headAngle: motion ? Math.sin(seconds * 0.55) * 0.65 + gx * 1.5 : 0,
    headTurn: motion ? gx * 0.004 : 0,
    headNod: motion ? gy * -0.002 : 0,
    breath: motion ? Math.sin(seconds * 1.5) : 0,
    sway: motion ? Math.sin(seconds * 0.7) * 0.0023 : 0,
    hair: motion ? Math.sin(seconds * 0.95 + 0.9) * 0.0018 : 0,
    armAngle: 0,
    blink: motion ? blinkAt(time) : 0,
    smile: /happy|joy|开心|高兴/.test(mood) ? 0.3 : 0,
    blush: /shy|blush|害羞|心动/.test(mood) ? 0.18 : 0,
    bodyX: 0,
    bodyY: 0,
    hipX: 0,
    hipY: 0,
    hipRoll: 0,
    chestRoll: 0,
    shoulderRoll: 0,
    clothLag: 0,
  };
  const layer = action?.pose;
  if (layer) {
    for (const key of ["bodyX", "bodyY", "hipX", "hipY", "hipRoll", "chestRoll", "shoulderRoll", "clothLag"]) {
      if (Number.isFinite(layer[key])) pose[key] += layer[key];
    }
    if (Number.isFinite(layer.headAngle)) pose.headAngle += layer.headAngle;
    if (Number.isFinite(layer.headNod)) pose.headNod += layer.headNod;
    if (Number.isFinite(layer.headTurn)) pose.headTurn += layer.headTurn;
    for (const key of ["blinkLeft", "blinkRight", "smile", "blush"]) {
      if (Number.isFinite(layer[key])) pose[key] = clamp(layer[key]);
    }
    if (Number.isFinite(layer.hairLag)) pose.hair += layer.hairLag;
    if (Number.isFinite(layer.armAngle)) pose.armAngle += layer.armAngle;
    if (Number.isFinite(layer.breath)) pose.breath += layer.breath;
  }
  const actionKind = action?.kind || action?.actionKind;
  const duration = GLAM_ACTION_DURATION[actionKind];
  const elapsed = Number(action?.elapsed);
  if (!duration || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= duration) return pose;
  const envelope = smooth(0, 380, elapsed) * (1 - smooth(duration - 620, duration, elapsed));
  if (actionKind === "wave") {
    pose.armAngle = (-0.18 + Math.sin(elapsed / 155) * 0.04) * envelope;
    pose.headAngle += -1.5 * envelope;
    pose.smile = 0.75 * envelope;
  } else if (actionKind === "pat") {
    pose.headAngle += (4 + Math.sin(elapsed / 310) * 0.9) * envelope;
    pose.headNod += 0.002 * envelope;
    pose.smile = envelope;
    pose.blink = Math.max(pose.blink, 0.16 * envelope);
  } else if (actionKind === "happy") {
    pose.headAngle += Math.sin(elapsed / 340) * 2.2 * envelope;
    pose.headNod -= Math.abs(Math.sin(elapsed / 370)) * 0.002 * envelope;
    pose.smile = envelope;
  } else if (actionKind === "shy") {
    pose.headAngle += -3 * envelope;
    pose.headTurn -= 0.011 * envelope;
    pose.headNod += 0.0025 * envelope;
    pose.blush = 0.48 * envelope;
  } else if (actionKind === "squat" || actionKind === "sexyWalk") {
    // These full-body poses use matching illustrated frames in GlamPet.
  } else pose.headAngle += 1.7 * envelope;
  return pose;
}

/** Local skinning in image space. Feet stay planted and face UVs follow head motion. */
export function deformPoint(u, v, pose, rig, width = 1024, height = 1536) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const center = rig.head.x;
  const upper = 1 - smooth(0.55, 0.92, v);
  const torso = smooth(0.18, 0.28, v) * (1 - smooth(0.40, 0.59, v));
  const hipWeight = smooth(0.34, 0.48, v) * (1 - smooth(0.82, 0.99, v));
  const chestWeight = smooth(0.17, 0.25, v) * (1 - smooth(0.45, 0.58, v));
  const shoulderWeight = smooth(0.13, 0.21, v) * (1 - smooth(0.31, 0.42, v));
  let x = u + pose.sway * upper + pose.bodyX * upper;
  let y = v + pose.bodyY * upper;
  x += pose.hipX * hipWeight + pose.clothLag * smooth(0.48, 0.7, v) * (1 - smooth(0.93, 1, v));
  y += pose.hipY * hipWeight;
  x += -(v - 0.54) * Math.sin(pose.hipRoll) * hipWeight / aspect;
  x += -(v - 0.34) * Math.sin(pose.chestRoll) * chestWeight / aspect;
  x += -(v - 0.24) * Math.sin(pose.shoulderRoll) * shoulderWeight / aspect;
  x += (u - center) * pose.breath * 0.006 * torso;
  y -= pose.breath * 0.00125 * torso;
  const headWeight = 1 - smooth(rig.head.neckY - 0.012, rig.head.neckY + 0.055, v);
  if (headWeight > 0) {
    const dx = (u - center) * aspect;
    const dy = v - rig.head.neckY;
    const angle = (pose.headAngle * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    x += ((dx * cos - dy * sin - dx) / aspect + pose.headTurn) * headWeight;
    y += (dx * sin + dy * cos - dy + pose.headNod) * headWeight;
  }
  const hair = smooth(rig.head.radiusX * 0.65, rig.head.radiusX * 1.25, Math.abs(u - center)) *
    (1 - smooth(0.37, 0.58, v)) * smooth(0.045, 0.12, v);
  x += pose.hair * hair;
  return { x, y };
}

/** The UV-masked arm is a separate mesh, so rotating it cannot stretch the dress. */
export function deformArmPoint(u, v, pose, rig, width = 1024, height = 1536) {
  const base = deformPoint(u, v, pose, rig, width, height);
  const aspect = Math.max(1, width) / Math.max(1, height);
  const shoulder = rig.shoulders.right;
  const armWeight = smooth(shoulder[1], shoulder[1] + 0.07, v);
  // Joined sleeves need both masked layers to follow the same body geometry.
  const angle = pose.armAngle * rig.armMobility;
  if (armWeight > 0 && angle !== 0) {
    const dx = (u - shoulder[0]) * aspect;
    const dy = v - shoulder[1];
    base.x += ((dx * Math.cos(angle) - dy * Math.sin(angle) - dx) / aspect) * armWeight;
    base.y += (dx * Math.sin(angle) + dy * Math.cos(angle) - dy) * armWeight;
  }
  return base;
}

export function deformVertices(rest, output, pose, rig, width, height, armLayer = false) {
  const deform = armLayer ? deformArmPoint : deformPoint;
  for (let i = 0; i < rest.length; i += 2) {
    const p = deform(rest[i] / width, rest[i + 1] / height, pose, rig, width, height);
    output[i] = p.x * width;
    output[i + 1] = p.y * height;
  }
  return output;
}

/** Fit the opaque art, reserving horizontal room for small arm gestures. */
export function fitGlamModel(viewWidth, viewHeight, imageWidth, imageHeight, petMode, rig) {
  const vw = Math.max(1, Number(viewWidth) || 1);
  const vh = Math.max(1, Number(viewHeight) || 1);
  const iw = Math.max(1, Number(imageWidth) || 1);
  const ih = Math.max(1, Number(imageHeight) || 1);
  const bounds = rig.bounds;
  const pad = petMode ? 0.035 : 0.035;
  const scale = Math.min(
    (vw * (1 - pad * 2)) / (iw * (bounds.right - bounds.left + 0.075)),
    (vh * (1 - pad * 2) * (petMode ? 1 : 1.48)) / (ih * (bounds.bottom - bounds.top)),
  );
  return {
    scale,
    x: vw / 2 - ((bounds.left + bounds.right) / 2) * iw * scale,
    y: vh * pad - bounds.top * ih * scale,
  };
}

export function resolveActionFit(portraitFit, fullBodyFit, action = {}) {
  if (!portraitFit) return fullBodyFit;
  if (!fullBodyFit) return portraitFit;
  const motionId = action.motionId || action.kind || action.actionKind || "";
  if (action.fullBody) {
    const amount = Math.min(1, Math.max(0, Number(action.poseAlpha) || 0));
    return {
      scale: portraitFit.scale + (fullBodyFit.scale - portraitFit.scale) * amount,
      x: portraitFit.x + (fullBodyFit.x - portraitFit.x) * amount,
      y: portraitFit.y + (fullBodyFit.y - portraitFit.y) * amount,
    };
  }
  if (!/^crouch_/.test(motionId) && motionId !== "legacy_crouch" && motionId !== "squat") {
    return portraitFit;
  }
  const amount = Math.min(1, Math.max(0, Number(action.pose?.crouchAmount) || 0));
  if (amount === 0) return portraitFit;
  if (amount === 1) return fullBodyFit;
  return {
    scale: portraitFit.scale + (fullBodyFit.scale - portraitFit.scale) * amount,
    x: portraitFit.x + (fullBodyFit.x - portraitFit.x) * amount,
    y: portraitFit.y + (fullBodyFit.y - portraitFit.y) * amount,
  };
}
