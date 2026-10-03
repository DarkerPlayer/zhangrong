import React, { useEffect, useRef, useState } from "react";
import { portraitMouth } from "./portrait-mouth.mjs";
import { getSpeechLevel } from "./audio.js";
import { getLook } from "./looks.mjs";
import { createGlamActionResources } from "./glam-action-resources.mjs";
import { pointerFocus } from "./live2d-motion.mjs";
import { MotionController } from "./motion/MotionController.mjs";
import { MotionScheduler } from "./motion/MotionScheduler.mjs";
import { createMotionManifest } from "./motion/MotionManifest.mjs";
import { MOTION_PRIORITIES, MOTION_STATES } from "./motion/constants.mjs";
import {
  GlamMotionAdapter,
  advanceRootMovement,
  frameCompositeWeights,
  locomotionEnvelope,
  resolveActionPoseAlpha,
  resolveLocomotionSpeed,
} from "./motion/adapters/GlamMotionAdapter.mjs";
import {
  createGlamActionQueue,
  resolveArmSeparation,
  normalizeRig,
  glamPose,
  deformVertices,
  fitGlamModel,
  remapFaceFeature,
  resolveFaceStabilizer,
  resolveActionFit,
} from "./glam-motion.mjs";
import "./glam-pet.css";

const vertexShader = `
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
uniform mat3 uTextureMatrix;
varying vec2 vTextureCoord;
void main(void) {
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
  vTextureCoord = (uTextureMatrix * vec3(aTextureCoord, 1.0)).xy;
}`;

// Facial details are shaded in source UV space, so blinking, lips and cheeks
// follow the same deformed head vertices rather than floating above the canvas.
const fragmentShader = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 uColor;
uniform vec4 uEyeL;
uniform vec4 uEyeR;
uniform vec3 uEyeSkinL;
uniform vec3 uEyeSkinR;
uniform vec3 uLidL;
uniform vec3 uLidR;
uniform vec4 uMouth;
uniform float uBlink;
uniform float uMouthOpen;
uniform float uSmile;
uniform float uBlush;
uniform float uArmLayer;
uniform float uUseArmMask;
uniform sampler2D uArmBoundary;
uniform sampler2D uBaseSampler;
uniform sampler2D uNextSampler;
uniform vec2 uBaseUvOffset;
uniform float uBaseWeight;
uniform float uCurrentWeight;
uniform float uNextWeight;
uniform float uStabilizeFace;
uniform vec4 uHead;
uniform vec4 uActionHead;

float oval(vec2 point, vec2 center, vec2 radius, float feather) {
  float distance = length((point - center) / radius);
  return 1.0 - smoothstep(1.0 - feather, 1.0 + feather, distance);
}

vec4 portraitSample(vec2 uv) {
  // Authored gestures move the action mesh to its ground anchor. Compensate
  // only the resting layer so entry/exit fades keep it in its original place.
  vec2 baseUV = uv + uBaseUvOffset;
  vec4 base = texture2D(uBaseSampler, baseUV);
  if (any(notEqual(uBaseUvOffset, vec2(0.0))) &&
      (baseUV.x < 0.0 || baseUV.x > 1.0 || baseUV.y < 0.0 || baseUV.y > 1.0)) {
    base = vec4(0.0);
  }
  vec4 source = base * uBaseWeight +
    texture2D(uSampler, uv) * uCurrentWeight +
    texture2D(uNextSampler, uv) * uNextWeight;
  vec2 canonicalUV = uHead.xy + (uv - uActionHead.xy) * (uHead.zw / uActionHead.zw);
  // Canonical facial replacement remains in its original source coordinates;
  // authored-expression gestures disable that replacement entirely.
  vec4 canonical = texture2D(uBaseSampler, canonicalUV);
  float stableFace = oval(uv, uActionHead.xy, uActionHead.zw * vec2(0.62, 0.80), 0.22) * uStabilizeFace;
  return mix(source, canonical, stableFace);
}

