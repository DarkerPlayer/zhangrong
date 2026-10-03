# Character Wardrobe Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated full-body wardrobe workspace with stable renameable characters, character-scoped dialogue corpus, independent backgrounds, and reusable high-quality outfit-variant metadata while preserving every existing look.

**Architecture:** Keep the existing full PNG + rig renderer as the high-quality compiled output. Add a shared wardrobe domain catalog that separates characters, outfit variants, garment slots, and backgrounds; migrate local state to character profiles without changing the storage key; render a new full-page wardrobe workspace from that catalog.

**Tech Stack:** React 19, Vite, Node.js ES modules, PixiJS, localStorage, node:test, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-character-wardrobe-studio-design.md`

## Global Constraints

- No runtime image API or API key.
- Preserve all current `lookId` values and existing assets.
- Do not overwrite user-owned uncommitted changes; implementation runs in place because those changes overlap the wardrobe catalog.
- Every character is an adult; an empty outfit may only resolve to an authored white-bikini safe variant and must otherwise keep a safe existing look.
- New behavior follows test-first RED→GREEN cycles.

## Review Focus

- Corrupt or oversized character-profile data restores safely without poisoning prompts.
- Renaming one character never renames another character or the user's preferred name.
- Only enabled corpus entries for the active character reach chat.
- Switching backgrounds never changes the current character, outfit, messages, or corpus.
- Legacy saved `lookId`, removed looks, and global corpora survive migration.

---

### Task 1: Shared wardrobe domain and state migration

**Files:**
- Create: `server/wardrobe.mjs`
- Create: `src/wardrobe.mjs`
- Modify: `server/looks.mjs`
- Modify: `src/state.mjs`
- Test: `tests/wardrobe-domain.test.mjs`
- Test: `tests/state.test.mjs`

**Interfaces:**
- Produces: `CHARACTERS`, `OUTFIT_VARIANTS`, `BACKGROUNDS`, `getCharacter`, `getCharacterForLook`, `getCharacterLooks`, `getCharacterDisplayName`, `getActiveCharacterCorpus`.
- Produces state fields: `characterProfiles`, `backgroundId`, `lastLookByCharacter`.

- [ ] Write failing domain and migration tests for stable character IDs, look mapping, isolated rename/corpus, valid background restore, and legacy corpus migration.
- [ ] Run the focused tests and confirm failures are caused by missing exports/state.
- [ ] Implement the shared catalog, client re-export, look `characterId`, and bounded state restoration helpers.
- [ ] Run focused tests and the full suite.

### Task 2: Character-aware dialogue

**Files:**
- Modify: `src/App.jsx`
- Modify: `server/index.mjs`
- Modify: `server/dialogue.mjs`
- Test: `tests/dialogue.test.mjs`
- Test: `tests/server.test.mjs`

**Interfaces:**
- Consumes: `getCharacterDisplayName`, `getActiveCharacterCorpus`.
- Produces: chat request fields `characterName`, `characterCorpus`; `createMessages()` and `offlineReply()` use the active character identity.

- [ ] Write failing tests proving renamed identity reaches offline/model replies and only bounded active-character corpus is injected.
- [ ] Run focused tests and confirm expected failures.
- [ ] Validate new request fields at the HTTP boundary and use them in dialogue without accepting privileged roles.
- [ ] Run focused tests and the full suite.

### Task 3: Dedicated full-body wardrobe page

**Files:**
- Create: `src/WardrobePage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/wardrobe.css`
- Test: `tests/frontend.test.mjs`

**Interfaces:**
- Consumes: wardrobe catalog, current look/background/profile state, existing `LivePet` and look-selection callback.
- Produces: full-page character picker, rename editor, full-body preview, outfit/parts/corpus/background tabs.

- [ ] Write failing UI tests for opening a page instead of a side panel, full-body preview, character switching, rename persistence, corpus isolation, and background independence.
- [ ] Run the frontend tests and confirm the new controls are absent.
- [ ] Implement the page and lift only the state-changing callbacks needed from `App`.
- [ ] Add responsive desktop and compact layouts without changing the desktop-pet wardrobe.
- [ ] Run focused tests and the full suite.

### Task 4: Reusable outfit metadata and safe empty-state workflow

**Files:**
- Modify: `server/wardrobe.mjs`
- Modify: `src/WardrobePage.jsx`
- Modify: `src/wardrobe.css`
- Test: `tests/wardrobe-domain.test.mjs`
- Test: `tests/frontend.test.mjs`

**Interfaces:**
- Consumes: `OUTFIT_VARIANTS` and each variant's `slots`.
- Produces: slot browsing, reusable component metadata, safe variant availability, and a non-destructive pending-adaptation state.

- [ ] Write failing tests for normalized garment slots and empty-outfit fail-closed behavior.
- [ ] Run focused tests and confirm failures.
- [ ] Add slot manifests for all existing looks and the safe-base resolver.
- [ ] Implement parts browsing and an honest “待适配” state when a requested combination lacks authored artwork.
- [ ] Run focused tests and the full suite.

### Task 5: Documentation and production verification

**Files:**
- Modify: `README.md`
- Modify: `docs/wardrobe-model-workflow.md`
- Modify: `docs/技术栈与架构说明.md`

**Interfaces:**
- Consumes: completed product behavior.
- Produces: documented image-to-reusable-garment workflow and current capabilities/limitations.

- [ ] Document the separate catalog and built-in ImageGen adaptation workflow.
- [ ] Run `npm test` and require 0 failures.
- [ ] Run `npm run build` and require exit 0.
- [ ] Launch the local app, inspect the wardrobe at desktop and narrow sizes, and record any remaining limitation honestly.
