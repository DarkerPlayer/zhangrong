import React, { useEffect, useRef, useState } from "react";
import { getSpeechLevel } from "./audio.js";
import GlamPet from "./GlamPet.jsx";
import { getLook } from "./looks.mjs";
import {
  LIVE2D_MODEL_URL,
  actionPlan,
  applyExpression,
  moodExpression,
  lipSyncIds,
  fitModel,
  smoothMouth,
  pointerFocus,
} from "./live2d-motion.mjs";

let instanceSequence = 0;

/** An entirely local Cubism rig. React owns the canvas; one private Pixi ticker owns animation. */
function HaruPet({
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
  const latest = useRef({
    mood,
    motion,
    petMode,
    onInteract,
    onReady,
    onError,
  });
  latest.current = { mood, motion, petMode, onInteract, onReady, onError };
  const [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const abort = new AbortController();
    const id = ++instanceSequence;
    let disposed = false;
    let app;
    let model;
    let loadingModel;
    let PIXI;
    let resizeObserver;
    let expressionTimer;
    let introTimer;
    let lastDelta = 1000 / 30;
    let mouth = 0;
    let actionUntil = 0;
    let actionEpoch = 0;
    let lastTelemetry = 0;
    let tickCount = 0;
    let motionCount = 0;
    let expressionCount = 0;
    const detach = [];
    const textureUrls = [];
    setStatus("loading");
    canvas.dataset.ready = "false";

    const destroyModel = (target) => {
      if (!target || target.destroyed) return;
      // Textures have instance-specific local URLs, so disposing a StrictMode mount
      // cannot invalidate a second mount's texture cache or another window's rig.
      if (target.internalModel) {
        target.destroy({ children: true, texture: true, baseTexture: true });
      } else {
        target.emit("destroy");
        target.textures?.forEach((texture) => texture.destroy(true));
        PIXI.Container.prototype.destroy.call(target, { children: true });
      }
      for (const url of textureUrls) {
        const cached = PIXI.utils.TextureCache[url];
        if (cached && !cached.destroyed) cached.destroy(true);
      }
    };

    const resize = () => {
      if (!app || !model || disposed) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      app.renderer.resize(width, height);
      const fitted = fitModel(
        width,
        height,
        model.internalModel.width,
        model.internalModel.height,
        latest.current.petMode,
      );
      model.scale.set(fitted.scale);
      model.position.set(fitted.x, fitted.y);
      app.render();
    };

    const setExpression = async (expression) => {
      if (disposed || !model) return;
      if (expression) {
        const current = model;
        const applied = await applyExpression(current, expression);
        if (applied && !disposed && model === current) {
          expressionCount++;
          canvas.dataset.expression = expression;
          canvas.dataset.expressionCount = String(expressionCount);
        }
      } else {
        model.internalModel.motionManager.expressionManager?.resetExpression();
        canvas.dataset.expression = "neutral";
      }
    };

    const perform = async (kind, notify = false) => {
      if (disposed || !model) return;
      if (notify && latest.current.onInteract) {
        // The parent responds with an action nonce. Let that one path play the
        // motion, so a pointer tap does not interrupt itself with a second play.
        latest.current.onInteract(kind);
        return;
      }
      const plan = actionPlan(kind);
      const epoch = ++actionEpoch;
      clearTimeout(introTimer);
      clearTimeout(expressionTimer);
      actionUntil = performance.now() + plan.duration;
      canvas.dataset.action = kind;
      // FORCE replaces an earlier tap; it never queues a long chain of motions.
      try {
        await model.motion(plan.group, plan.index, 3);
        if (disposed || epoch !== actionEpoch) return;
        await setExpression(plan.expression);
        if (disposed || epoch !== actionEpoch) return;
        expressionTimer = setTimeout(() => {
          setExpression(moodExpression(latest.current.mood)).catch(() => {});
        }, plan.duration);
      } catch (error) {
        if (!disposed)
          console.warn("Live2D interaction could not start", error);
      }
    };

    const visibility = () => {
      if (!app) return;
      if (document.hidden) app.stop();
      else app.start();
    };

    const load = async () => {
      try {
        if (!window.Live2DCubismCore)
          throw new Error("Cubism core is unavailable");
        // Cubism4 is imported after the local core script has been evaluated.
        const modules = await Promise.all([
          import("pixi.js"),
          import("pixi-live2d-display/cubism4"),
          fetch(LIVE2D_MODEL_URL, { signal: abort.signal }).then((response) => {
            if (!response.ok)
              throw new Error(`Model manifest: ${response.status}`);
            return response.json();
          }),
        ]);
        if (disposed) return;
        const [pixi, { Live2DModel, Live2DFactory }, manifest] = modules;
        PIXI = pixi;
        // Pixi 6 normally generates shader bindings with new Function. This
        // official compatibility package installs static bindings for strict CSP.
        const { install } = await import("@pixi/unsafe-eval");
        install(PIXI);
        if (disposed) return;
        const modelUrl = new URL(LIVE2D_MODEL_URL, window.location.href).href;
        const source = {
          ...manifest,
          url: modelUrl,
          FileReferences: { ...manifest.FileReferences },
        };
        source.FileReferences.Textures = manifest.FileReferences.Textures.map(
          (path) => {
            const url = new URL(path, modelUrl);
            url.searchParams.set("instance", String(id));
            textureUrls.push(url.href);
            return url.href;
          },
        );
        loadingModel = new Live2DModel({
          autoUpdate: false,
          autoInteract: false,
        });
        await Live2DFactory.setupLive2DModel(loadingModel, source, {
          autoUpdate: false,
          autoInteract: false,
          motionPreload: "ALL",
        });
        if (disposed) {
          destroyModel(loadingModel);
          loadingModel = null;
          return;
        }
        model = loadingModel;
        loadingModel = null;
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
        app.ticker.maxFPS = 30;
        app.ticker.minFPS = 15;
        model.anchor.set(0.5, 1);
        app.stage.addChild(model);
        const internal = model.internalModel;
        const core = internal.coreModel;
        const mouthIds = lipSyncIds(manifest);
        const lipUpdate = () => {
          mouth = smoothMouth(mouth, getSpeechLevel(), lastDelta);
          for (const parameter of mouthIds)
            core.setParameterValueById(parameter, mouth);
          if (performance.now() - lastTelemetry > 450) {
            lastTelemetry = performance.now();
            canvas.dataset.frames = String(tickCount);
            canvas.dataset.mouth = mouth.toFixed(3);
            canvas.dataset.angleX = core
              .getParameterValueById("ParamAngleX")
              .toFixed(3);
            canvas.dataset.eyeOpen = core
              .getParameterValueById("ParamEyeLOpen")
              .toFixed(3);
            canvas.dataset.breath = core
              .getParameterValueById("ParamBreath")
              .toFixed(3);
          }
        };
        const motionStarted = (group, index) => {
          motionCount++;
          canvas.dataset.motionCount = String(motionCount);
          canvas.dataset.motion = `${group}:${index}`;
        };
        internal.on("beforeModelUpdate", lipUpdate);
        internal.motionManager.on("motionStart", motionStarted);
        detach.push(() => {
          internal.off("beforeModelUpdate", lipUpdate);
          internal.motionManager.off("motionStart", motionStarted);
        });
        app.ticker.add(() => {
          if (disposed) return;
          lastDelta = Math.min(app.ticker.deltaMS, 64);
          // A paused ambient setting still permits intentional taps and lip sync.
          if (
            latest.current.motion ||
            performance.now() < actionUntil ||
            getSpeechLevel() > 0 ||
            mouth > 0
          ) {
            tickCount++;
            model.update(lastDelta);
          }
        });
        const move = (event) => {
          if (!latest.current.motion) return;
          const focus = pointerFocus(
            event.clientX,
            event.clientY,
            canvas.getBoundingClientRect(),
          );
          internal.focusController.focus(focus.x, focus.y);
        };
        const resetFocus = () => internal.focusController.focus(0, 0);
        // Follow the mouse across the app, including the conversation controls.
        window.addEventListener("pointermove", move, { passive: true });
        document.documentElement.addEventListener("pointerleave", resetFocus);
        document.addEventListener("visibilitychange", visibility);
        detach.push(() => {
          window.removeEventListener("pointermove", move);
          document.documentElement.removeEventListener(
            "pointerleave",
            resetFocus,
          );
          document.removeEventListener("visibilitychange", visibility);
        });
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        controllerRef.current = {
          perform,
          resize,
          setMood: () =>
            setExpression(moodExpression(latest.current.mood)).catch(() => {}),
          tap: (event) => {
            const rect = canvas.getBoundingClientRect();
            const x =
              ((event.clientX - rect.left) * app.screen.width) /
              Math.max(1, rect.width);
            const y =
              ((event.clientY - rect.top) * app.screen.height) /
              Math.max(1, rect.height);
            const hits = model.hitTest(x, y).map((hit) => hit.toLowerCase());
            if (hits.includes("head")) perform("pat", true);
            else if (hits.includes("body")) perform("shy", true);
          },
        };
        resize();
        model.update(1000 / 30);
        app.render();
        visibility();
        setStatus("ready");
        canvas.dataset.ready = "true";
        canvas.dataset.model = "Haru";
        canvas.dataset.physics = String(Boolean(internal.physics));
        canvas.dataset.mouthIds = mouthIds.join(",");
        canvas.dataset.modelSize = `${internal.width}x${internal.height}`;
        latest.current.onReady?.();
        setExpression(moodExpression(latest.current.mood)).catch(() => {});
        if (latest.current.motion)
          introTimer = setTimeout(() => perform("wave"), 700);
      } catch (error) {
        destroyModel(model || loadingModel);
        model = null;
        loadingModel = null;
        if (app) {
          app.destroy(false);
          app = null;
        }
        if (!disposed) {
          canvas.dataset.ready = "false";
          setStatus("error");
          latest.current.onError?.("角色暂时没有加载成功，点一下重试就好。");
          console.error("Local Live2D model failed to load", error);
        }
      }
    };
    load();
    return () => {
      disposed = true;
      abort.abort();
      controllerRef.current = null;
      clearTimeout(expressionTimer);
      clearTimeout(introTimer);
      resizeObserver?.disconnect();
      detach.forEach((remove) => remove());
      app?.stop();
      // A still-loading model is disposed by its load continuation once the
      // library finishes populating it. Never destroy half-initialized Cubism data.
      destroyModel(model);
      model = null;
      app?.destroy(false);
      app = null;
    };
  }, [retry]);

  useEffect(() => {
    if (action?.kind) controllerRef.current?.perform(action.kind);
  }, [action?.kind, action?.nonce]);
  useEffect(() => {
    controllerRef.current?.setMood();
  }, [mood]);
  useEffect(() => {
    controllerRef.current?.resize();
  }, [petMode]);

  return (
    <div
      ref={hostRef}
      className={`live-pet ${petMode ? "pet-mode" : ""}`}
      data-status={status}
    >
      <canvas
        ref={canvasRef}
        className="live-pet-canvas"
        aria-label="张容 Live2D 角色，轻点摸摸头，按回车与她互动"
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
          <span className="live-pet-loader" aria-hidden="true">
            ✦
          </span>
          <span>张容正在过来…</span>
        </div>
      )}
      {status === "error" && (
        <div className="live-pet-error" role="alert">
          <span>还差一点点，就能见面了。</span>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            重新加载角色
          </button>
        </div>
      )}
    </div>
  );
}

export default function LivePet(props) {
  const look = getLook(props.lookId);
  return look.renderer === "glam" || look.id !== "haru-original"
    ? <GlamPet {...props} lookId={look.id} />
    : <HaruPet {...props} />;
}
