# Motion Quality Implementation Plan

> **Spec:** `docs/superpowers/specs/2026-09-29-motion-quality.md`
>
> **Execution:** Inline in the managed worktree, using strict RED → GREEN cycles.

## Global constraints

- Do not introduce runtime network dependencies.
- Do not regress blink, gaze, lip sync, TTS, chat, wardrobe, or desktop-pet behavior.
- Walking uses all 16 authored poses and permits only a short eased boundary overlap when visual QA shows that a hard swap flashes; it must not produce persistent double limbs.
- Runtime code must tolerate looks that have no motion profiles.
- Generated bitmap assets must remain 1024×1536 RGBA PNGs and preserve each look's identity/outfit.

## Task 1: Authored walk profile and true 16-pose assets

**Files:** `tests/look-catalog.test.mjs`, `tests/motion-manifest.test.mjs`, `server/looks.mjs`, `src/motion/MotionManifest.mjs`, `src/motion/adapters/GlamMotionAdapter.mjs`, `public/looks/linwei-*/actions/*.png`

1. Change catalog and sampling tests to require 16 existing poses, unequal frame durations, phase/contact metadata, and a bounded end-of-pose transition. Run the focused tests and confirm they fail on the current eight equal-time blended cycle.
2. Generate eight identity-preserving in-between pose assets per Linwei look with transparent background, inspect them, and save them beside the existing poses.
3. Add per-look ordered pose descriptors with duration, phase, ground anchor, and foot-contact metadata.
4. Pass the descriptors into the manifest/adapter and replace equal-time sampling with authored-duration sampling.
5. Run focused tests and the full suite.

Expected: 16 real files per look; frame selection follows cumulative durations; each pose stays crisp for most of its hold and eases only at the boundary.

## Task 2: Ground anchoring, stride coupling, and safe walk exits

**Files:** `tests/motion-manifest.test.mjs`, `tests/motion-state-machine.test.mjs`, `src/motion/adapters/GlamMotionAdapter.mjs`, `src/motion/MotionController.mjs`, `src/GlamPet.jsx`

1. Add failing tests for anchor offsets, acceleration/deceleration envelope, stride-duration-speed consistency, and finite walks extending to the next contact-safe event.
2. Implement normalized ground-anchor offsets in the adapter sample and apply them to the action mesh without moving the base UI layout.
3. Add a start/stop locomotion envelope and couple translation to manifest stride/cycle values.
4. Make looped finite motions with `safeExitEvents` complete on the first matching event at or after the requested duration.
5. Run focused tests and the full suite.

Expected: ground Y is stable, horizontal support-foot correction is bounded, speed ramps smoothly, and walk completion occurs only at contact.

## Task 3: Layered crouch curve

**Files:** `tests/motion-manifest.test.mjs`, `src/motion/MotionManifest.mjs`, `src/motion/adapters/GlamMotionAdapter.mjs`

1. Replace the old midpoint-only crouch test with failing literal samples for anticipation, accelerated descent, brake, overshoot, settle, reversed exit, and delayed body layers.
2. Implement the authored crouch timeline and independent head/chest/hip/hair/cloth progress.
3. Tune the secondary spring so hair/cloth settle after the pelvis while remaining bounded.
4. Run focused tests and the full suite.

Expected: crouch starts with a tiny reverse move, reaches 1.01–1.03 before settling to 1, and layer values differ during transitions.

## Task 4: Motion Lab diagnostics and frame stepping

**Files:** `tests/frontend.test.mjs`, `src/GlamPet.jsx`, `src/MotionDebugPanel.jsx`, `src/styles.css`

1. Extend the existing Motion Lab test to require current frame/time, phase, anchors, contacts, safe-exit state, ground overlay, and previous/next frame controls; run it red.
2. Publish the adapter's frame telemetry on the canvas data attributes.
3. Render the debug-only ground line and markers over the canvas.
4. Add exact-frame previous/next controls using a debug frame option while retaining speed, loop, and direction controls.
5. Run focused tests and the full suite.

Expected: all requested diagnostics are visible only on `/dev/motions` in development and frame stepping selects exact authored poses.

## Task 5: Package and visual acceptance

**Files:** all changed files; generated `dist/` and desktop package are build outputs only.

1. Run `npm test` and `npm run build`.
2. Run `npm run build:desktop` after stopping only the exact previous app process if necessary.
3. Launch the packaged app, select both Linwei looks, run 10-second walks in both directions, and run stand → crouch → hold → stand.
4. Inspect packaged visuals for flash, double limbs, foot/ground jump, face deformation, and hard starts/stops; fix Important findings through RED → GREEN tests.
5. Commit the final implementation, fast-forward the original `main` branch to it, rebuild from the original workspace if needed, and leave Git clean.

Expected: tests/build/package pass, the packaged app visibly meets the spec, and the final commit is present on `main`.

## Review focus

- Frame timing boundary conditions, including wraparound and large time steps.
- Safe-exit rounding when the requested duration is exactly on a contact.
- Mirrored anchor offsets and reversal at stage bounds.
- Crouch enter/idle/exit continuity.
- Missing/partial action metadata and failed asset loads.
- Debug controls leaking into production UI.
