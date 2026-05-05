# Phase 0 Research: Overlay Preset & Language Toggles

This document resolves every open technical question for the feature
before Phase 1 (data model + contracts). All five spec-level
clarifications are locked in `spec.md` § Clarifications (two sessions:
2026-05-04 + 2026-05-05); this file covers the *technical* unknowns
that surfaced while writing the plan.

## R-001: Where does the active formatting prompt persist after spec 003, and how does the cycler write to it?

- **Decision**: Reuse the new prompt-library Tauri commands
  `get_active_prompt` / `set_active_prompt` (introduced in spec 003).
  The cycler operates on the persisted **`active_prompt_id` string**
  directly — per `specs/003-settings-tab-restructure/follow-ups.md`
  § FU-2 **Option B**, ratified in `spec.md` § Clarifications session
  2026-05-05.
- **Rationale**: Spec 003 unified built-in formatting presets and
  user-authored custom prompts under a single `prompts` store with a
  single "active" surface (`active_prompt_id: string`). The cycle
  hotkey becomes a second writer of that same field, exactly as it
  was a second writer of `enhancement_options.preset` pre-003. This
  preserves the FR-001 single-source-of-truth promise post-003 and
  avoids carrying a permanent enum-vs-id shim. The cycle ring stays
  the four built-ins (`builtin:default → builtin:prompts →
  builtin:email → builtin:commit → wrap`); custom prompts are
  intentionally excluded for this feature so a user pressing the
  cycle hotkey while parked on a custom prompt jumps to
  `builtin:default` (slot 0).
- **Alternatives considered**:
  - *Option A — Thin shim: keep cycler reading/writing the legacy
    `EnhancementPreset` enum, translate enum ↔ id for built-ins on
    every read/write* — rejected. Two parallel "active" surfaces
    create drift risk; the cycler is permanently 4-built-ins-only
    even if a future feature would benefit from custom-prompt
    cycling. Smaller 002 diff but larger long-term cost.
  - *Add `Settings.active_preset` and dual-write* — rejected (still
    rejected pre-003 too). Three sources of truth, drift inevitable.
  - *Widen the cycle ring to all prompts (built-ins + custom)* —
    rejected for this feature. Would require additional UX
    decisions (ordering, opt-in per prompt, an "in cycle?" badge in
    the Prompts tab); legitimately a future feature concern.

  **Implementation specifics of Option B**:
    - Pure helper `cycle_actions::next_active_prompt_id(current: &str) -> String`
      walks the canonical built-in order. Falls back to
      `builtin:default` for any non-built-in input (custom id, empty
      string, garbage).
    - The Rust dispatch in `recording/hotkeys.rs::handle_cycle_preset_shortcut`
      reads `crate::commands::ai::get_active_prompt`, advances via
      `next_active_prompt_id`, persists via `set_active_prompt`, and
      emits `active-prompt-changed { id, label }` (a renamed
      replacement for the never-shipped `active-preset-changed`).
    - The frontend overlay (`RecordingPill`) seeds its label from
      `get_active_prompt` on mount and listens for
      `active-prompt-changed` to update. Built-in ids resolve to
      canonical labels via the `BUILTIN_LABELS` map; if a custom
      prompt ever ends up active mid-session (set from the Prompts
      tab), the pill renders the prompt's `name` field.
    - The Prompts tab's `usePromptLibrary` hook also listens for
      `active-prompt-changed` so the active-dot stays in sync when
      the cycle hotkey is pressed while the tab is open.

## R-002: How should the new global shortcuts be registered alongside the existing dictation + PTT hotkeys?

- **Decision**: Register in the same `tauri-plugin-global-shortcut`
  builder block in `src-tauri/src/lib.rs` (around line 214) where
  `recording_shortcut` and `ptt_shortcut` are registered today. The
  `handle_global_shortcut` dispatcher gets two additional arms that
  match on the new shortcut's parsed combination and call into the
  cycle logic.
