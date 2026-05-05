---
description: "Task list for feature 003-settings-tab-restructure"
---

# Tasks: Settings Tab Restructure — Prompts as a First-Class Tab

**Input**: Design documents from `/specs/003-settings-tab-restructure/`
**Prerequisites**: `plan.md` ✓, `spec.md` ✓, `research.md` ✓, `data-model.md` ✓, `contracts/tauri-commands.md` ✓, `contracts/settings-store.md` ✓, `quickstart.md` ✓

**Tests**: included. Constitution Principle IV (Type Safety & Quality Gates) requires `pnpm test` and `cargo test` green before merge; explicit migration tests prevent silent data loss.

**Out of scope** (recorded in `follow-ups.md`, do not include): FU-1 legacy store-key cleanup, FU-2 feature-002 cycler contract.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no incomplete deps → parallelizable.
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories). Setup / Foundational / Polish: no story label.
- File paths are exact. Repository root: `/Users/Tim/Documents/voicetypr-extended-free`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project-level scaffolding before any code lands.

- [x] T001 [P] Create empty directories `src/components/prompts/`, `src/components/prompts/__tests__/`, `src/lib/prompts/`, `src-tauri/src/migrations/` (use `mkdir -p`; commit a `.gitkeep` if the dir would otherwise be empty after Phase 2)
- [x] T002 [P] Add lucide-react named imports allowlist constants file at `src/lib/prompts/icon-allowlist.ts` exporting the 16 icon names from `research.md` R6 (FileText, Sparkles, Mail, GitCommit, Pencil, BookOpen, List, MessageSquare, Briefcase, Hash, Scissors, Type, StickyNote, Terminal, Star, Zap) plus a typed `IconName` union and a `iconComponentByName` map for runtime resolution

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Types, persistence, migration, and the resolved-active-prompt path. EVERY user-story task depends on this phase being complete.

**⚠️ CRITICAL**: No US1 / US2 / US3 work begins until Phase 2 checkpoint.

### Backend types and library

- [x] T003 [P] Add Rust types `Prompt`, `PromptKind`, `BuiltinId`, `PromptLibrary` to `src-tauri/src/ai/prompts.rs` (serde Serialize/Deserialize, snake_case JSON, matching the shape in `data-model.md` and `contracts/settings-store.md`); export from `src-tauri/src/ai/mod.rs`
- [x] T004 [P] Add TS types `Prompt`, `PromptKind`, `BuiltinId`, `PromptLibrary` to `src/types/ai.ts` (mirror the Rust shape exactly, snake_case fields to match the wire format from Tauri); replace the existing `EnhancementOptions.preset` field references with the new `active_prompt_id` model — leave the legacy `EnhancementOptions` / `CustomPrompts` types in place but mark them `@deprecated`
- [x] T005 [P] Add `BUILTIN_PROMPT_DEFAULTS` constant in `src-tauri/src/ai/prompts.rs` mapping each `BuiltinId` to its shipped `name`, `icon` (string from allowlist), and `prompt_text` (carrying forward the existing `BASE_PROMPT_TEMPLATE` / `PROMPTS_TRANSFORM` / `EMAIL_TRANSFORM` / `COMMIT_TRANSFORM` strings — NO content rewording, just relocation)

### Migration

- [x] T006 Create `src-tauri/src/migrations/mod.rs` with `pub mod prompt_library_v1;` and a top-level `pub fn run_all_migrations(app: &AppHandle) -> Result<(), String>` that calls each migration in sequence; register the module in `src-tauri/src/lib.rs`
- [x] T007 Implement `src-tauri/src/migrations/prompt_library_v1.rs` per `data-model.md` "Migration: legacy → v1" section: read `enhancement_options` + `custom_prompts` from `tauri-plugin-store`, produce a `PromptLibrary` v1 blob, write it under key `prompts`, leave legacy keys in place; idempotent (skip if `prompts.version >= 1`); return `Ok(())` on first-run-already-migrated and on legacy-keys-absent (apply shipped defaults); drop `custom_prompts.base` per design
- [x] T008 Wire `run_all_migrations` into the Tauri `setup` hook in `src-tauri/src/lib.rs` (after store load, before any window shows); log success/failure but do NOT abort startup on migration error (degrade to shipped defaults)
- [x] T009 [P] Unit tests for migration in `src-tauri/src/migrations/prompt_library_v1.rs` covering: (a) no legacy keys → 4 built-ins with shipped defaults, active = `builtin:default`; (b) `enhancement_options.preset = "Email"` only → active = `builtin:email`, all texts shipped; (c) `custom_prompts.email = Some("foo")` → email built-in's text is "foo", others shipped; (d) `custom_prompts.base = Some("bar")` → "bar" is dropped, no base preserved; (e) idempotency: running twice produces identical blob; (f) re-derivation: if `prompts` key deleted, next run reproduces from still-present legacy keys