vec3 eye(vec3 source, vec4 shape, vec3 skin, vec3 lid) {
  vec2 q = (vTextureCoord - shape.xy) / shape.zw;
  float cover = oval(vTextureCoord, shape.xy, shape.zw * vec2(1.12, 1.43), 0.16);
  // The eyebrow sits just above the eye. Borrow clean under-eye skin instead
  // of stretching that eyebrow into a second dark line across the eyelid.
  vec3 lowerSkin = portraitSample(vec2(vTextureCoord.x, shape.y + shape.w * 2.2)).rgb;
  vec3 upperSkin = lowerSkin * vec3(0.87, 0.80, 0.78);
  vec3 eyelid = mix(upperSkin, lowerSkin * 0.96, smoothstep(-1.0, 1.0, q.y));
  // Fade the complete eye into its shaded lid, avoiding a moving rectangular
  // slice that leaves the original upper lash visible as a doubled outline.
  vec3 result = mix(source, eyelid, cover * smoothstep(0.03, 0.77, uBlink));
  float arc = 0.12 + 0.20 * (1.0 - q.x * q.x);
  float lash = (1.0 - smoothstep(0.08, 0.19, abs(q.y - arc))) *
    (1.0 - smoothstep(0.83, 1.03, abs(q.x))) * smoothstep(0.18, 0.85, uBlink);
  return mix(result, lid, lash * 0.96);
}