- **Rationale**: The fork already centralises all global shortcuts
  through one plugin registration with one handler that dispatches
  by stored shortcut identity. Adding two more arms is the
  established pattern (the PTT-different-key codepath does exactly
  this). Reuses the existing failure-handling code (the "registration
  failed → emit `hotkey-registration-failed` event" path) for free.
- **Alternatives considered**:
  - *Use a separate plugin builder per shortcut* — rejected. The
    plugin only supports one builder per app instance.
  - *Use the Tauri menu accelerator path* — rejected. Menu
    accelerators don't fire when the app window is not focused; the
    spec requires cycling from anywhere (US1 AS1: "while the app is
    in focus or in the background").

## R-003: Cycle direction — forward only, or also backward?

- **Decision**: Forward only. The cycle hotkey advances to the next
  entry; reaching the end wraps to the start.
- **Rationale**: Four presets means worst-case 3 keypresses to reach
  the farthest preset — bounded and acceptable. N enabled
  languages will rarely exceed 3-4 in practice. Adding a "cycle
  backward" hotkey doubles the keybinding count and conflict surface
  for marginal gain. The user did not request bidirectional cycling
  and the spec phrasing ("advances to the next entry") implies
  forward-only.
- **Alternatives considered**:
  - *Add Shift+hotkey = reverse* — rejected. The
    `tauri-plugin-global-shortcut` plugin treats shortcuts as a
    single unit; teaching it about modifier-extension would mean
    parsing/registering twice. Defer until users ask.
  - *Bind reverse cycle as a separate hotkey (4 hotkeys total)* —
    rejected for now; can be added without breaking changes if
    requested later.

## R-004: How should monolingual users experience the multi-select?

- **Decision**: When `enabled_languages.len() == 1`, the multi-select
  control visually collapses to a single-row layout that looks
  identical to the existing single-select dropdown. Adding a second
  language switches the control into a chip / row list.
- **Rationale**: Spec § Clarifications Q2 commits to "monolingual
  users keep a 1-entry list with zero visible behavior change."
  Implementation-wise, this is a CSS-only branch on the existing
  shadcn `Command` + `Popover` primitives the LanguageSelection
  already uses; no new component library.
- **Alternatives considered**:
  - *Two separate UIs (single-select for n=1, multi-select for n>1)*
    — rejected. Two render paths to maintain, more test surface,
    surprising UX when crossing the boundary.
  - *Always show multi-select, even at n=1* — rejected. Adds a
    "this list has one item" affordance to users who never enable
    a second language; behavior-change is non-zero (failing SC-003).

## R-005: How does the overlay flash when `pill_indicator_mode = "never"`?

- **Decision**: Add a local `forceShow: boolean` state in
  `RecordingPill.tsx` that is set true for 1.5 s when an
  `active-preset-changed` or `active-language-changed` event arrives
  while the persisted mode is `"never"`. The pill's visibility
  predicate becomes `mode !== "never" || pillState !== "idle" ||
  forceShow`. The persisted `pill_indicator_mode` is never written
  by this code.
- **Rationale**: Spec FR-008 + SC-004 require the flash without
  mutating user preference. A local state variable is the minimum
  diff and satisfies both the "briefly appear ~1.5 s" and
  "auto-hide" requirements with a single `setTimeout`.
- **Alternatives considered**:
  - *Temporarily mutate `pill_indicator_mode` via the settings store
    and revert in 1.5 s* — rejected. Risk of leaving the user's
    setting changed if the timer is interrupted (app backgrounded
    during macOS App Nap, etc.).
  - *Toast notification instead of pill flash* — rejected. The user
    explicitly wanted the **pill** to surface the change; toasts
    are a separate UI surface.

## R-006: Where do `pill_show_preset`, `pill_show_language`, and `pill_extras_layout` live in settings UI?

- **Decision**: Add them to the existing
  `GeneralSettings.tsx` "Recording Indicator" group, immediately after
  the existing `pill_indicator_position` and `pill_indicator_offset`
  controls. The two new hotkeys go into the same section as the
  existing `hotkey` and `ptt_hotkey` entries.
- **Rationale**: Mirrors the established mental grouping ("indicator
  visuals" + "hotkeys"). The corresponding test file already exists
  (`__tests__/GeneralSettings.recording-indicator.test.tsx`) and
  extending it is straightforward.
- **Alternatives considered**:
  - *New "Overlay" settings sidebar entry* — rejected. Three new rows
    don't justify a new top-level section.
  - *Per-feature subsection (formatting + transcription)* — rejected.
    The cycle hotkeys are global UX bindings, not per-pipeline
    settings; they belong with the existing hotkey block.

## R-007: How are `Action::CyclePreset` and `Action::CycleLanguage` dispatched from the existing global-shortcut handler?

- **Decision**: Store the parsed `Shortcut` value for each new hotkey
  in the existing `AppState` alongside `recording_shortcut` and
  `ptt_shortcut`. In `handle_global_shortcut`, after the
  recording/PTT match arms, add two more equality checks; on match,
  spawn an `tauri::async_runtime::spawn` task that mutates the
  store and emits the corresponding event. Tauri's plugin already
  guarantees the handler runs off the main UI thread, so synchronous
  store I/O is acceptable.
- **Rationale**: Same dispatch pattern the dictation handler uses;
  no new infrastructure. Async-spawning the mutation prevents
  blocking the global-shortcut callback if the store I/O is slow.
- **Alternatives considered**:
  - *Bypass `AppState` and look the shortcut up in the store on every
    callback* — rejected. Adds latency and breaks the
    `recording_shortcut` precedent.
  - *Use Tauri commands invoked from the frontend on a custom
    keyboard handler* — rejected. A frontend handler can't observe
    keystrokes when the app is in the background; spec US1 AS1
    requires that case.

## R-008: Is the active language passed to Whisper / Parakeet / Soniox by the existing pipeline already, or does this feature need to wire it through?

- **Decision**: The existing pipeline already reads `Settings.language`
  on every transcription request (see `commands/stt.rs` and
  `whisper/manager.rs`). No wiring change required — this feature
  only mutates the persisted value, the read side is unchanged.
- **Rationale**: Verified via `grep`: `Settings.language` is the
  single source of truth, set by `set_settings` and read by the STT
  command on each invocation. The cycle hotkey writes that field; the
  next dictation picks it up on its next read. FR-009's
  "in-flight uses start-time value" property is automatic — the
  read happens once when recording starts.
- **Alternatives considered**:
  - *Pass active language as a parameter through the recording
    pipeline* — rejected. Would require touching the recording state
    machine, the audio capture, and the model invocation. Out of scope
    and introduces upstream divergence.

## R-009: How does FR-011 (English-only model + cycle-language no-op + toast) get implemented end-to-end?

- **Decision**: The cycle-language Rust handler reads
  `Settings.current_model` + `Settings.current_model_engine`, applies
  the same "is English-only?" predicate that
  `ModelsSection.tsx::isEnglishOnlyModel` already uses (Whisper
  `*.en` regex, Parakeet `-v2` substring), and short-circuits to
  emitting a `cycle-language-noop` event with a reason payload
  (`"english_only_model"`). The frontend listens, shows a toast via
  the existing `sonner` stack ("Active model is English-only — switch
  model in Models to use other languages."), and does not mutate
  `Settings.language`.
- **Rationale**: Mirrors the predicate already implemented in TS,
  ensuring the overlay and the cycle behavior agree. Reuses the
  existing toast stack; no new UI surface.
- **Alternatives considered**:
  - *Move the predicate to the backend and have the frontend read
    it* — rejected. The predicate already exists on both sides
    (it's a tiny check), and duplicating it follows the existing
    project convention.
  - *Silently skip non-EN entries in the cycle* — rejected by
    spec § Clarifications Q3=B; a no-op + toast was explicitly
    chosen for predictability.

## R-010: Does FR-008's "briefly auto-show" affect the recording pipeline?

- **Decision**: No. The `forceShow` state is local to
  `RecordingPill.tsx` and does not gate or influence the
  recording state machine. The audio dots animation is the same
  regardless of why the pill is rendered (recording, formatting, or
  forced-by-cycle).
- **Rationale**: Constitution III requires hot paths stay in Rust;
  this is a UI-only flash. The `RecordingPill` already accepts
  multiple causes for visibility (`mode === "always"`,
  `pillState !== "idle"`); adding a third is a single boolean OR.
- **Alternatives considered**: None — this was the only
  reasonable design.

---

**All NEEDS CLARIFICATION items resolved.** Proceed to Phase 1.