### New backend cmds

- [x] T010 Add Tauri cmds `list_prompts`, `get_active_prompt`, `set_active_prompt` to `src-tauri/src/commands/ai.rs` per `contracts/tauri-commands.md`; reuse the `tauri-plugin-store` access pattern of the existing `get_enhancement_options`
- [x] T011 Add Tauri cmds `create_prompt`, `update_prompt`, `delete_prompt`, `reset_prompt_to_default` to `src-tauri/src/commands/ai.rs` per `contracts/tauri-commands.md`; reuse `MAX_CUSTOM_PROMPT_LEN` for `prompt_text` length validation; reject empty/whitespace-only `prompt_text` and `name` (FR-013a); `delete_prompt` with active id → fall back to `builtin:default` (FR-011); built-in delete → reject; built-in `id`/`kind`/`builtin_id` immutable in `update_prompt`
- [x] T012 Mark deprecated cmds in `src-tauri/src/commands/ai.rs`: add `#[deprecated(note = "use list_prompts/update_prompt/etc.")]` attributes to `get_enhancement_options`, `update_enhancement_options`, `get_custom_prompts`, `update_custom_prompts`, `get_default_prompts`; keep them registered (callable for one release for backward compat); add a CHANGELOG line under `## Unreleased / Deprecated` noting removal target as the release after this one
- [x] T013 Register all 7 new cmds in `src-tauri/src/lib.rs` `invoke_handler!`/builder cmd list — append to existing `get_enhancement_options, update_enhancement_options, get_custom_prompts, update_custom_prompts, get_default_prompts` line so deprecated + new coexist for one release
- [x] T014 Refactor `build_enhancement_prompt` in `src-tauri/src/ai/prompts.rs` to the new signature taking a resolved `&Prompt` per `research.md` R4: built-ins (`kind == Builtin`) keep language-aware base assembly via `builtin_id` match, custom prompts (`kind == Custom`) skip base/transform split and use `prompt_text` directly with optional `{language}` substitution; update all call sites in `src-tauri/src/ai/anthropic.rs`, `src-tauri/src/ai/gemini.rs`, and any other provider files to fetch the active prompt via the new path and call with the new signature

### Backend tests for foundational

- [x] T015 [P] Update `src-tauri/src/ai/tests.rs` `build_enhancement_prompt` tests: add cases for built-in active + custom active; assert language substitution still works; remove tests that depended on the removed `EnhancementOptions` + `CustomPrompts` argument shape (replace with new shape, do not delete coverage)
- [x] T016 [P] Add round-trip test in `src-tauri/src/ai/tests.rs` for `PromptLibrary` JSON serialize → deserialize → compare-equal; test rejection paths: invalid icon name, empty `prompt_text`, oversized `prompt_text` (>8192), built-in delete attempt

### Frontend foundational

- [x] T017 [P] Add `src/hooks/usePromptLibrary.ts` exposing `{ library, isLoading, error, listPrompts, createPrompt, updatePrompt, deletePrompt, resetPromptToDefault, setActivePrompt }` wrapping the new Tauri cmds via `@tauri-apps/api/core invoke`; cache the library in component state, optimistically update on mutations, refetch on error
- [x] T018 [P] Add `src/lib/prompts/builtins.ts` exporting `BUILTIN_DEFAULTS_UI` (a frontend-side mirror of names + icon defaults — for the Reset action's optimistic update before the backend roundtrip; do NOT duplicate `prompt_text` here, that's Rust-owned)

### Sidebar wiring

