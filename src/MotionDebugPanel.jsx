import React, { useEffect, useMemo, useRef, useState } from "react";

const MOTIONS = Object.freeze([
  { id: "idle_neutral", label: "基础待机", group: "Idle", duration: 5000 },
  { id: "idle_weight_shift", label: "变换重心", group: "Idle", duration: 4200 },
  { id: "idle_hair_touch", label: "整理头发", group: "Idle", duration: 3600 },
  { id: "walk_feminine", label: "轻盈走路", group: "Walk", duration: 10000 },
  { id: "walk_confident", label: "自信走路", group: "Walk", duration: 10000 },
  { id: "crouch_enter", label: "自然蹲下", group: "Crouch", duration: 650 },
  { id: "crouch_exit", label: "慢慢起身", group: "Crouch", duration: 700 },
  { id: "look_back", label: "回头看看", group: "Gesture", duration: 2600 },
]);

const EMPTY = Object.freeze({
  model: "等待角色", action: "—", motionState: "—", motionTime: "0",
  motionPriority: "0", motionQueue: "", motionEvent: "—", facing: "right", motionSpeed: "1", fps: "0",
  motionFrame: "0", frameCount: "0", frameDuration: "0", framePhase: "—",
  footContact: "none", groundAnchor: "—", safeExit: "ready", groundScreenX: "50", groundScreenY: "90",
});

export default function MotionDebugPanel({ onPlay }) {
  const [telemetry, setTelemetry] = useState(EMPTY);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(true);
  const [direction, setDirection] = useState("right");
  const currentIndex = Math.max(0, MOTIONS.findIndex(({ id }) => id === telemetry.action));
  const previousFrame = useRef({ frames: 0, time: performance.now(), fps: 0 });
  const grouped = useMemo(() => Object.groupBy
    ? Object.groupBy(MOTIONS, ({ group }) => group)
    : MOTIONS.reduce((result, motion) => ({ ...result, [motion.group]: [...(result[motion.group] || []), motion] }), {}), []);

  useEffect(() => {
    const sample = () => {
      const canvas = document.querySelector("canvas[data-renderer]");
      if (!canvas) return;
      const now = performance.now();
      const frames = Number(canvas.dataset.frames) || 0;
      const elapsed = now - previousFrame.current.time;
      let fps = previousFrame.current.fps;
      if (elapsed >= 450) {
        fps = Math.max(0, Math.round((frames - previousFrame.current.frames) * 1000 / elapsed));
        previousFrame.current = { frames, time: now, fps };
      }
      setTelemetry({ ...EMPTY, ...canvas.dataset, fps: String(fps) });
    };
    sample();
    const timer = setInterval(sample, 160);
    return () => clearInterval(timer);
  }, []);

  const play = (motion) => {
    const duration = loop && /^walk_/.test(motion.id) ? 10000 : motion.duration;
    onPlay(motion.id, { duration, direction, playbackRate: rate, silent: true });
  };

  const stepFrame = (directionStep) => {
    const count = Math.max(1, Number(telemetry.frameCount) || 16);
    const current = Math.max(0, (Number(telemetry.motionFrame) || 1) - 1);
    const debugFrameIndex = (current + directionStep + count) % count;
    const motionId = /^walk_/.test(telemetry.action) ? telemetry.action : "walk_feminine";
    onPlay(motionId, { debugFrameIndex, debugHold: true, direction, playbackRate: rate, silent: true });
  };

  const overlayStyle = {
    "--motion-ground-x": `${Math.max(0, Number(telemetry.groundScreenX) || 50)}px`,
    "--motion-ground-y": `${Math.max(0, Number(telemetry.groundScreenY) || 90)}px`,
  };

  return (
    <>
      <div className="motion-debug-overlay" aria-label="Motion Ground Overlay" style={overlayStyle}>
        <span className="motion-debug-ground-line" />
        <span className="motion-debug-anchor-marker" title={`Ground Anchor ${telemetry.groundAnchor}`} />
        <span className={`motion-debug-foot-marker ${telemetry.footContact}`}>
          {telemetry.footContact === "left" ? "L" : telemetry.footContact === "right" ? "R" : "·"}
        </span>
      </div>
      <aside className="motion-debug-panel" aria-label="Motion Debug Panel">
      <div className="motion-debug-heading">
        <div>
          <small>DEVELOPMENT ONLY</small>
          <h2>Motion Gallery</h2>
        </div>
        <strong>{telemetry.fps} FPS</strong>
      </div>
      <dl className="motion-debug-telemetry">
        <div><dt>角色</dt><dd>{telemetry.model}</dd></div>
        <div><dt>当前动作</dt><dd>{telemetry.action}</dd></div>
        <div><dt>状态</dt><dd>{telemetry.motionState}</dd></div>
        <div><dt>时间</dt><dd>{telemetry.motionTime} ms</dd></div>
        <div><dt>优先级</dt><dd>{telemetry.motionPriority}</dd></div>
        <div><dt>队列</dt><dd>{telemetry.motionQueue || "—"}</dd></div>
        <div><dt>事件</dt><dd>{telemetry.motionEvent || "—"}</dd></div>
        <div><dt>方向</dt><dd>{telemetry.facing}</dd></div>
        <div><dt>速度</dt><dd>{telemetry.motionSpeed}×</dd></div>
        <div><dt>当前帧</dt><dd>{telemetry.motionFrame} / {telemetry.frameCount}</dd></div>
        <div><dt>帧时长</dt><dd>{telemetry.frameDuration} ms</dd></div>
        <div><dt>动作相位</dt><dd>{telemetry.framePhase}</dd></div>
        <div><dt>脚接触</dt><dd>{telemetry.footContact}</dd></div>
        <div><dt>Ground Anchor</dt><dd>{telemetry.groundAnchor}</dd></div>
        <div><dt>安全退出</dt><dd>{telemetry.safeExit}</dd></div>
      </dl>
      <div className="motion-debug-tools">
        <button type="button" onClick={() => onPlay("idle_neutral", { playbackRate: rate, silent: true })}>停止并待机</button>
        <button type="button" onClick={() => play(MOTIONS[(currentIndex + 1) % MOTIONS.length])}>下一个动作</button>
        <button type="button" onClick={() => stepFrame(-1)}>上一帧</button>
        <button type="button" onClick={() => stepFrame(1)}>下一帧</button>
        <button type="button" onClick={() => {
          const next = direction === "right" ? "left" : "right";
          setDirection(next);
          onPlay(telemetry.action === "—" ? "idle_neutral" : telemetry.action, { direction: next, playbackRate: rate, silent: true });
        }}>镜像方向</button>
        <label><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Walk 10 秒</label>
      </div>
      <div className="motion-debug-rates" aria-label="播放速度">
        {[0.25, 0.5, 1, 1.5].map((value) => (
          <button key={value} type="button" className={rate === value ? "active" : ""} onClick={() => setRate(value)}>{value}×</button>
        ))}
      </div>
      <div className="motion-debug-gallery">
        {Object.entries(grouped).map(([group, motions]) => (
          <section key={group}>
            <h3>{group}</h3>
            <div>{motions.map((motion) => <button key={motion.id} type="button" onClick={() => play(motion)}>{motion.label}</button>)}</div>
          </section>
        ))}
      </div>
      </aside>
    </>
  );
}