void main(void) {
  // Preserve the photographed lip contour, shading and teeth. Only warp its
  // original pixels; do not erase the mouth or paint a generic oval over it.
  vec2 mouthUV = vTextureCoord;
  vec2 q = (mouthUV - uMouth.xy) / uMouth.zw;
  float support = 1.0 - smoothstep(0.65, 1.65, length(q / vec2(1.3, 2.0)));
  float corners = 1.0 - smoothstep(0.45, 1.3, abs(q.x));
  float opening = clamp(uMouthOpen, 0.0, 0.7) * support * corners;
  q.x /= 1.0 - opening * 0.025;
  q.y = (q.y - opening * 0.12) / (1.0 + opening * 0.42);
  if (opening > 0.0001) mouthUV = uMouth.xy + q * uMouth.zw;
  vec4 source = portraitSample(mouthUV);
  vec3 result = source.rgb;
  if (uBlink > 0.001) {
    result = eye(result, uEyeL, uEyeSkinL, uLidL);
    result = eye(result, uEyeR, uEyeSkinR, uLidR);
  }
  if (uBlush + uSmile > 0.001) {
    vec2 offset = vec2(uMouth.z * 2.2, -uMouth.w * 1.1);
    float cheeks = oval(vTextureCoord, uMouth.xy + offset, uMouth.zw * vec2(1.0, 0.78), 0.6) +
      oval(vTextureCoord, uMouth.xy + vec2(-offset.x, offset.y), uMouth.zw * vec2(1.0, 0.78), 0.6);
    result = mix(result, vec3(0.89, 0.39, 0.45), cheeks * (uBlush * 0.2 + uSmile * 0.025));
  }
  vec4 armRow = texture2D(uArmBoundary, vec2(0.5, vTextureCoord.y));
  float boundary = dot(armRow.rg, vec2(256.0 / 257.0, 1.0 / 257.0));
  float arm = step(boundary, vTextureCoord.x) * armRow.b;
  float splitLayer = uArmLayer > 0.5 ? arm : 1.0 - arm;
  float layer = mix(1.0, splitLayer, uUseArmMask);
  gl_FragColor = vec4(result, source.a) * uColor * layer;
}`;

const shape = (feature) => new Float32Array([feature.x, feature.y, feature.rx, feature.ry]);
const rgb = (value) => new Float32Array(value);

/** Original local artwork animated with a weighted mesh and a UV facial shader. */
export default function GlamPet({
  lookId,
  appearance,
  mood = "idle",
  action = null,
  motion = true,
  petMode = false,
  onInteract,
  onReady,
  onError,
}) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const controllerRef = useRef(null);
  const actionQueue = useRef(null);
  if (!actionQueue.current) actionQueue.current = createGlamActionQueue();
  const latest = useRef({});
  latest.current = { mood, motion, petMode, onInteract, onReady, onError };
  const [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);
  const look = appearance?.id === lookId ? appearance : getLook(lookId);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const abort = new AbortController();
    let disposed = false;
    let app;
    let mesh;
    let armMesh;
    let actionMeshes = [];
    let actionMaterials = [];
    let motionController;
    let idleScheduler;
    let glamAdapter;
    let fitted;
    let fullBodyFitted;
    let rootMovement = { offset: 0, direction: 1 };
    let wasMoving = false;
    let texture;
    let armBoundaryTexture;
    let actionResources;
    let actionRequest = 0;
    let image;
    let imageUrl;
    let observer;
    let rig;
    let imageWidth;
    let imageHeight;
    let rest;
    let ambientTime = 0;
    let frames = 0;
    let telemetryFrames = 0;
    let lastTelemetry = 0;
    let mouth = 0;
    let stabilizedActionKind;
    let gaze = { x: 0, y: 0 };
    let gazeTarget = { x: 0, y: 0 };
    const detach = [];
    setStatus("loading");
    canvas.dataset.ready = "false";
    canvas.dataset.look = look.id;
    canvas.dataset.renderer = "glam-mesh";
    canvas.dataset.frames = "0";

    const disposeGraphics = () => {
      app?.stop();
      actionResources?.destroy();
      actionResources = null;
      if (app) {
        app.destroy(false, { children: true });
        app = null;
      } else mesh?.destroy();
      mesh = null;
      armMesh = null;
      actionMeshes = [];
      actionMaterials = [];
      texture?.destroy(true);
      texture = null;
      armBoundaryTexture?.destroy(true);
      armBoundaryTexture = null;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = null;
      image = null;
    };

    const applyDisplayTransform = () => {
      if (!fitted) return;
      const facing = motionController?.getMotionState().facing || "right";
      const mirrored = facing === "left";
      for (const display of [mesh, armMesh]) {
        if (!display) continue;
        display.scale.set(mirrored ? -fitted.scale : fitted.scale, fitted.scale);
        display.position.set(
          fitted.x + rootMovement.offset + (mirrored ? imageWidth * fitted.scale : 0),
          fitted.y,
        );
      }
      const visibleAction = glamAdapter?.getSample();
      const actionFit = resolveActionFit(fitted, fullBodyFitted, visibleAction);
      const anchorOffset = visibleAction?.frame?.anchorOffset || { x: 0, y: 0 };
      for (const display of actionMeshes) {
        display.scale.set(mirrored ? -actionFit.scale : actionFit.scale, actionFit.scale);
        display.position.set(
          actionFit.x + rootMovement.offset + (mirrored ? imageWidth * actionFit.scale : 0) + anchorOffset.x * imageWidth * actionFit.scale,
          actionFit.y + anchorOffset.y * imageHeight * actionFit.scale,
        );
      }
    };

    const resize = () => {
      if (disposed || !app || !mesh) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      app.renderer.resize(width, height);
      fitted = fitGlamModel(width, height, imageWidth, imageHeight, latest.current.petMode, rig);
      fullBodyFitted = fitGlamModel(width, height, imageWidth, imageHeight, true, rig);
      applyDisplayTransform();
      canvas.dataset.framing = latest.current.petMode ? "full-body" : "portrait";
      app.render();
    };

    const startAction = (kind, options = {}) => {
      if (disposed || !mesh || !motionController) return;
      const explicit = MOTION_PRIORITIES.EXPLICIT;
      if (Number.isFinite(options.playbackRate)) motionController.setLocomotionSpeed(options.playbackRate);
      let result;
      if (kind === "idle" || kind === "idle_neutral") {
        motionController.stopAllMotions();
        result = motionController.playMotion("idle_neutral");
      } else if (kind === "spit") {
        // This authored gesture always plays once; duration/repeat overrides
        // must not turn the release into an ongoing animation.
        motionController.stopAllMotions();
        motionController.setLocomotionSpeed(1);
        result = motionController.playMotion("spit", { priority: explicit });
      } else if (kind === "squat") {
        motionController.stopAllMotions();
        result = motionController.playMotion("crouch_enter", { priority: explicit });
        if (result.accepted) {
          motionController.queueMotion("crouch_idle", { priority: explicit, durationMs: 1900 });
          motionController.queueMotion("crouch_exit", { priority: explicit });
        }
      } else if (kind === "sexyWalk") {
        result = motionController.playMotion("walk_feminine", {
          ...options,
          priority: explicit,
          durationMs: options.debugHold ? undefined : (options.duration || 4400),
          direction: options.direction,
        });
      } else if (kind === "walk_confident") {
        result = motionController.playMotion(kind, {
          ...options,
          priority: explicit,
          durationMs: options.debugHold ? undefined : (options.duration || 4800),
          direction: options.direction,
        });
      } else if (/^walk_/.test(kind)) {
        result = motionController.playMotion(kind, {
          ...options,
          priority: explicit,
          durationMs: options.debugHold ? undefined : (options.duration || 4200),
          direction: options.direction,
        });
      } else if (kind === "crouch_enter" || kind === "crouch_exit") {
        result = motionController.playMotion(kind, { priority: explicit });
      } else {
        result = motionController.playMotion(kind || "idle_neutral", {
          ...options,
          priority: kind === "pat" ? MOTION_PRIORITIES.USER_INTERACTION : undefined,
        });
      }
      if (result?.accepted) {
        canvas.dataset.action = result.motionId;
        canvas.dataset.motionCount = String(Number(canvas.dataset.motionCount || 0) + 1);
      }
      actionResources?.setActive(document.hidden ? null : glamAdapter?.getSample().actionKind);
    };

    const perform = (kind, notify = false, options = {}) => {
      if (disposed || !mesh || !motionController) return;
      if (notify && latest.current.onInteract) {
        latest.current.onInteract(kind);
        return;
      }
      const request = ++actionRequest;
      const canonical = motionController.aliases[kind] || kind;
      const group = motionController.motions[canonical]?.assets;
      if (!group) {
        canvas.dataset.actionLoading = "";
        actionResources?.cancelPending();
        startAction(kind, options);
        return;
      }
      if (actionResources.get(group)) {
        startAction(kind, options);
        return;
      }
      // Keep the resting portrait visible until every frame is ready. Only the
      // latest explicit request may start a motion after asynchronous decoding.
      canvas.dataset.actionLoading = group;
      void actionResources.load(group).then((loaded) => {
        if (disposed || request !== actionRequest || !loaded.length) return;
        glamAdapter.availableActions[group] = loaded.length;
        canvas.dataset.actionLoading = "";
        startAction(kind, options);
      }).catch((error) => {
        if (disposed || request !== actionRequest) return;
        canvas.dataset.actionLoading = "";
        if (error?.name !== "AbortError") {
          console.warn(`Could not load ${group} pose for ${look.id}`, error);
          latest.current.onError?.("动作暂时没有加载成功，再点一次就好。");
        }
      });
    };

    const visibility = () => {
      if (!app) return;
      actionResources?.setActive(document.hidden ? null : glamAdapter?.getSample().actionKind);
      if (document.hidden) app.stop();
      else app.start();
    };

    const load = async () => {
      try {
        const [PIXI, compatibility, imageResponse, rigResponse] = await Promise.all([
          import("pixi.js"),
          import("@pixi/unsafe-eval"),
          fetch(look.asset || `/looks/${look.id}/character.png`, { signal: abort.signal }),
          fetch(look.rig || `/looks/${look.id}/rig.json`, { signal: abort.signal }),
        ]);
        if (disposed) return;
        if (!imageResponse.ok) throw new Error(`Artwork ${look.id}: HTTP ${imageResponse.status}`);
        if (!rigResponse.ok) throw new Error(`Face profile ${look.id}: HTTP ${rigResponse.status}`);
        const [blob, rigData] = await Promise.all([imageResponse.blob(), rigResponse.json()]);
        if (disposed) return;
        rig = normalizeRig(rigData);
        canvas.dataset.artwork = look.asset;
        // Instance-owned decoded images avoid cache collisions during StrictMode
        // remounts, outfit switches and simultaneous main/pet windows.
        imageUrl = URL.createObjectURL(blob);
        image = new Image();
        image.src = imageUrl;
        await image.decode();
        if (disposed) {
          disposeGraphics();
          return;
        }
        compatibility.install(PIXI);
        imageWidth = image.naturalWidth;
        imageHeight = image.naturalHeight;
        if (!imageWidth || !imageHeight) throw new Error(`Artwork ${look.id} has no drawable pixels`);
        texture = PIXI.Texture.from(image);
        texture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
        actionResources = createGlamActionResources({
          actions: look.actions,
          loadFrame: async (source, signal) => {
            const assetSource = typeof source === "string" ? source : source.src;
            const response = await fetch(assetSource, { signal });
            if (!response.ok) throw new Error(`Action artwork ${assetSource}: HTTP ${response.status}`);
            const frameBlob = await response.blob();
            signal.throwIfAborted();
            const url = URL.createObjectURL(frameBlob);
            const frameImage = new Image();
            const cancelImage = () => { frameImage.src = ""; URL.revokeObjectURL(url); };
            signal.addEventListener("abort", cancelImage, { once: true });
            try {
              frameImage.src = url;
              await frameImage.decode();
              signal.throwIfAborted();
              const frameTexture = PIXI.Texture.from(frameImage);
              frameTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
              return frameTexture;
            } finally {
              signal.removeEventListener("abort", cancelImage);
              URL.revokeObjectURL(url);
            }
          },
          releaseFrame: (frame) => frame.destroy(true),
          onRelease: (kind) => {
            if (glamAdapter) glamAdapter.availableActions[kind] = 0;
            if (glamAdapter?.getSample().actionKind === kind) {
              motionController?.stopAllMotions();
              if (!disposed) motionController?.playMotion("idle_neutral");
            }
            for (const actionMesh of actionMeshes) {
              actionMesh.texture = texture;
              actionMesh.alpha = 0;
              actionMesh.material.uniforms.uNextSampler = texture;
            }
            if (mesh) mesh.alpha = 1;
            if (armMesh) armMesh.alpha = 1;
          },
        });
        const matteCanvas = document.createElement("canvas");
        matteCanvas.width = imageWidth;
        matteCanvas.height = imageHeight;
        const matteContext = matteCanvas.getContext("2d", { willReadFrequently: true });
        matteContext.drawImage(image, 0, 0);
        const pixels = matteContext.getImageData(0, 0, imageWidth, imageHeight).data;
        const armSeparation = resolveArmSeparation(pixels, imageWidth, imageHeight, rig);
        rig = { ...rig, armMobility: armSeparation.armMobility };
        canvas.dataset.armLayerMode = armSeparation.separated ? "separated-arm" : "joined-body";
        armBoundaryTexture = PIXI.Texture.fromBuffer(armSeparation.rows, 1, imageHeight);
        // Encoded coordinates and row ownership are discrete, so interpolation
        // must not turn transparent gaps into cuts through source pixels.
        armBoundaryTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        matteCanvas.width = matteCanvas.height = 1;
        app = new PIXI.Application({
          view: canvas,
          width: Math.max(1, host.clientWidth),
          height: Math.max(1, host.clientHeight),
          autoStart: false,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          powerPreference: "low-power",
          sharedTicker: false,
        });
        const material = new PIXI.MeshMaterial(texture, {
          program: PIXI.Program.from(vertexShader, fragmentShader),
          uniforms: {
            uEyeL: shape(rig.eyes[0]),
            uEyeR: shape(rig.eyes[1]),
            uEyeSkinL: rgb(rig.eyes[0].skin),
            uEyeSkinR: rgb(rig.eyes[1].skin),
            uLidL: rgb(rig.eyes[0].lid),
            uLidR: rgb(rig.eyes[1].lid),
            uMouth: shape(rig.mouth),
            uBlink: 0,
            uMouthOpen: 0,
            uSmile: 0,
            uBlush: 0,
            uArmLayer: 0,
            uUseArmMask: armSeparation.separated ? 1 : 0,
            uArmBoundary: armBoundaryTexture,
            uBaseSampler: texture,
            uNextSampler: texture,
            uBaseUvOffset: new Float32Array(2),
            uBaseWeight: 0,
            uCurrentWeight: 1,
            uNextWeight: 0,
            uStabilizeFace: 0,
            uHead: new Float32Array([rig.head.x, rig.head.y, rig.head.radiusX, rig.head.radiusY]),
            uActionHead: new Float32Array([rig.head.x, rig.head.y, rig.head.radiusX, rig.head.radiusY]),
          },
        });
        const geometry = new PIXI.PlaneGeometry(imageWidth, imageHeight, 33, 65);
        mesh = new PIXI.Mesh(geometry, material);
        const armMaterial = new PIXI.MeshMaterial(texture, {
          program: material.program,
          uniforms: { ...material.uniforms, uArmLayer: 1 },
        });
        armMesh = new PIXI.Mesh(new PIXI.PlaneGeometry(imageWidth, imageHeight, 33, 65), armMaterial);
        armMesh.visible = armSeparation.separated;
        rest = new Float32Array(geometry.getBuffer("aVertexPosition").data);
        app.stage.addChild(mesh, armMesh);
        if (Object.values(look.actions || {}).some((frames) => frames.length)) {
          for (let index = 0; index < 1; index++) {
            const actionMaterial = new PIXI.MeshMaterial(texture, {
              program: material.program,
              uniforms: {
                ...material.uniforms,
                uArmLayer: 0,
                uUseArmMask: 0,
                uBaseSampler: texture,
                uNextSampler: texture,
                uBaseUvOffset: new Float32Array(2),
                uBaseWeight: 0,
                uCurrentWeight: 1,
                uNextWeight: 0,
                uStabilizeFace: 0,
                uActionHead: new Float32Array([rig.head.x, rig.head.y, rig.head.radiusX, rig.head.radiusY]),
                uEyeL: shape(rig.eyes[0]),
                uEyeR: shape(rig.eyes[1]),
                uMouth: shape(rig.mouth),
              },
            });
            const actionMesh = new PIXI.Mesh(new PIXI.PlaneGeometry(imageWidth, imageHeight, 33, 65), actionMaterial);
            actionMesh.alpha = 0;
            actionMaterials.push(actionMaterial);
            actionMeshes.push(actionMesh);
            app.stage.addChild(actionMesh);
          }
        }
        const manifest = createMotionManifest(look);
        glamAdapter = new GlamMotionAdapter({
          manifest,
          availableActions: {},
        });
        motionController = new MotionController({
          motions: manifest.motions,
          adapter: glamAdapter,
          onEvent: ({ event }) => { canvas.dataset.motionEvent = event; },
        });
        idleScheduler = new MotionScheduler();
        motionController.playMotion("idle_neutral");
        app.ticker.maxFPS = 60;
        app.ticker.minFPS = 15;
        app.ticker.add(() => {
          if (disposed || !mesh) return;
          const dt = Math.min(app.ticker.deltaMS, 64);
          if (latest.current.motion) ambientTime += dt;
          motionController.update(dt);
          let motionState = motionController.getMotionState();
          if (latest.current.motion) {
            const idleVariation = idleScheduler.update(dt, motionState, (id) => motionController.canPlayMotion(id));
            if (idleVariation) motionController.playMotion(idleVariation);
            else if (!motionState.motionId) motionController.playMotion("idle_neutral");
            motionState = motionController.getMotionState();
          }
          const moving = motionState.state === MOTION_STATES.MOVE;
          if (moving && !wasMoving) {
            rootMovement.direction = motionState.facing === "left" ? -1 : 1;
          }
          if (moving) {
            const previousDirection = rootMovement.direction;
            const locomotion = manifest.motions[motionState.motionId] || {};
            const speed = resolveLocomotionSpeed(locomotion) * locomotionEnvelope(motionState, locomotion);
            rootMovement = advanceRootMovement(
              rootMovement,
              dt * motionState.speed,
              speed,
              Math.max(12, host.clientWidth * 0.14),
            );
            if (rootMovement.direction !== previousDirection) {
              motionController.setFacing(rootMovement.direction < 0 ? "left" : "right");
            }
          }
          wasMoving = moving;
          applyDisplayTransform();
          const visibleAction = glamAdapter.getSample();
          const actionFrames = visibleAction.frame ? actionResources.get(visibleAction.actionKind) : null;
          actionResources.setActive(actionFrames?.length ? visibleAction.actionKind : null);
          const poseAlpha = resolveActionPoseAlpha(visibleAction, motionState, Boolean(actionFrames?.length));
          if (actionMeshes.length) {
            const anchorOffset = visibleAction.preserveExpression ? visibleAction.frame?.anchorOffset : null;
            for (const actionMaterial of actionMaterials) {
              actionMaterial.uniforms.uBaseUvOffset.set([
                anchorOffset?.x ? (visibleAction.facing === "left" ? -anchorOffset.x : anchorOffset.x) : 0,
                anchorOffset?.y || 0,
              ]);
            }
            if (stabilizedActionKind !== visibleAction.actionKind) {
              const stabilizer = resolveFaceStabilizer(rig, visibleAction.actionKind);
              const targetHead = rig.actionFaces?.[visibleAction.actionKind] || rig.head;
              const mappedEyes = rig.eyes.map((eye) => remapFaceFeature(eye, rig.head, targetHead));
              const mappedMouth = remapFaceFeature(rig.mouth, rig.head, targetHead);
              for (const actionMaterial of actionMaterials) {
                actionMaterial.uniforms.uStabilizeFace = visibleAction.preserveExpression ? 0 : stabilizer.enabled;
                actionMaterial.uniforms.uActionHead.set(stabilizer.target);
                actionMaterial.uniforms.uEyeL.set(shape(mappedEyes[0]));
                actionMaterial.uniforms.uEyeR.set(shape(mappedEyes[1]));
                actionMaterial.uniforms.uMouth.set(shape(mappedMouth));
              }
              stabilizedActionKind = visibleAction.actionKind;
            }
            if (actionFrames?.length) {
              const first = actionFrames[visibleAction.frame.index] || actionFrames[0];
              const second = actionFrames[visibleAction.frame.nextIndex] || first;
              if (actionMeshes[0].texture !== first) actionMeshes[0].texture = first;
              const weights = frameCompositeWeights(visibleAction.frame.blend, poseAlpha);
              actionMaterials[0].uniforms.uNextSampler = second;
              actionMaterials[0].uniforms.uBaseWeight = weights.base;
              actionMaterials[0].uniforms.uCurrentWeight = weights.current;
              actionMaterials[0].uniforms.uNextWeight = weights.next;
              actionMeshes[0].alpha = 1;
              mesh.alpha = 0;
              armMesh.alpha = 0;
            } else {
              actionMeshes[0].alpha = 0;
              mesh.alpha = 1;
              armMesh.alpha = 1;
            }
          }
          const follow = 1 - Math.exp(-dt / 230);
          gaze.x += (gazeTarget.x - gaze.x) * follow;
          gaze.y += (gazeTarget.y - gaze.y) * follow;
          mouth = portraitMouth(mouth, getSpeechLevel(), dt);
          const pose = glamPose({
            time: ambientTime,
            motion: latest.current.motion,
            mood: latest.current.mood,
            gaze,
            action: visibleAction,
          });
          const buffer = mesh.geometry.getBuffer("aVertexPosition");
          deformVertices(rest, buffer.data, pose, rig, imageWidth, imageHeight);
          buffer.update();
          const armBuffer = armMesh.geometry.getBuffer("aVertexPosition");
          deformVertices(rest, armBuffer.data, pose, rig, imageWidth, imageHeight, true);
          armBuffer.update();
          for (const actionMesh of actionMeshes) {
            const actionBuffer = actionMesh.geometry.getBuffer("aVertexPosition");
            const actionPose = visibleAction.preserveExpression ? glamPose({ motion: false }) : pose;
            deformVertices(rest, actionBuffer.data, actionPose, rig, imageWidth, imageHeight);
            actionBuffer.update();
          }
          for (const targetMaterial of [material, armMaterial, ...actionMaterials]) {
            const authored = visibleAction.preserveExpression && actionMaterials.includes(targetMaterial);
            targetMaterial.uniforms.uBlink = authored ? 0 : pose.blink;
            targetMaterial.uniforms.uMouthOpen = authored ? 0 : mouth;
            targetMaterial.uniforms.uSmile = authored ? 0 : pose.smile;
            targetMaterial.uniforms.uBlush = authored ? 0 : pose.blush;
          }
          frames++;
          canvas.dataset.blink = pose.blink.toFixed(3);
          canvas.dataset.mouth = mouth.toFixed(3);
          const telemetryNow = performance.now();
          if (telemetryNow - lastTelemetry > 180) {
            const telemetryElapsed = telemetryNow - lastTelemetry;
            lastTelemetry = telemetryNow;
            canvas.dataset.frames = String(frames);
            canvas.dataset.headAngle = pose.headAngle.toFixed(3);
            canvas.dataset.angleX = (pose.headTurn * 1000).toFixed(3);
            canvas.dataset.eyeOpen = (1 - pose.blink).toFixed(3);
            canvas.dataset.breath = pose.breath.toFixed(3);
            canvas.dataset.armAngle = (pose.armAngle * rig.armMobility).toFixed(3);
            canvas.dataset.action = motionState.motionId || "idle_neutral";
            canvas.dataset.motionState = motionState.state;
            canvas.dataset.motionPriority = String(motionState.priority);
            canvas.dataset.motionQueue = motionState.queue.join(",");
            canvas.dataset.facing = motionState.facing;
            canvas.dataset.motionTime = String(Math.round(motionState.totalElapsedMs));
            canvas.dataset.motionSpeed = String(motionState.speed);
            const debugFrame = visibleAction.frame;
            canvas.dataset.motionFrame = debugFrame ? String(debugFrame.index + 1) : "0";
            canvas.dataset.frameCount = String(actionFrames?.length || 0);
            canvas.dataset.frameDuration = debugFrame ? String(debugFrame.frameDurationMs || 0) : "0";
            canvas.dataset.framePhase = debugFrame?.phase || "—";
            canvas.dataset.footContact = debugFrame?.contact || "none";
            canvas.dataset.groundAnchor = debugFrame?.groundAnchor
              ? debugFrame.groundAnchor.map((value) => Number(value).toFixed(3)).join(", ")
              : "—";
            canvas.dataset.safeExit = motionState.safeExitPending ? "waiting-contact" : "ready";
            if (debugFrame?.groundAnchor && actionMeshes[0] && fitted) {
              const mirrored = motionState.facing === "left";
              const [anchorX, anchorY] = debugFrame.groundAnchor;
              canvas.dataset.groundScreenX = String(Math.round(
                actionMeshes[0].position.x + (mirrored ? -anchorX : anchorX) * imageWidth * fitted.scale,
              ));
              canvas.dataset.groundScreenY = String(Math.round(
                actionMeshes[0].position.y + anchorY * imageHeight * fitted.scale,
              ));
            }
            canvas.dataset.fps = String(Math.round((frames - telemetryFrames) * 1000 / Math.max(1, telemetryElapsed)));
            telemetryFrames = frames;
          }
        });
        const move = (event) => {
          gazeTarget = pointerFocus(event.clientX, event.clientY, canvas.getBoundingClientRect());
        };
        const resetFocus = () => { gazeTarget = { x: 0, y: 0 }; };
        window.addEventListener("pointermove", move, { passive: true });
        document.documentElement.addEventListener("pointerleave", resetFocus);
        document.addEventListener("visibilitychange", visibility);
        detach.push(() => {
          window.removeEventListener("pointermove", move);
          document.documentElement.removeEventListener("pointerleave", resetFocus);
          document.removeEventListener("visibilitychange", visibility);
        });
        observer = new ResizeObserver(resize);
        observer.observe(host);
        controllerRef.current = {
          perform,
          resize,
          tap: (event) => {
            if (!mesh) return;
            const rect = canvas.getBoundingClientRect();
            const x = ((event.clientX - rect.left) * app.screen.width) / Math.max(1, rect.width);
            const y = ((event.clientY - rect.top) * app.screen.height) / Math.max(1, rect.height);
            const u = (x - mesh.x) / (mesh.scale.x * imageWidth);
            const v = (y - mesh.y) / (mesh.scale.y * imageHeight);
            if (v >= rig.bounds.top && v < rig.head.neckY + 0.04 && Math.abs(u - rig.head.x) < rig.head.radiusX * 1.5) {
              perform("pat", true);
            } else if (u >= rig.bounds.left && u <= rig.bounds.right && v >= rig.bounds.top && v < rig.bounds.bottom) {
              perform("shy", true);
            }
          },
        };
        actionQueue.current.connect(perform);
        resize();
        app.render();
        visibility();
        setStatus("ready");
        canvas.dataset.ready = "true";
        canvas.dataset.model = look.character;
        canvas.dataset.modelSize = `${imageWidth}x${imageHeight}`;
        canvas.dataset.vertices = String(rest.length / 2);
        canvas.dataset.physics = "weighted-mesh";
        latest.current.onReady?.();
      } catch (error) {
        observer?.disconnect();
        detach.splice(0).forEach((remove) => remove());
        disposeGraphics();
        if (!disposed && error?.name !== "AbortError") {
          canvas.dataset.ready = "false";
          setStatus("error");
          latest.current.onError?.("角色暂时没有加载成功，点一下重试就好。");
          console.error(`Original character renderer failed (${look.id})`, error);
        }
      }
    };
    load();
    return () => {
      disposed = true;
      abort.abort();
      motionController?.destroy();
      motionController = null;
      controllerRef.current = null;
      actionQueue.current.disconnect();
      observer?.disconnect();
      detach.splice(0).forEach((remove) => remove());
      disposeGraphics();
    };
  }, [look.id, look.asset, look.rig, retry]);

  useEffect(() => {
    if (action?.kind) actionQueue.current.send(action.kind, action.args);
  }, [action?.kind, action?.nonce]);
  useEffect(() => { controllerRef.current?.resize(); }, [petMode]);

  return (
    <div ref={hostRef} className={`live-pet glam-pet ${petMode ? "pet-mode" : ""}`} data-status={status} data-look={look.id}>
      <canvas
        key={`${look.id}:${look.asset}:${look.rig}:${retry}`}
        ref={canvasRef}
        className="live-pet-canvas glam-pet-canvas"
        aria-label={`${look.character}原创动态立绘，轻点摸摸头，按回车与她互动`}
        role="button"
        tabIndex={status === "ready" ? 0 : -1}
        onClick={(event) => controllerRef.current?.tap(event)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            controllerRef.current?.perform("pat", true);
          }
        }}
      />
      {status === "loading" && (
        <div className="live-pet-loading" role="status">
          <span className="live-pet-loader" aria-hidden="true">✦</span>
          <span>{look.character}正在过来…</span>
        </div>
      )}
      {status === "error" && (
        <div className="live-pet-error" role="alert">
          <span>还差一点点，就能见面了。</span>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>重新加载角色</button>
        </div>
      )}
    </div>
  );
}