- [x] T019 Update `src/components/Sidebar.tsx` tab list: remove entries `{id:"models",...}` and `{id:"formatting",...}`; add `{id:"prompts", label:"Prompts", icon:Sparkles}`, `{id:"llm-models", label:"LLM Models", icon:Cpu}`, `{id:"stt-models", label:"STT Models", icon:Mic}` in this order between `general` and `about`; import `Mic` from `lucide-react` if not already
- [x] T020 Update `src/App.tsx` (or wherever `activeSection` switches): change cases `"models"` → `"stt-models"`, `"formatting"` → `"llm-models"`, add new case `"prompts"` rendering `<PromptsSection />` (component will be created in US1)

**Checkpoint**: Foundation ready. Backend migrates correctly; cmds work; sidebar shows three new tabs (broken for now — Prompts/LLM Models/STT Models render nothing or stub until US1/US2 land). All `cargo test` and `pnpm typecheck` green.

---

## Phase 3: User Story 1 — Find and edit a prompt without hunting through "Advanced" (Priority: P1) 🎯 MVP

**Goal**: User can open Prompts tab, click any built-in row, edit the prompt text inline with auto-save and inline empty-text validation. Editing-focus is decoupled from active-prompt selection (Q2 / FR-013).

**Independent Test** (from spec.md): Starting on Overview, reach the Email prompt's editable text in two clicks (Prompts tab → Email row); a saved edit is reflected in the next transcription's prompt.

### Tests for User Story 1

- [ ] T021 [P] [US1] `src/components/prompts/__tests__/PromptList.test.tsx`: renders BUILT-IN group with 4 entries in canonical order; renders CUSTOM group below; renders search field and "New prompt" entry; search filters by case-insensitive name substring; empty search results shows empty-state; active dot renders next to the row whose id matches `library.active_prompt_id`
- [ ] T022 [P] [US1] `src/components/prompts/__tests__/PromptEditor.test.tsx`: renders Name + Icon + Prompt text fields populated from selected prompt; auto-save fires after 500ms idle (use fake timers); empty `prompt_text` blocks save and surfaces validation error in save-status indicator (FR-013a); built-in selected → "Reset to default" button visible; custom selected → "Reset" button absent, delete button visible; clicking "Reset" restores all 3 fields atomically (FR-009 / Q4)
- [ ] T023 [P] [US1] `src/components/prompts/__tests__/PromptsSection.test.tsx`: clicking a row opens it in the editor pane WITHOUT changing `active_prompt_id` (FR-013 / Q2); explicit "Set as active" affordance changes `active_prompt_id` and moves the orange dot

### Implementation for User Story 1

- [ ] T024 [P] [US1] `src/components/prompts/IconPicker.tsx`: grid of the 16 icons from `src/lib/prompts/icon-allowlist.ts`; controlled component (`value: IconName`, `onChange`); selected icon visually highlighted; matches the screenshot's two-row icon grid layout
- [ ] T025 [P] [US1] `src/components/prompts/PromptRow.tsx`: renders one prompt row (icon, name, short preview, badge "default"|"custom", optional active dot); props `prompt: Prompt`, `isActive: boolean`, `isSelected: boolean`, `onClick: () => void`; pure presentational
- [ ] T026 [US1] `src/components/prompts/PromptList.tsx`: composes `PromptRow`; props `library: PromptLibrary`, `selectedId: string | null`, `searchQuery: string`, `onSelect: (id) => void`; renders BUILT-IN group header + rows, CUSTOM group header + rows, "New prompt" entry at bottom; applies search filter; depends on T025
- [ ] T027 [US1] `src/components/prompts/PromptEditor.tsx`: name/icon/prompt-text editor pane; props `prompt: Prompt | null`, `onUpdate: (patch) => Promise<void>`, `onSetActive: () => Promise<void>`, `onResetToDefault: () => Promise<void>`, `onDelete?: () => Promise<void>`, `isActive: boolean`; debounced auto-save (500ms via `useEffect` with cleanup); inline validation (empty / >8192 bytes); save-status indicator ("Saved automatically" / "Saving..." / validation error); "Set as active" button (visible whenever `!isActive`); per-prompt "Reset to default" button (built-ins only); delete button (custom only, with confirm); character count
- [ ] T028 [US1] `src/components/sections/PromptsSection.tsx`: top-level Prompts tab; uses `usePromptLibrary` hook; manages `selectedId` and `searchQuery` local state; composes search input + `PromptList` (left pane) + `PromptEditor` (right pane); two-column layout matching the screenshot; depends on T026, T027

