# 女性角色动作系统 V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 PixiJS 6 / `pixi-live2d-display` 0.4 双渲染管线上实现统一、可回退、帧率独立的女性角色 Motion System V2 第一阶段。

**Architecture:** 上层使用 `MotionController` 统一状态、优先级、队列、Fallback 与事件；原创角色和 Haru 分别通过 Glam/Live2D adapter 执行。林薇复用当前 4 帧 Walk 和蹲姿图，以时间采样、交叉淡化、Mesh 曲线和次级运动扩展为 P0 八动作；其他造型保持 Legacy fallback。

**Tech Stack:** React 19、Electron、PixiJS 6.5.10、pixi-live2d-display 0.4.0、node:test、jsdom

**Spec:** `/Users/yunfeikong/Downloads/2026.6/女性角色动作系统_V2_完整实施方案.md`

## Global Constraints

- 不升级 PixiJS 6.5.10 或 `pixi-live2d-display` 0.4.0，不引入 3D 引擎或大型动画依赖。
- 保持旧 `rig.json`、聊天、TTS、Lip Sync、鼠标视线、眨眼、换装和桌宠窗口兼容。
- 缺失、损坏或不支持的动作资源必须无异常回退到可用动作或 Idle。
- 动作按毫秒时间采样，速度与刷新率无关；大资源按当前造型按需加载并在卸载时释放。
- 确定性中文动作命令本地解析，不交给模型猜测动作 ID。

## Review Focus

- 用户高优先级下蹲能中断 Idle/手势，随机 Idle 不能抢占下蹲。
- 缺失 Walk/Crouch 资源的 23 套造型不报错并保持现有 Mesh Idle。
- 低帧率大 `dt`、无效 motion/options 和重复完成回调不会破坏状态机。
- Glam 的动作层不会覆盖最终 Lip Sync、眨眼和 Gaze 更新。
- Haru 缺少新的 Motion Group 时回退到现有已打包 motion，不触发未处理拒绝。

---

### Task 1: Motion runtime core

**Files:**
- Create: `src/motion/constants.mjs`
- Create: `src/motion/MotionInterpolator.mjs`
- Create: `src/motion/MotionFallback.mjs`
- Create: `src/motion/MotionStateMachine.mjs`
- Create: `src/motion/MotionController.mjs`
- Create: `src/motion/secondary-motion.mjs`
- Test: `tests/motion-interpolator.test.mjs`
- Test: `tests/motion-fallback.test.mjs`
- Test: `tests/motion-state-machine.test.mjs`

**Interfaces:** Produces `MotionController.playMotion/queueMotion/stopMotion/stopAllMotions/setFacing/setLocomotionSpeed/getMotionState/canPlayMotion/update/destroy`, easing samplers, fallback resolution and damped secondary channels.

- [x] Write focused failing tests for interpolation, state transitions, priority, queueing, fallback and frame-rate-independent springs.
- [x] Run the focused tests and confirm failures are caused by the missing runtime.
- [x] Implement the smallest runtime that satisfies those contracts.
- [x] Run focused tests and confirm they pass.

### Task 2: Motion profiles and Glam adapter

**Files:**
- Create: `src/motion/MotionManifest.mjs`
- Create: `src/motion/adapters/GlamMotionAdapter.mjs`
- Modify: `src/glam-motion.mjs`
- Modify: `src/GlamPet.jsx`
- Modify: `server/looks.mjs`
- Test: `tests/motion-manifest.test.mjs`
- Modify: `tests/glam-motion.test.mjs`

**Interfaces:** Consumes Task 1 runtime; produces normalized P0 motion definitions, Legacy alias support, frame sampling/cross-fades and composed body/secondary pose output.

- [x] Add failing tests for the P0 manifest, legacy aliases, 8-phase Walk sampling, Crouch enter/hold/exit and face-layer preservation.
- [x] Run tests and confirm expected failures.
- [x] Implement manifest, adapter and Glam integration using existing Linwei assets.
- [x] Run motion and Glam tests.

### Task 3: Live2D adapter and local chat commands

**Files:**
- Create: `src/motion/adapters/Live2DMotionAdapter.mjs`
- Modify: `src/live2d-motion.mjs`
- Modify: `src/LivePet.jsx`
- Modify: `server/dialogue.mjs`
- Modify: `src/App.jsx`
- Modify: `src/LookActionMenu.jsx`
- Test: `tests/motion-command.test.mjs`
- Modify: `tests/live2d.test.mjs`
- Modify: `tests/pet-dialogue.test.mjs`

**Interfaces:** Consumes Task 1 controller and maps V2 IDs to current Haru groups/priority; produces deterministic motion commands in API responses and UI controls.

- [x] Add failing tests for Chinese motion intents, explicit crouch hold/stand, walk styles and Haru fallback mapping.
- [x] Run tests and confirm expected failures.
- [x] Implement adapter, React/API command flow and expanded controls.
- [x] Run focused tests.

### Task 4: Debug visibility, regression cleanup and delivery

**Files:**
- Modify: renderer telemetry/UI styles only where needed.
- Modify: stale existing tests whose fixed catalog counts no longer match shipped assets.
- Create: `docs/motion-system-v2-verification.md`

**Interfaces:** Consumes all prior tasks; produces development telemetry, repeatable verification notes and a green repository.

- [x] Run the full suite and build, diagnose every failure, and fix production regressions before stale assertions.
- [x] Verify P0 actions, state, priority, fallback, commands and both renderer adapters with automated tests.
- [x] Record asset limitations and visual acceptance steps; do not claim unattended visual checks were performed.
- [x] Run fresh `npm test` and `npm run build`, inspect the final diff, and commit the complete implementation.
