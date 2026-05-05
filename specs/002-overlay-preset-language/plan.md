# Implementation Plan: Overlay Preset & Language Toggles

**Branch**: `002-overlay-preset-language` | **Date**: 2026-05-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-overlay-preset-language/spec.md`

## Summary

Add keyboard-driven, overlay-visible cycling for two axes — formatting prompt and spoken language — without disturbing any other part of the dictation pipeline. Users bind two new global hotkeys: one cycles the active formatting prompt through the four built-in prompts (`builtin:default → builtin:prompts → builtin:email → builtin:commit → wrap`); the other cycles the active spoken language through an enabled-languages set chosen in Models → Spoken Language. The on-screen pill (`RecordingPill.tsx`) gains two optional bubbles — preset name and ISO language code — laid out either right of the audio dots or below them. When the pill is hidden (`pill_indicator_mode = never`), pressing either cycle hotkey briefly surfaces it for ~1.5 s, then auto-hides without mutating the user's stored preference.

The cycle-prompt hotkey writes to the **same** prompt-library Tauri commands the Prompts tab uses (`get_active_prompt` / `set_active_prompt`), keeping a single source of truth post-003. Per `specs/003-settings-tab-restructure/follow-ups.md` § FU-2 (resolved 2026-05-05 → **Option B**), the cycler operates on `active_prompt_id` strings directly rather than translating through the legacy `EnhancementPreset` enum. The cycle ring is intentionally limited to the four built-ins for this feature; widening it to include user-authored custom prompts is a future-feature concern.

## Technical Context

**Language/Version**: Rust (stable, edition 2021, pinned via `rust-toolchain.toml`); TypeScript 5.x (strict); React 19; Tailwind CSS v4
**Primary Dependencies**: Tauri v2; `tauri-plugin-global-shortcut` (already in tree); `tauri-plugin-store` (already in tree); shadcn/ui components; framer-motion (already used by `RecordingPill`); `@tauri-apps/api/event`; vitest + Testing Library (frontend); `cargo test` (backend)
**Storage**: Existing `tauri-plugin-store` files. Two stores touched:
- `settings.bin` (already used) — the seven feature-local fields are added to `Settings` / `AppSettings`: `enabled_languages`, `cycle_preset_hotkey`, `cycle_language_hotkey`, `pill_show_preset`, `pill_show_language`, `pill_extras_layout`, plus the existing `language` field re-purposed as "active member of the enabled set."
- `ai.bin` (already used; the prompt-library blob added by 003) — the cycler reads/writes `active_prompt_id` here via `get_active_prompt` / `set_active_prompt`.

**Testing**: `pnpm test --run` (vitest, jsdom environment); `cargo test --lib --manifest-path src-tauri/Cargo.toml`. Frontend tests assert rendered labels and event-driven re-renders; backend tests cover the pure cycle helpers (`next_active_prompt_id`, `next_language`, `is_english_only_model`) and the `Settings` normalisation paths (multi-language enabled set, hotkey conflict, layout coercion).
**Target Platform**: macOS 13+ (Apple Silicon + Intel). Windows-specific upstream code paths must keep compiling (`cargo check`) but are not manually tested in this fork (per constitution § Technology & Compliance Constraints).
**Project Type**: Desktop application (Tauri v2; Rust backend + React frontend bundled via Vite).
**Performance Goals**: Overlay updates within 200 ms of a cycle keypress (SC-001, SC-002); the cycler does no work on the audio hot path. Hotkey registration / re-registration runs on the existing async-runtime worker.
**Constraints**: Hot paths (audio capture, model inference, text insertion) stay in Rust (constitution § III). No new outbound network calls (constitution § II). No new npm or cargo dependencies (the cycle is one event listener and one new pure module — see `cycle_actions.rs`). New TypeScript code is strict, no `any` introductions; new Rust code is warnings-clean (constitution § IV).
**Scale/Scope**: Adds ~12 frontend files (component edits + 1 new test) and ~5 Rust files (`recording/cycle_actions.rs`, `tests/cycle_actions.rs`, plus targeted edits in `recording/hotkeys.rs`, `commands/settings.rs`, `state/app_state.rs`, `window_manager.rs`). The cycle ring is fixed at 4 built-in prompts; the enabled-languages set is bounded by the ~50 ISO codes whisper/parakeet support.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Upstream Fidelity**: **Complies.** Every change is a fork-local addition behind a sane default (cycle hotkeys default unbound; both overlay extras default off; enabled set defaults to the existing single `language`). No upstream files renamed, moved, or broadly reformatted. The new pure module `recording/cycle_actions.rs` lives alongside existing fork-local code; the Rust hotkey dispatch in `recording/hotkeys.rs` is extended with two `else if` branches (additive). Migration is non-existent — the feature is purely additive on the persisted shape (SC-006).

- **II. Privacy & Offline-First**: **Complies.** No new outbound network calls. The cycler reads/writes the local prompt-library and settings stores only. The Whisper / Parakeet language hint is a **local** parameter to the offline transcriber; cycling it does not reach any cloud service. Cloud STT engines (Soniox, OpenAI-compat) treat the language code the same way they do today — they remain user-opt-in.

- **III. Native Performance & Lean Dependencies**: **Complies.** Audio capture, inference, and text insertion remain in Rust untouched. The cycle dispatch reuses `tauri::async_runtime::spawn` (already in tree). No new npm dependency: the overlay re-uses the existing `@tauri-apps/api/event::listen` and the existing framer-motion-based pill geometry. No new cargo dependency: `next_active_prompt_id` and `next_language` are ~30 lines of pure Rust over types already in `ai/prompts.rs`. The cycle handler does **not** call into the audio runtime; it only writes the prompt store and emits a Tauri event.

- **IV. Type Safety & Quality Gates**: **Complies.** New TS code is strict; no `any` introduced (the event-listener payload uses an inline `{ id: string; label?: string }` literal). New Rust code is warnings-clean and uses no `#[allow(...)]`. The `pnpm lint && pnpm typecheck && pnpm test --run` and `cargo test --lib` gates are all run end-to-end as part of this feature's merge process. UI changes (overlay bubbles, layout toggle, multi-language UI in `LanguageSelection`) are covered by component tests in `RecordingPill.test.tsx`, `STTModelsSection.languages.test.tsx`, and `GeneralSettings.recording-indicator.test.tsx`.