**Checkpoint**: Prompts tab renders. User can find any built-in, click to edit, type changes, see auto-save, see validation errors, click "Set as active" to change the active prompt. AI providers picking up the new prompt happens already because Phase 2 wired the resolver. **MVP for editing built-in prompts is shippable.**

---

## Phase 4: User Story 2 — Distinguish LLM Models from STT Models (Priority: P1)

**Goal**: Sidebar labels and tab content make the language-model vs speech-to-text-model distinction obvious. Old "Formatting" surface is trimmed (no preset picker, no Custom Prompts (Advanced) collapsible). Old "Models" tab is renamed only.

**Independent Test** (from spec.md): A first-look user can identify which tab to open to enter an OpenAI API key (LLM Models) vs download a Whisper model (STT Models) without further explanation.

### Tests for User Story 2

- [ ] T029 [P] [US2] `src/components/Sidebar.test.tsx` (NEW or extend existing): snapshot test asserting tab list shape after restructure (8 entries top group: overview, recordings, audio, general, prompts, llm-models, stt-models, about); fails on accidental reorder/rename during rebases
- [ ] T030 [P] [US2] `src/components/sections/__tests__/LLMModelsSection.test.tsx` (RENAMED from `EnhancementsSection.test.tsx` if it exists; otherwise NEW): asserts the AI Providers section + Setup Guide are rendered; asserts the preset-pill picker (`EnhancementSettings`) is NOT rendered; asserts the "Custom Prompts (Advanced)" collapsible is NOT rendered; asserts header reads "LLM Models" not "Formatting"
- [ ] T031 [P] [US2] `src/components/sections/__tests__/STTModelsSection.test.tsx` (NEW; or extend any existing `ModelsSection.test.tsx`): asserts header reads "STT Models" not "Models"; asserts the Whisper / Parakeet model list, language picker, and engine selection still render unchanged; functional smoke for download click delegates to existing model-download path (mock the cmd, just verify wiring)

### Implementation for User Story 2

- [ ] T032 [US2] Refactor `src/components/sections/EnhancementsSection.tsx` → "LLM Models": change h1 from "Formatting" to "LLM Models" with a one-line subtitle indicating language-model post-processing; DELETE the "Formatting Options" block (the `EnhancementSettings` import and `<EnhancementSettings ...>` JSX, plus the `enhancementOptions` state and `handleEnhancementOptionsChange` if no longer referenced); DELETE the "Custom Prompts (Advanced)" `<Collapsible>` block including its `customPromptsOpen` state and `customPrompts` state if unused; KEEP the AI Providers section, the master AI on/off toggle (`aiSettings.enabled`), and the Setup Guide; rename the file to `src/components/sections/LLMModelsSection.tsx` (git mv) for clarity
- [ ] T033 [US2] Delete `src/components/EnhancementSettings.tsx` (no remaining importers after T032); delete its test file if any (`src/components/EnhancementSettings.test.tsx` if exists)
- [ ] T034 [US2] Refactor `src/components/sections/ModelsSection.tsx` → "STT Models": change h1 from "Models" to "STT Models" with a one-line subtitle indicating speech-to-text engine downloads; ALL OTHER CONTENT UNCHANGED (Whisper/Parakeet list, language picker, engine selection); rename the file to `src/components/sections/STTModelsSection.tsx` (git mv)
- [ ] T035 [US2] Update `src/App.tsx` imports + switch cases per T020 to use the new component names (`<LLMModelsSection />`, `<STTModelsSection />`); remove imports of the renamed components by their old names
- [ ] T036 [US2] `src/contexts/SettingsContext.tsx`: remove the `enhancementOptions` state + `handleEnhancementOptionsChange` if they only existed to feed the deleted `EnhancementSettings`; do NOT remove anything that has remaining consumers; add a thin selector exposing `library.active_prompt_id` for any in-flight 002 cycler integration (read-only)

**Checkpoint**: Sidebar shows three labelled tabs in correct order with distinct icons. LLM Models renders only provider/key/model UI + Setup Guide. STT Models renders identical content to today's Models tab, just relabeled. Existing AI provider configurations and downloaded transcription models behave identically (FR-016, FR-019, SC-003, SC-006).

