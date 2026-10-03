# Companion Growth Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement the independent tasks and review their integration.

**Goal:** Provide independent companion profiles, editable durable memory, experience-based growth, and faster local streamed conversation.

**Architecture:** Keep one local inference engine shared by all characters. Extend existing per-persona browser storage with bounded memory, completed experiences, personality, mood and appearance presets. Retrieve a small memory context for each request; stream visible chat tokens and speak complete sentences sequentially.

**Tech Stack:** React, Electron, Node.js, Ollama, existing local Qwen3-TTS.

**Spec:** User-approved roadmap in this conversation: Qwen3.5 4B/9B trial, long-term memory, character profiles, relationship growth.

## Constraints and review focus

- Preserve existing working-directory changes, user voices, models, outfits and chat archives. No reset or automatic repository commit.
- Entire companion storage and inference stay local; model weights require a one-time download.
- Deleted or corrected memories must remain so after reload. Never infer memories from generated assistant text.
- Switching a persona cancels old text/audio and restores its own available appearance, with safe fallback for archived assets.
- Partial stream errors must not save a fabricated complete answer; cancellation must stop queued speech.
- Growth uses completed events, never number of messages or penalties for absence.
- Model download sizes are not runtime memory measurements. Compare actual local latency before recommending a default.

## Tasks

- [x] Memory domain: add migration marker, bounded editable entries, retrieval, experiences, stages, personality/mood and contextual prompting. Test correction/reload, isolation, deduplication and absence.
- [x] Local conversation: model ranking, non-thinking requests, bounded NDJSON streaming and sentence speech queue. Test chunk splits, cancellation and partial failures.
- [x] Companion UI: profile, memory CRUD, plan completion and experience journal; keep existing voice/corpus controls. Test real user flows and draft isolation.
- [x] Integration: validated server context/stream route, profile appearance capture/restore, App callbacks and streamed replies, automatic completed-focus event, model controls.
- [x] Model trial: download Qwen3.5 4B and 9B into the existing local engine, test identical neutral Chinese scenarios sequentially, unload between runs, document timing and limitations.
- [x] Verification and delivery: independent code review, full JS/Python tests and production build; verify migration and UI in isolated storage; update the desktop app with code-only rollback backup.

## Progress

Implementation authorized by user. Continuing in the existing workspace preserves substantial prior uncommitted work that a new checkout would omit.


Verification checkpoint: 376 JavaScript tests passed with no skips or failures; 4 Python reference-cache tests passed; Vite build passed. Cross review fixed same-appearance loading, blocked activity clicks during reply generation, EOF cancellation, completed-plan text reappearing after deletion, local-day deduplication, completed-plan retrieval priority, and repeated real focus sessions. Browser checks verified memory isolation/reload, plan completion, linked-experience correction, model trial and real streamed speech.

Delivery complete: both Qwen3.5 models installed, clean sequential comparison completed (9/9 responses), and synthetic measurements saved in docs/companion-model-benchmark-1.17.json. The existing desktop app was closed, its code and user storage backed up to release/backups/before-1.17.0-20261002-2330, then its dist/server/runtime/package/version updated to 1.17.0. Relaunch verified existing six profiles, selected appearance, two corpus entries, voice selection and migrated user-name memory. Native settings show three installed models with 4B selected; the native model trial completed successfully without saving a chat (7.77 s first response / 8.80 s complete). App remains open on the new companion profile page.
