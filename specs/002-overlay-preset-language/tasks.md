# Tasks: Overlay Preset & Language Toggles

**Feature Branch**: `002-overlay-preset-language`
**Input**: Design documents from `/specs/002-overlay-preset-language/`
**Prerequisites**: `plan.md` (loaded), `spec.md` (loaded), `research.md` (loaded), `data-model.md` (loaded), `contracts/ipc-commands.md` (loaded), `quickstart.md` (loaded)

## Summary

Add two keyboard-cyclable axes — formatting preset and spoken language — surfaced on the existing `RecordingPill` overlay, by appending 7 fields to `Settings`/`AppSettings`, registering 2 new global shortcuts, and emitting 3 new Tauri events. Zero new dependencies; all changes are additive to existing files except for one new test file.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no in-phase dependency)
- **[Story]**: User story label (`[US1]` / `[US2]` / `[US3]`) — only on user-story-phase tasks
- All file paths are absolute or repo-rooted (e.g. `src-tauri/src/commands/settings.rs`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing dev environment is ready. This feature adds zero new runtime dependencies, so setup is a single sanity check.

- [X] T001 Verify dev environment by running `pnpm install`, `pnpm typecheck`, `pnpm test`, and `cd src-tauri && cargo test` from the repository root; record any pre-existing failures so they can be distinguished from new ones introduced by this feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the shared `Settings` schema (Rust + TS) and its validation. **Both US1 and US2 depend on this layer**; no user-story phase may start until Phase 2 is complete.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Append the seven new fields with defaults (`enabled_languages: Vec<String>` default `vec!["en"]`, `cycle_preset_hotkey: Option<String>` default `None`, `cycle_language_hotkey: Option<String>` default `None`, `pill_show_preset: bool` default `false`, `pill_show_language: bool` default `false`, `pill_extras_layout: String` default `"right"`) to the `Settings` struct and its `Default` impl in `src-tauri/src/commands/settings.rs`, per `data-model.md` § "Persisted state."
- [X] T003 [P] Append the matching seven optional fields (`enabled_languages?: string[]`, `cycle_preset_hotkey?: string`, `cycle_language_hotkey?: string`, `pill_show_preset?: boolean`, `pill_show_language?: boolean`, `pill_extras_layout?: 'right' | 'below'`) to `AppSettings` in `src/types.ts`, keeping snake_case keys in lockstep with the Rust struct per `contracts/ipc-commands.md` § "Settings shape."
- [X] T004 In `src-tauri/src/commands/settings.rs::set_settings`, add backend validation that (a) resets `enabled_languages` to `vec!["en"]` if empty, (b) resets `language` to `enabled_languages[0]` if `language` is not in `enabled_languages`, and (c) coerces `pill_extras_layout` to `"right"` if it is neither `"right"` nor `"below"` (per `data-model.md` § "Validation rules"). Depends on T002.
- [X] T005 In `src-tauri/src/commands/settings.rs::Settings::default` (or first-read migration path), if a user upgrades and has the existing `language` set but no `enabled_languages` key, bump `enabled_languages` to `vec![<existing language>]` rather than `vec!["en"]` so a German-only user does not silently land on English (per `contracts/ipc-commands.md` § "Backwards compatibility"). Depends on T002.
- [X] T006 [P] Extend `src-tauri/src/tests/settings_commands.rs` with serde round-trip tests for the new fields: a default `Settings` serialises with `enabled_languages = ["en"]`, both cycle hotkeys = `None`, both pill toggles = `false`, layout = `"right"`; a `Settings` JSON missing the new keys deserialises to those same defaults; a `Settings` with `enabled_languages = ["en", "de"]` round-trips byte-for-byte. Depends on T002.
- [X] T007 [P] Extend `src-tauri/src/tests/settings_commands.rs` with `set_settings` validation tests: empty `enabled_languages` is reset to `["en"]`; `language = "fr"` while `enabled_languages = ["en", "de"]` is reset to `"en"`; an unknown `pill_extras_layout` value is coerced to `"right"`. Depends on T004.

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Cycle formatting preset from the keyboard (Priority: P1) — MVP

**Story goal**: A user binds the cycle-preset hotkey, presses it, and the active formatting preset advances `Default → Prompts → Email → Commit → Default` with the overlay updating within 200 ms; the next dictation uses the new preset.

**Independent test**: With the app running and the preset toggle hotkey bound, press the hotkey four times; the overlay's preset label cycles through the four values and returns to Default; the Enhancements UI reflects the same value (single source of truth via the existing `ai` store). Verifiable without any language work.

**Acceptance criteria pointer**: spec.md § US1 AS1–AS5; FR-001, FR-002, FR-008, FR-009, FR-013; SC-001.

### Backend — cycle-preset shortcut, dispatch, event

- [X] T008 [US1] Add `cycle_preset_shortcut: Mutex<Option<Shortcut>>` to `AppState` (or wherever `recording_shortcut` / `ptt_shortcut` are stored — grep for the existing slots in `src-tauri/src/lib.rs` and the recording module) so the parsed shortcut is held for fast equality comparison in the global-shortcut callback (per `data-model.md` § "Runtime state — Backend").
- [X] T009 [US1] In `src-tauri/src/lib.rs` (around the existing `tauri-plugin-global-shortcut` builder near line 214 where `recording_shortcut` is registered), parse `Settings.cycle_preset_hotkey` on startup and on settings change, register it via the same builder, and store the parsed `Shortcut` into `AppState.cycle_preset_shortcut`. On registration failure, emit `hotkey-registration-failed` (existing event, reused). Depends on T008.
- [X] T010 [US1] In `src-tauri/src/recording/hotkeys.rs::handle_global_shortcut`, add a new arm that matches `cycle_preset_shortcut` and spawns an async task that (a) reads the current `enhancement_options.preset` via the existing `get_enhancement_options` code path, (b) advances it forward through `Default → Prompts → Email → Commit → Default` (per `data-model.md` § "Active preset cycle"), (c) writes the new preset back via the existing `update_enhancement_options` command, and (d) emits a Tauri `active-preset-changed` event with payload `{ preset: <new> }` (per `contracts/ipc-commands.md` § "Net new" events). Depends on T009.
- [X] T011 [US1] Add a unit test in `src-tauri/src/tests/settings_commands.rs` (or a new `src-tauri/src/tests/cycle_actions.rs`) that exercises the preset-cycle pure logic: given current preset `Default`, the `next_preset` helper returns `Prompts`; `Commit` wraps to `Default`; full round of four presses returns to start. Depends on T010.

### Frontend — listener + overlay label + flash + Enhancements sync

- [X] T012 [US1] In `src/components/RecordingPill.tsx`, add a `useEffect` that subscribes to the new Tauri `active-preset-changed` event (using the existing `@tauri-apps/api/event` `listen` import), updates a local `activePreset: EnhancementPreset` state on each emission, and renders the preset name as a label after `<AudioDots>` when `pill_show_preset === true`. Depends on T010 (event must be emitted).
- [X] T013 [US1] In `src/components/RecordingPill.tsx`, add a `forceShow: boolean` local state plus a `setTimeout` (1500 ms) that flips it to `true` for 1.5 s when an `active-preset-changed` event arrives while `pill_indicator_mode === "never"`, then auto-clears it; update the visibility predicate to `mode !== "never" || pillState !== "idle" || forceShow`. The persisted `pill_indicator_mode` must NOT be written by this code (per `research.md` R-005, FR-008, SC-004). Depends on T012.
- [X] T014 [US1] In `src/components/sections/GeneralSettings.tsx`, add a "Cycle preset hotkey" row using the existing hotkey-input component pattern (mirror `hotkey` and `ptt_hotkey`), wired to `cycle_preset_hotkey` in `AppSettings`. Run the input through the existing `lib/hotkey-conflicts.ts` checks against `hotkey`, `ptt_hotkey`, and `cycle_language_hotkey` (FR-012).
- [X] T015 [US1] In `src/components/sections/GeneralSettings.tsx`, add a "Show preset on overlay" toggle row wired to `pill_show_preset` in `AppSettings`, placed inside the existing "Recording Indicator" group immediately after `pill_indicator_offset` per `research.md` R-006.
- [X] T016 [US1] Confirm that the existing Enhancements UI (`src/components/sections/EnhancementsSection.tsx`) reads `enhancement_options.preset` reactively after the cycle event is emitted; if it does not already re-fetch on change, add a listener in `src/components/sections/EnhancementsSection.tsx` for `active-preset-changed` that refreshes its internal preset state, so both surfaces stay in lockstep (FR-001, single source of truth). Depends on T010.

### Tests — US1

- [X] T017 [P] [US1] Extend `src/components/RecordingPill.test.tsx` to cover (a) preset label renders only when `pill_show_preset === true`; (b) label updates on receipt of an `active-preset-changed` event (mock the `listen` call); (c) when `pill_indicator_mode === "never"` and a cycle event fires, the pill becomes visible for ~1500 ms then hides again. Depends on T012, T013.
- [X] T018 [P] [US1] Extend `src/components/sections/__tests__/GeneralSettings.recording-indicator.test.tsx` to cover the new "Cycle preset hotkey" input row and the "Show preset on overlay" toggle: rendering, default values, and that conflict detection rejects a binding equal to `hotkey` / `ptt_hotkey`. Depends on T014, T015.
- [ ] T019 [US1] Story-level integration verification: run through `quickstart.md` § 2 ("Cycle preset hotkey") manually in `pnpm tauri dev`; confirm the four-step cycle, 200 ms latency (SC-001), Enhancements-UI reflection of the cycled preset, and persistence across an app restart.

**Checkpoint**: After this phase, US1 is fully shippable as the MVP. The cycle hotkey works, the overlay shows the preset, the Enhancements UI stays in sync, and the change persists across restarts. Stop here to demo / merge if desired.

---

## Phase 4: User Story 2 — Choose multiple spoken languages and cycle between them (Priority: P1)

**Story goal**: Multilingual users mark several languages enabled in Models → Spoken Language and cycle the active one with a hotkey; the overlay shows the active ISO code; English-only models gate the cycle with a non-disruptive toast.

**Independent test**: Enable English + German, bind the cycle-language hotkey, press it; the overlay flips between `en` and `de` (and back); each dictation uses the active language. Switch to a `*.en` model and confirm the cycle is a no-op with a toast. Verifiable without preset work.

**Acceptance criteria pointer**: spec.md § US2 AS1–AS5; FR-003, FR-004, FR-005, FR-010, FR-011; SC-002, SC-003, SC-005.

### Backend — cycle-language shortcut, dispatch, gate, events

- [X] T020 [US2] Add `cycle_language_shortcut: Mutex<Option<Shortcut>>` to the same `AppState` slot file used in T008 (per `data-model.md` § "Runtime state — Backend").
- [X] T021 [US2] In `src-tauri/src/lib.rs` (same builder block as T009), parse `Settings.cycle_language_hotkey` on startup and on settings change, register it, and store the parsed `Shortcut` into `AppState.cycle_language_shortcut`. Reuse the `hotkey-registration-failed` failure path. Depends on T020.
- [X] T022 [US2] In `src-tauri/src/recording/hotkeys.rs::handle_global_shortcut`, add a new arm that matches `cycle_language_shortcut` and spawns an async task that: (a) if `enabled_languages.len() <= 1`, emits `cycle-language-noop { reason: "single_language" }` and returns; (b) reads `Settings.current_model` + `Settings.current_model_engine` and applies the same English-only predicate `ModelsSection.tsx::isEnglishOnlyModel` uses (Whisper `*.en` regex, Parakeet `-v2` substring) — if the model is English-only, emit `cycle-language-noop { reason: "english_only_model" }` and return; (c) otherwise advance `Settings.language` to the next entry in `enabled_languages` (forward with wrap), persist via `set_settings`, and emit `active-language-changed { language: <new> }`. Depends on T021.
- [X] T023 [US2] Add unit tests in `src-tauri/src/tests/settings_commands.rs` (or `cycle_actions.rs`) for the language-cycle pure logic: `[en, de, fr]` advances `en → de → fr → en`; `[en]` produces a `single_language` no-op; with `current_model = "ggml-base.en"` and `enabled_languages = ["en", "de"]`, the action produces an `english_only_model` no-op and `Settings.language` stays `"en"` (SC-005). Depends on T022.

### Frontend — types, multi-select control, ModelsSection, GeneralSettings, RecordingPill

- [X] T024 [P] [US2] In `src/components/LanguageSelection.tsx`, replace the single-select dropdown with a multi-select control built on the existing shadcn `Command` + `Popover` primitives (per `research.md` R-004): allow checking multiple ISO codes; mark exactly one entry as active via a radio-style indicator + checkmark; collapse to a visually single-row layout when `enabled_languages.length === 1` (zero-behavior-change for monolingual users — SC-003); when an English-only model is active, disable non-EN rows.
- [X] T025 [US2] In `src/components/sections/ModelsSection.tsx`, pass `enabledLanguages: string[]`, `activeLanguage: string`, `onEnabledChange(next: string[])`, and `onActiveChange(code: string)` props down to `LanguageSelection`. Wire the handlers through `set_settings` so changes persist. On remove-language: if the removed code equals the active language, fall back to the first remaining enabled language (or `"en"` and reset enabled set per FR-010). Depends on T024.
- [X] T026 [P] [US2] In `src/components/sections/GeneralSettings.tsx`, add a "Cycle language hotkey" row using the existing hotkey-input component pattern, wired to `cycle_language_hotkey`, validated against `hotkey`, `ptt_hotkey`, and `cycle_preset_hotkey` via `lib/hotkey-conflicts.ts` (FR-012).
- [X] T027 [P] [US2] In `src/components/sections/GeneralSettings.tsx`, add a "Show language on overlay" toggle row wired to `pill_show_language`, placed inside the existing "Recording Indicator" group adjacent to the `pill_show_preset` row from T015.
- [X] T028 [US2] In `src/components/RecordingPill.tsx`, add a `useEffect` that subscribes to both the new `active-language-changed` event AND the existing `language-changed` event (covers both the cycle path and the model-driven English-fallback path uniformly per `data-model.md` § "Runtime state — Frontend"); update a local `activeLanguage: string` state and render the lowercase ISO code as a label after `<AudioDots>` when `pill_show_language === true`. When both labels are visible, the order is `<lang-iso> · <Preset-Name>` with a middle dot (`·`) separator (FR-006, spec § Clarifications Q4). Depends on T012, T022.
- [X] T029 [US2] In `src/components/RecordingPill.tsx`, extend the `forceShow` flash logic from T013 to also fire on `active-language-changed` and on `cycle-language-noop` events, so a cycle attempt while `pill_indicator_mode === "never"` briefly surfaces the current state (FR-008, SC-004). Depends on T013, T028.
- [X] T030 [US2] Add a frontend listener — in either `src/App.tsx` or a top-level toast provider — for the `cycle-language-noop` event: on `reason === "english_only_model"` show the existing `sonner` toast "Active model is English-only — switch model in Models to use other languages."; on `reason === "single_language"` show a short feedback toast "Only one language enabled — add more in Models." (per `research.md` R-009). Depends on T022.

### Tests — US2

- [X] T031 [P] [US2] Create `src/components/sections/__tests__/ModelsSection.languages.test.tsx` covering the multi-select behaviour: adding a language extends the enabled set; removing the active language falls back to the first remaining entry (FR-010); removing the last language resets to `["en"]` with active = `"en"`; toggling the active marker updates `activeLanguage`; with `enabled_languages.length === 1` the control collapses to a single-row layout (SC-003); with an English-only model active, non-EN entries are disabled. Depends on T024, T025.
- [X] T032 [P] [US2] Extend `src/components/sections/__tests__/GeneralSettings.recording-indicator.test.tsx` to cover the new "Cycle language hotkey" input row and the "Show language on overlay" toggle: rendering, defaults, and conflict detection against the other three hotkeys. Depends on T026, T027.
- [X] T033 [P] [US2] Extend `src/components/RecordingPill.test.tsx` to cover (a) language ISO code renders only when `pill_show_language === true`; (b) label updates on `active-language-changed` AND on the existing `language-changed` event (covers the model-fallback path); (c) when both labels are shown, order is `[lang] · [Preset]` with middle-dot separator. Depends on T028.
- [ ] T034 [US2] Story-level integration verification: run through `quickstart.md` §§ 3 (multi-language enable + cycle), 4 (English-only model gate), and 9 (language removed mid-flight) manually in `pnpm tauri dev`; confirm SC-002 (200 ms label flip), SC-003 (monolingual user sees zero behavior change), SC-005 (English-only model locks overlay to `en`).

**Checkpoint**: After this phase, both US1 and US2 are independently functional. Multilingual cycling, English-only gating, and graceful fallback on language removal all work.

---

## Phase 5: User Story 3 — Choose where the preset and language labels appear on the overlay (Priority: P2)

**Story goal**: Users pick whether the new labels render to the right of the audio dots (single-line, pill widens) or below them (two-line, pill grows vertically).

**Independent test**: With both labels enabled and `pill_indicator_mode = "always"`, toggle `pill_extras_layout` between `"right"` and `"below"`; pill geometry updates immediately, labels stay legible, the underlying state cycling (US1, US2) is unaffected.

**Acceptance criteria pointer**: spec.md § US3 AS1–AS3; FR-006, FR-007; SC-007.

- [X] T035 [US3] In `src/components/RecordingPill.tsx`, switch the labels container between `flex-row` (with the middle-dot separator on a single line) and `flex-col` (labels stacked on a second line below the dots) based on `pill_extras_layout`; preserve the existing Framer Motion animation block, letting widths/heights grow naturally with content (per `plan.md` § "Frontend (TypeScript / React)"). Depends on T012, T028.
- [X] T036 [US3] In `src/components/RecordingPill.tsx`, ensure the "only one of the two labels enabled" case (preset-only or language-only) collapses correctly under both layouts — no empty placeholder, no orphan separator (US3 AS3). Depends on T035.
- [X] T037 [US3] In `src/components/sections/GeneralSettings.tsx`, add an "Indicator extras layout" radio-group row with options `"right"` and `"below"`, wired to `pill_extras_layout` in `AppSettings`; place it immediately below the two new "Show … on overlay" toggle rows in the "Recording Indicator" group.
- [X] T038 [P] [US3] Extend `src/components/RecordingPill.test.tsx` to cover (a) `pill_extras_layout = "right"` produces a single-line layout with `[dots] [lang] · [preset]`; (b) `pill_extras_layout = "below"` produces a two-line layout with dots on the first line and `[lang] · [preset]` on the second; (c) preset-only and language-only modes render without an orphan middle-dot under both layouts. Depends on T035, T036.
- [X] T039 [P] [US3] Extend `src/components/sections/__tests__/GeneralSettings.recording-indicator.test.tsx` to cover the new "Indicator extras layout" radio: default value `"right"`, switching to `"below"` writes `pill_extras_layout`. Depends on T037.
- [ ] T040 [US3] Story-level integration verification: run through `quickstart.md` § 6 (layout toggle) manually in `pnpm tauri dev`; confirm the pill geometry updates immediately at every supported `pill_indicator_position` and at a non-zero `pill_indicator_offset` (SC-007).

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting verification and cleanup. No new public-facing copy is added (per `plan.md` § Constitution Check V).

- [X] T041 [P] Run `pnpm typecheck` from the repository root and resolve any new TypeScript errors introduced by the seven `AppSettings` field additions or the new event listeners.
- [X] T042 [P] Run `pnpm lint` from the repository root and resolve any new ESLint warnings/errors introduced in `src/types.ts`, `src/components/RecordingPill.tsx`, `src/components/LanguageSelection.tsx`, `src/components/sections/ModelsSection.tsx`, and `src/components/sections/GeneralSettings.tsx`.
- [X] T043 [P] Run `pnpm test` from the repository root and confirm all updated and new vitest suites pass (`RecordingPill.test.tsx`, `GeneralSettings.recording-indicator.test.tsx`, `ModelsSection.languages.test.tsx`).
- [X] T044 [P] Run `cd src-tauri && cargo test` and confirm the extended `tests/settings_commands.rs` (and any new `tests/cycle_actions.rs`) all pass.
- [ ] T045 Run the full `quickstart.md` walkthrough end-to-end against `pnpm tauri dev`, including § 1 (first-launch unchanged — SC-006), § 5 (hidden-pill flash — SC-004), § 7 (both extras off — pre-feature byte-identical pill), and § 8 (hotkey conflict — SC-008). Capture any regressions and file follow-up tasks.
- [X] T046 If any agent docs in `agent-docs/` or `agent-reports/` describe the overlay or hotkey behaviours touched by this feature, append a one-paragraph note pointing at `specs/002-overlay-preset-language/` so the next session can pick up the context. Skip if no such doc exists (no proactive doc creation per CLAUDE.md).

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1. Blocks every user-story phase.
- **Phase 3 (US1)**: Depends on Phase 2. Independent of US2 and US3.
- **Phase 4 (US2)**: Depends on Phase 2. Independent of US1 — but several frontend tasks (`RecordingPill.tsx`, `GeneralSettings.tsx`) touch the same files US1 also edits, so if US1 and US2 are worked in parallel by separate developers, expect merge conflicts on those two files; serialise within those files.
- **Phase 5 (US3)**: Depends on Phase 2. Soft dependency on US1 + US2 since US3 only matters once at least one of the two labels exists; tasks T035, T036, T038 reference the label nodes added in T012 and T028.
- **Phase 6 (Polish)**: Depends on whichever user stories the team has decided to ship.

### Within each user-story phase

- Backend types / handlers / event emit before frontend listeners (frontend tests need the event names to be defined).
- Frontend types (`AppSettings` extension in T003) is a Phase 2 prerequisite, so US1/US2 frontend tasks can assume it.
- Tests come after the implementation they cover (the project's testing philosophy is user-focused integration tests, not strict TDD per `CLAUDE.md` § "Testing Philosophy").
- Story-level integration verification last.

### Per-task explicit blockers (where non-obvious)

- T004 → T002 (validation references the new fields)
- T005 → T002 (migration references the new fields)
- T006, T007 → T002, T004 (tests reference the schema + validation)
- T010 → T009 (handler arm needs the registered shortcut)
- T012 → T010 (frontend listener needs the event to be emitted)
- T013 → T012 (forceShow logic shares the same listener block)
- T016 → T010 (Enhancements sync listens to the same event)
- T022 → T021 (handler arm needs the registered shortcut)
- T025 → T024 (`ModelsSection` props rely on the new control)
- T028 → T012, T022 (the listener block is the same useEffect; ordering matters)
- T029 → T013, T028
- T030 → T022 (toast listener needs the `cycle-language-noop` event)
- T033 → T028
- T035, T036 → T012, T028 (layout switch wraps the label nodes)
- T038 → T035, T036
- T039 → T037

### Parallel opportunities

- **Phase 2**: T003 ([P]) runs in parallel with T002 (different files: `src/types.ts` vs `src-tauri/src/commands/settings.rs`). T006 and T007 ([P]) run in parallel after T002/T004.
- **Phase 3 (US1)**: T014 ([P], `GeneralSettings.tsx` hotkey row) runs in parallel with T009 ([P-able with caveat — same `lib.rs` file as T021 in US2]) since US2 is in a separate phase. T017 and T018 ([P]) run in parallel after their respective implementation tasks.
- **Phase 4 (US2)**: T024 ([P]) runs in parallel with T026 ([P]) and T027 ([P]) — three different files (`LanguageSelection.tsx`, two rows in `GeneralSettings.tsx` — but the two `GeneralSettings.tsx` rows touch the same file, so T026 and T027 must serialise within that file). T031, T032, T033 ([P]) run in parallel after their respective implementation tasks.
- **Phase 5 (US3)**: T038 ([P]) runs in parallel with T039 ([P]) — different test files.
- **Phase 6 (Polish)**: T041, T042, T043, T044 all run in parallel — independent commands.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# After T002 lands, run T003 immediately in parallel — different file, different language:
Task T003: "Append 7 fields to AppSettings in src/types.ts"

# After T002 + T004 land, run the two test tasks in parallel:
Task T006: "Settings serde round-trip tests in src-tauri/src/tests/settings_commands.rs"
Task T007: "set_settings validation tests in src-tauri/src/tests/settings_commands.rs"
# (Both touch the same file, so coordinate by adding distinct #[test] fns; treat as soft-parallel.)
```

## Parallel Example: Phase 4 (US2 frontend)

```bash
# After T020–T023 (backend) land, run these three frontend tasks in parallel:
Task T024: "Multi-select control in src/components/LanguageSelection.tsx"
Task T026: "Cycle language hotkey row in src/components/sections/GeneralSettings.tsx"
Task T027: "Show language on overlay toggle in src/components/sections/GeneralSettings.tsx"
# T026 and T027 touch the same file — serialise commits but the changes are disjoint rows.

# After T024–T030 land, run the test tasks in parallel:
Task T031: "ModelsSection.languages.test.tsx"
Task T032: "GeneralSettings.recording-indicator.test.tsx (extend)"
Task T033: "RecordingPill.test.tsx (extend)"
```

---

## Implementation Strategy

### Recommended MVP scope (Phase 1 + Phase 2 + Phase 3 = 19 tasks)

1. Complete Phase 1 (T001) — verify dev environment.
2. Complete Phase 2 (T002–T007) — schema + validation + tests. **CRITICAL — blocks US1 and US2.**
3. Complete Phase 3 (T008–T019) — US1 cycle-preset.
4. **STOP and validate**: walk through `quickstart.md` § 2 to confirm SC-001. Demo or merge.

US1 alone is a viable shipment for users who only use one language — the spec says so explicitly in the US1 priority rationale ("This slice alone is a viable MVP for users who only use one language").

### Incremental delivery

1. MVP (above) → Demo / merge.
2. Add US2 (Phase 4, T020–T034) → multilingual users get cycle-language. → Demo / merge.
3. Add US3 (Phase 5, T035–T040) → users get the layout toggle. → Demo / merge.
4. Polish (Phase 6, T041–T046) before final merge to `main`.

### Parallel team strategy

With two developers after Phase 2 is done:

- **Developer A**: Phase 3 (US1) — owns `RecordingPill.tsx` for the duration; lands all preset-cycle commits first.
- **Developer B**: Phase 4 (US2) — starts the backend tasks (T020–T023) in parallel, blocks on `RecordingPill.tsx` until Developer A merges T012/T013.
- Both developers reconvene for Phase 5 (US3) — the layout switch wraps the label nodes both stories have already added.

---

## Validation result

- Every task line begins with `- [ ]`. **PASS**
- Every task has a sequential `T###` ID (T001–T046). **PASS**
- Every user-story-phase task carries `[US1]` / `[US2]` / `[US3]`. Setup, Foundational, and Polish tasks carry no story label. **PASS**
- Every task references at least one explicit file path. **PASS**
- Foundational ordering: T002 (struct fields) → T004 (validation logic) → T006/T007 (tests). T003 ([P]) is independent. **PASS**
- Each user story is independently testable: US1 ships standalone (preset cycle works without language work); US2 ships standalone for multilingual users (language cycle works without preset work); US3 polishes the layout without changing state cycling. **PASS**
- Total task count: 46 — within the recommended 30–60 range for this file-touch scope. **PASS**

---

## Extension Hooks

**Optional Hook**: git
Command: `/speckit-git-commit`
Description: Auto-commit after task generation

Prompt: Commit task changes?
To execute: `/speckit-git-commit`