---

## Phase 5: User Story 3 — Create / activate / delete a custom prompt (Priority: P2)

**Goal**: User can author custom prompts (Slack reply, etc.) with name + icon + prompt text, see them grouped under CUSTOM, set them active, and delete them — with active-prompt fallback to Default on delete.

**Independent Test** (from spec.md): Create a custom prompt, set it active, run a transcription, observe the AI provider received the custom prompt's text. Delete it, verify active falls back to Default.

### Tests for User Story 3

- [ ] T037 [P] [US3] Extend `src/components/prompts/__tests__/PromptsSection.test.tsx`: clicking "New prompt" opens a fresh editor with empty fields and disabled save (FR-013a — non-empty name + non-empty prompt_text + valid icon required for create); typing valid name/icon/text and pausing → row appears in CUSTOM group; new prompt does NOT auto-activate (FR-013 / Q2)
- [ ] T038 [P] [US3] Extend `src/components/prompts/__tests__/PromptsSection.test.tsx`: deleting the active custom prompt sets `active_prompt_id` to `builtin:default` (FR-011); deleting a non-active custom prompt leaves the active selection alone

### Implementation for User Story 3

- [ ] T039 [US3] `src/components/prompts/PromptList.tsx` "New prompt" entry: when clicked, calls a callback to enter create mode (sets `selectedId = null`, switches `PromptEditor` to a draft state); depends on T026
- [ ] T040 [US3] `src/components/prompts/PromptEditor.tsx` draft mode: when `prompt === null` (create), renders blank Name / Icon / Prompt text fields with placeholders; "Save" affordance is disabled until all three are valid (non-empty name ≤64 chars, valid icon, non-empty prompt_text ≤8192 bytes); on Save → calls `usePromptLibrary.createPrompt({name, icon, prompt_text})` → on success the parent selects the newly created prompt and the editor exits draft mode; depends on T027
- [ ] T041 [US3] `src/components/sections/PromptsSection.tsx` wiring: when "New prompt" clicked → enter draft mode (T039 + T040); after `createPrompt` resolves → select the new id, library refreshes via the hook; on delete → call `usePromptLibrary.deletePrompt(id)`, after success select `active_prompt_id` (which the backend has fallback-corrected if needed)

**Checkpoint**: Full custom-prompt CRUD lifecycle works end-to-end. SC-005 satisfied (create → edit → set-active → use → delete in one session, no app restart).

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T042 [P] Run quickstart.md manual smoke-test pre-conditions and walkthrough; capture any deviations as new tasks (do not fix in-line — surface as follow-ups)
- [ ] T043 [P] Lint pass: `pnpm lint` clean across changed files; fix any ESLint warnings introduced by new components
- [ ] T044 [P] Type pass: `pnpm typecheck` clean; verify no new `any` introductions (Constitution Principle IV)
- [ ] T045 [P] Frontend test pass: `pnpm test` green; verify all new tests added in T021/T022/T023/T029/T030/T031/T037/T038 are running and passing
- [ ] T046 [P] Backend test pass: `cd src-tauri && cargo test` green; verify migration tests (T009), build_enhancement_prompt tests (T015), serialization tests (T016) all pass; warnings-clean
- [ ] T047 Update `CLAUDE.md` "Recent Updates" section with a one-line entry: "Settings sidebar restructured: Prompts tab (new), Formatting → LLM Models, Models → STT Models. See `specs/003-settings-tab-restructure/`."
- [ ] T048 Add CHANGELOG entry under `## Unreleased`: feature summary + list of breaking changes from user perspective (preset-picker location moved to Prompts tab; `custom_prompts.base` field dropped — see release notes); link to follow-ups.md for FU-1 / FU-2

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no deps. Can start immediately.
- **Foundational (Phase 2)**: depends on Setup. **BLOCKS all user stories.**
- **US1 (Phase 3)**: depends on Foundational checkpoint.
- **US2 (Phase 4)**: depends on Foundational checkpoint. Independent of US1.
- **US3 (Phase 5)**: depends on Foundational checkpoint AND on US1 (extends `PromptList`/`PromptEditor`/`PromptsSection`).
- **Polish (Phase 6)**: depends on whichever stories ship.

### Within Phase 2 (Foundational)