- **V. Personal-Use Disclosure**: **N/A.** No public-facing copy is added or modified. README, About section, and release surfaces are untouched. The feature is internal-UI only.

**Result**: All five principles pass. No entries required in the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/002-overlay-preset-language/
├── plan.md                    # This file
├── spec.md                    # Feature specification (ratified; 2 Clarification sessions)
├── research.md                # Phase 0 — technical decisions, refreshed for FU-2 Option B
├── data-model.md              # Phase 1 — persisted shape (Settings + prompt library link)
├── quickstart.md              # Phase 1 — manual verification walkthrough
├── contracts/
│   └── ipc-commands.md        # Phase 1 — Tauri commands + emitted events
├── checklists/
│   └── requirements.md        # Author-checked review checklist
└── tasks.md                   # Phase 2 (/speckit-tasks) — already on disk; refreshed alongside this re-plan
```

### Source Code (repository root)

```text
src/
├── App.tsx                                            # Top-level cycle-language-noop toast listener
├── components/
│   ├── RecordingPill.tsx                              # Overlay bubbles (preset / language) + flash-on-cycle
│   ├── RecordingPill.test.tsx                         # Pill tests — assert active-prompt-changed event flow
│   ├── LanguageSelection.tsx                          # Multi-select control + active-language radio
│   └── sections/
│       ├── GeneralSettings.tsx                        # Layout + show-preset / show-language toggles
│       ├── STTModelsSection.tsx                       # Renamed by 003; hosts LanguageSelection multi-select
│       └── __tests__/
│           ├── GeneralSettings.recording-indicator.test.tsx
│           └── STTModelsSection.languages.test.tsx     # Multi-language enabled-set UI
├── contexts/
│   └── SettingsContext.tsx                            # New AppSettings keys plumbed
├── hooks/
│   └── usePromptLibrary.ts                            # Listens to active-prompt-changed → re-syncs Prompts tab
├── lib/
│   └── hotkey-conflicts.ts                            # New cycle hotkeys join the conflict matrix
└── types.ts                                            # AppSettings additions

src-tauri/
├── src/
│   ├── recording/
│   │   ├── cycle_actions.rs                           # NEW — pure helpers (next_active_prompt_id, next_language)
│   │   ├── hotkeys.rs                                  # Dispatches the two new shortcuts
│   │   └── mod.rs                                      # Re-export
│   ├── state/
│   │   └── app_state.rs                                # Two new Mutex<Option<Shortcut>> slots
│   ├── commands/
│   │   └── settings.rs                                 # Settings shape + normalize_overlay_and_languages
│   ├── window_manager.rs                               # Sized-to-content pill geometry for the new bubbles
│   └── tests/
│       └── cycle_actions.rs                            # Frontline cycle-helper tests
```

**Structure Decision**: Tauri v2 desktop-app layout (single project; backend in `src-tauri/`, frontend in `src/`). The new pure logic module `cycle_actions.rs` is intentionally side-effect-free so it can be unit-tested without booting Tauri; the dispatch glue in `hotkeys.rs` is the only place `tauri::AppHandle` enters the cycle path. This mirrors the `escape_handler` module already in `recording/`.

## Complexity Tracking

> Constitution Check passes for all five principles; no row required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| —         | —          | —                                   |
