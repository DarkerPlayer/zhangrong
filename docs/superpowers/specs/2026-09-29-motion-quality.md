# Walk and Crouch Motion Quality Specification

## Goal

Make Linwei's `walk_feminine` and crouch sequence visibly stable and natural in the packaged Electron app. The implementation must remove the obvious PNG-cut/flash sensation, keep the support foot near the ground, and replace hard starts/stops with authored timing.

## Scope

- Linwei's ivory-wrap and red-sole looks.
- `walk_feminine`, `walk_confident`, `crouch_enter`, `crouch_idle`, and `crouch_exit`.
- Motion Lab diagnostics on `/dev/motions` in development.
- Existing blink, gaze, lip sync, TTS, chat, wardrobe, and desktop-pet behavior must remain intact.

## Design

### Walk assets and timing

- Each Linwei look ships a 16-pose cycle made from real raster poses, not runtime alpha cross-fades between walking silhouettes.
- Poses use non-uniform durations matching contact/settle/down/compression/passing/rise/up/pre-contact phases on both sides.
- Each pose has normalized ground-anchor metadata and left/right contact metadata.
- The runtime holds a pose for its authored duration and switches directly at the boundary; cross-fade remains available only for idle-to-walk and walk-to-idle transitions.

### Grounding and locomotion

- Per-pose ground-anchor offsets align the artwork to a shared ground reference.
- The active contact marker is exposed to the renderer and Motion Lab.
- Translation speed, cycle duration, and stride remain mathematically consistent.
- Locomotion eases in with weight transfer and eases out at a contact-safe point.
- Finite walk requests may run slightly longer than requested so they finish on the next contact event.

### Crouch

- Crouch follows anticipation, acceleration, brake, 1–3% overshoot, and settle phases.
- Head, chest, hip, hair, and cloth use staggered progress, rather than starting and stopping together.
- Hair and cloth continue through spring-based secondary motion after the body settles.
- Enter transitions to a persistent crouch idle; exit returns smoothly to neutral.

### Motion Lab

- Preserve motion selection, loop, direction, FPS, and 0.25×/0.5×/1×/1.5× controls.
- Add current frame, frame duration, phase, contact foot, ground anchor, and safe-exit telemetry.
- Show a ground line, ground-anchor marker, and left/right contact marker over the character only in Motion Lab.
- Add previous/next frame stepping by pausing the selected motion on an exact frame.

## Acceptance

- A 10-second walk has no alpha double-limb blend, large brightness flash, periodic head bounce, or obvious ground-anchor jump.
- Both directions work and finite walks stop at contact.
- Stand → crouch → hold → stand contains anticipation, braking, a subtle rebound, and no hard drop/stop.
- Blink, gaze, mouth motion, voice, chat, and outfit selection still work.
- Automated tests, production web build, and desktop package all succeed.
- The packaged application is launched and the walk/crouch sequence is visually checked before delivery.