- T003, T004, T005 are [P] (different files: prompts.rs / ai.ts / prompts.rs constants).
- T006, T007 sequential (T007 imports module declared in T006).
- T008 depends on T007.
- T009 depends on T007 and on `tauri-plugin-store` test scaffolding being present (already is).
- T010, T011 sequential within `src-tauri/src/commands/ai.rs` (same file).
- T012, T013 sequential after T010+T011 (edit same file / lib.rs).
- T014 depends on T003 + on call sites being identifiable (sequential within prompts.rs and provider files; tests in T015 depend on T014).
- T015, T016 [P] (different test concerns; both depend on T014 + T003).
- T017, T018 [P] (different files).
- T019, T020 sequential (T020 imports component referenced in T019's tab id).

### Within Phase 3 (US1)

- T021, T022, T023 [P] (different test files).
- T024, T025 [P] (different component files).
- T026 depends on T025.
- T027 standalone but depends on T024 (icon picker).
- T028 depends on T026 + T027 + T017 (the hook).

### Within Phase 4 (US2)

- T029, T030, T031 [P] (different test files).
- T032 standalone (one file).
- T033 depends on T032 (no remaining importers).
- T034 standalone (independent file).
- T035 depends on T032 + T034 (renamed files exist).
- T036 depends on T032 (knows what was removed).

### Within Phase 5 (US3)

- T037, T038 [P] (extend same test file but different `describe` blocks; treat as effectively parallel — write together).
- T039 depends on T026 (US1's PromptList).
- T040 depends on T027 (US1's PromptEditor).
- T041 depends on T039 + T040 + T028.

### Parallel Opportunities

- All [P] tasks within a phase can run concurrently when staffed by separate workers.
- US1 and US2 can be developed in parallel after Foundational. US3 must wait for US1.
- All Phase 6 tasks except T047/T048 are read-only/CI checks and parallel.

---

## Parallel Example: Phase 2 Foundational kickoff

```bash
# Launch in parallel after T001-T002 done:
Task T003: "Add Rust types Prompt/PromptKind/BuiltinId/PromptLibrary in src-tauri/src/ai/prompts.rs"
Task T004: "Add TS types in src/types/ai.ts"
Task T005: "Add BUILTIN_PROMPT_DEFAULTS in src-tauri/src/ai/prompts.rs"
Task T017: "Add usePromptLibrary hook in src/hooks/usePromptLibrary.ts"
Task T018: "Add BUILTIN_DEFAULTS_UI in src/lib/prompts/builtins.ts"
```

## Parallel Example: US1 components

```bash
# Launch in parallel after T024:
Task T025: "PromptRow.tsx"
Task T021: "PromptList.test.tsx"
Task T022: "PromptEditor.test.tsx"
Task T023: "PromptsSection.test.tsx"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Setup (Phase 1) — small, ~30min.
2. Foundational (Phase 2) — types, migration, cmds, sidebar wiring. ~1 day.
3. US1 (Phase 3) — Prompts tab UI for editing built-ins. **MVP: edit-prompt friction is gone.**
4. STOP. Validate manually with quickstart.md sections "Migration smoke test" + "User Story 1". Decide whether to ship MVP standalone or include US2.

### Incremental Delivery

- Foundational complete → STT/LLM Models still render via stale wiring (broken intermediate state — don't ship from here).
- + US1 → Prompts tab works. LLM/STT Models still labelled wrong but functional. Could ship if you tolerate the rename lag.
- + US2 → Labels and surfaces correct. Ship.
- + US3 → Custom prompts unlocked. Ship.

### Solo Strategy (recommended for this fork)

Sequential by phase. Within Phase 2 + Phase 3, exploit [P] markers for fast turnaround on different files. Verify tests green at every checkpoint; do not let red CI accumulate.

---

## Notes

- `[P]` = different files, no incomplete deps.
- `[Story]` = US1 / US2 / US3 mapping back to spec.md.
- Each user story has an Independent Test from spec.md — run it at the phase checkpoint before moving on.
- Constitution Principle IV: `pnpm lint && pnpm typecheck && pnpm test` and `cargo test` MUST be green before merge. T043–T046 enforce this in Polish.
- Out of scope (`follow-ups.md`): FU-1 legacy store-key cleanup, FU-2 feature-002 cycler contract.
