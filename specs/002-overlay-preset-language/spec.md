# Feature Specification: Overlay Preset & Language Toggles

**Feature Branch**: `002-overlay-preset-language`
**Created**: 2026-05-04
**Status**: Draft
**Input**: User description: "I want to have two new options in the on-screen overlay and toggle both via hotkey: (1) the formatting preset (default, prompts, email, commit) for a message, shown next to the recording dots; (2) the input language toggle, with available languages picked in Models → Spoken Language. When more than 1 language is enabled, the hotkey can cycle. In options I want a toggle to show the language (as ISO code) and the preset, either to the right of the existing indicator dots or below them."

## Context: the existing surfaces this feature touches

VoiceTypr's on-screen overlay today is a single black pill rendered by
`RecordingPill.tsx`, containing only animated audio dots that reflect
the recording state (idle / listening / transcribing / formatting). The
overlay's visibility is controlled by `pill_indicator_mode`
(`never` / `always` / `when_recording`), with screen position and
offset configurable separately.

The four formatting presets — **Default**, **Prompts**, **Email**,
**Commit** — already exist in this fork (`EnhancementPreset` in
`src/types/ai.ts`) and are applied per dictation by the active AI
provider. Today the active preset is selected only inside the
Enhancements settings UI; there is no way to change it from the
keyboard during dictation, and the overlay does not surface which
preset will be used.

The spoken language is today a **single-valued** setting (`language:
string` in `AppSettings`) chosen from a `LanguageSelection` dropdown in
**Models → Spoken Language**. Whisper / Parakeet model selection can
force English when an English-only model is active; otherwise the
single chosen language applies to every dictation. There is no concept
of an "enabled languages" set, no way to switch language from the
keyboard, and the overlay does not surface which language is active.

This feature adds keyboard-driven, overlay-visible cycling for both
axes — formatting preset and spoken language — without changing any
other part of the dictation pipeline.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cycle formatting preset from the keyboard, with the active preset shown on the overlay (Priority: P1)

A user dictates many short bursts of different kinds — sometimes a
quick chat reply, sometimes an email body, sometimes a commit
message. They want to switch the formatting preset (Default →
Prompts → Email → Commit → Default) without leaving their keyboard or
opening the settings window. They press a configurable hotkey, see
the active preset name update on the on-screen overlay next to the
recording dots, and the next dictation is formatted by that preset.

**Why this priority**: This is the productivity payoff of the whole
feature. Without a keyboard cycle and on-screen confirmation, users
have to keep settings open or remember which preset is active —
which defeats the purpose of an overlay-centric workflow. This
slice alone is a viable MVP for users who only use one language.

**Independent Test**: With the app running and the preset toggle
hotkey bound, the user presses the hotkey four times in succession;
the overlay's preset label cycles through Default → Prompts →
Email → Commit and returns to Default; the next dictation uses the
preset that was active at the moment recording started. Verifiable
without any language work.

**Acceptance Scenarios**:

1. **Given** the user has the overlay set to show the preset label
   and has bound a "cycle preset" hotkey,
   **When** they press the hotkey while the app is in focus or in
   the background,
   **Then** the overlay updates within 200 ms to show the next
   preset (in the order Default → Prompts → Email → Commit →
   Default), and the change persists across app restarts.

2. **Given** the user has cycled to the Email preset,
   **When** they then trigger a dictation,
   **Then** the formatting request issued to the active AI provider
   uses the Email preset, identically to selecting Email from the
   Enhancements settings UI.

3. **Given** the overlay's preset/language extras are enabled and the
   pill is currently visible (recording or formatting),
   **When** the user cycles the preset,
   **Then** the preset label inside / next to / below the pill (per
   the user's chosen layout) updates in place without dismissing the
   pill or interrupting the recording state.

4. **Given** the user has `pill_indicator_mode` set to `never` (the
   pill is normally hidden),
   **When** they press the cycle-preset hotkey,
   **Then** the overlay briefly appears for ~1.5 s to show the new
   preset name and then auto-hides, so the user gets visual
   confirmation without permanently changing their indicator
   preference.

5. **Given** the user has not enabled the "show preset" extra in
   options,
   **When** they press the cycle-preset hotkey,
   **Then** the active preset still changes (the hotkey is not
   gated on the visual extra), and the change is reported via the
   normal toast / status feedback the app uses for setting changes.

---

### User Story 2 - Choose multiple spoken languages and cycle between them from the keyboard (Priority: P1)

A bilingual or multilingual user dictates regularly in (say) English
and German. They open **Models → Spoken Language** and pick the set
of languages they actually use — e.g., English + German — instead of a
single language. From then on, a configurable hotkey cycles the
*active* language through that enabled set. The overlay shows the
ISO code (`en` / `de`) of the active language so the user knows
which one the next dictation will use.

**Why this priority**: Without a multi-language enable list and a
keyboard cycle, multilingual users have to dig into settings every
time they switch contexts. This is the feature's value for any user
who actually speaks more than one language; for monolingual users
this story is a no-op (only one language enabled → cycle is
disabled).

**Independent Test**: In Models → Spoken Language, enable English
and German. Bind a "cycle language" hotkey. Press the hotkey;
observe the overlay's language label flip from `en` to `de` (and
back on the next press). Trigger a dictation in each state; verify
the speech-to-text request uses the corresponding language code,
identically to selecting that language manually from the dropdown.

**Acceptance Scenarios**:

1. **Given** the user opens Models → Spoken Language,
   **When** they look at the language control,
   **Then** they can enable a *set* of languages (one or more) and
   pick which one of the enabled set is currently active. Picking
   exactly one is equivalent to today's single-language behavior.

2. **Given** the user has enabled exactly one language,
   **When** they press the cycle-language hotkey,
   **Then** the system performs no language change (there is
   nothing to cycle to) and gives a non-disruptive feedback signal
   ("Only one language enabled — add more in Models").

3. **Given** the user has enabled two or more languages and bound a
   cycle-language hotkey,
   **When** they press the hotkey,
   **Then** the active language advances to the next enabled
   language (in a stable order — the order they were enabled, with
   the active one cycling forward), the overlay's language label
   updates within 200 ms to the new ISO code, and the change
   persists across app restarts.

4. **Given** the active speech model is English-only (e.g., a
   Whisper `*.en` variant or Parakeet v2),
   **When** the user cycles to a non-English language,
   **Then** the existing English-only enforcement still wins —
   either the cycle skips non-English entries while the model is
   English-only, or the user is told the active model only supports
   English — the privacy / correctness invariant from
   ModelsSection's `isEnglishOnlyModel` is not bypassed.

5. **Given** the overlay's language extra is enabled,
   **When** the language changes (from any source — hotkey,
   settings UI, model-driven English fallback),
   **Then** the displayed ISO code reflects the new active language
   in lowercase two-letter form (`en`, `de`, `fr`, …).

---

### User Story 3 - Choose where the preset and language labels appear on the overlay (Priority: P2)

A user wants the new preset and language labels to fit their
existing pill placement — sometimes that means showing them to the
right of the recording dots (so the pill widens horizontally),
sometimes below (so the pill grows vertically and stays narrow,
useful when the pill sits in a screen corner). They open settings
and choose between the two layouts.

**Why this priority**: Necessary for the labels to be usable on
varied display setups, but the underlying state cycling (P1) works
regardless of layout. Layout polish without the cycle would be
useless; layout choice on top of a working cycle is a quick UX
upgrade.

**Independent Test**: Toggle the layout setting between "right of
dots" and "below dots" with the pill visible; the pill's geometry
updates immediately and the labels stay legible at both screen edges
and the screen center.

**Acceptance Scenarios**:

1. **Given** the user has enabled the preset and/or language
   labels,
   **When** they pick layout = "right of dots,"
   **Then** the labels render to the right of the audio dots inside
   the same pill, and the pill grows horizontally; the pill keeps a
   single-line layout.

2. **Given** the user picks layout = "below dots,"
   **When** the pill renders,
   **Then** the labels render on a second line below the dots
   inside the same pill; the pill grows vertically and keeps its
   horizontal width close to today's idle / active widths.

3. **Given** the user enables only one of the two labels (preset
   only, or language only),
   **When** the pill renders,
   **Then** only that label is shown and the layout collapses
   accordingly — no empty placeholder.

---

### Edge Cases

- **No formatting provider active.** The cycle-preset hotkey still
  changes the configured preset. The next dictation inserts raw
  text (existing behavior), but the preset selection is honored as
  soon as a provider is configured. The overlay still shows the
  active preset label if the option is enabled.
- **Cycling during an active recording.** The preset / language in
  effect at the *start* of recording is what applies to that
  dictation; cycling mid-recording updates the displayed label and
  the value used for the *next* recording. This matches the existing
  001-Local-AI-Formatting edge case ("user switches active provider
  mid-recording").
- **Overlay set to `never`.** Cycling still works; the overlay
  briefly auto-shows for ~1.5 s to confirm the change, then
  re-hides without changing the user's stored `pill_indicator_mode`
  preference.
- **Hotkey conflict.** The two new hotkeys must pass the existing
  `lib/hotkey-conflicts.ts` checks against the dictation hotkey and
  PTT hotkey; the user gets the same conflict feedback they get
  today for the dictation hotkey.
- **User unbinds a cycle hotkey.** Cycling via that hotkey is
  disabled, but the underlying state (active preset, active
  language) is still settable from the existing settings UI and
  still surfaced on the overlay if the labels are enabled.
- **Active language is removed from the enabled set.** If the user
  unchecks the currently-active language in Models → Spoken
  Language, the system MUST fall back to the first remaining
  enabled language (or to `en` if the list became empty) and update
  the overlay label.
- **English-only speech model + multiple enabled languages.** While
  an English-only model is active, the cycle MUST skip non-English
  entries (or the cycle hotkey is a no-op), and the overlay shows
  `en`. The existing forced-English behavior in `ModelsSection`
  takes precedence.
- **Localization of preset names.** The four preset names are
  short, fixed identifiers (Default / Prompts / Email / Commit).
  This spec does not introduce localization for them; they render
  as-is on the overlay regardless of system locale.
- **Very long preset labels.** Not applicable — preset labels are
  fixed and short. Language labels are 2-letter ISO codes —
  guaranteed short.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST treat **active formatting preset** as
  a first-class user-controllable state distinct from the
  Enhancements UI selection — i.e., changing it from the new hotkey
  has the same effect as selecting it in the Enhancements UI, and
  both surfaces stay in sync. The recognized values are exactly the
  four existing presets: Default, Prompts, Email, Commit.

- **FR-002**: The system MUST provide a configurable global hotkey
  ("cycle formatting preset") that, when pressed, advances the
  active preset to the next entry in the order Default → Prompts →
  Email → Commit → Default. The hotkey MUST be definable, clearable,
  and conflict-checked using the same UX patterns the dictation
  hotkey already uses.

- **FR-003**: The Models → Spoken Language section MUST allow the
  user to enable **a set of one or more languages** (henceforth
  "enabled languages"). The set MUST persist across app restarts.
  When the enabled set has exactly one entry, behavior is identical
  to today's single-language behavior.

- **FR-004**: The system MUST track an **active language** that is
  always one of the enabled languages. Changing the active language
  from any surface (hotkey, settings UI, model-driven English
  fallback) MUST update every other surface within 200 ms.

- **FR-005**: The system MUST provide a configurable global hotkey
  ("cycle spoken language") that, when pressed and when more than
  one language is enabled, advances the active language to the next
  entry in the enabled set (in the order the user enabled them, or
  the order shown in the settings UI — whichever is consistent
  between sessions). When exactly one language is enabled, the
  hotkey MUST be a non-disruptive no-op with a short feedback
  message.

- **FR-006**: The on-screen overlay MUST be capable of displaying
  the **active formatting preset name** (full word: Default,
  Prompts, Email, Commit) and the **active language ISO code**
  (lowercase two-letter, e.g., `en`, `de`) as additional labels
  next to the audio dots, gated by per-label boolean options:
  "Show preset on overlay" and "Show language on overlay."

- **FR-007**: The overlay MUST support two layouts for the new
  labels: **Right** (labels to the right of the audio dots, single
  line, pill grows horizontally) and **Below** (labels under the
  audio dots, two lines, pill grows vertically). The layout MUST be
  user-selectable in the General / Indicator settings.

- **FR-008**: When `pill_indicator_mode = never` and the user
  presses either cycle hotkey, the overlay MUST appear briefly
  (~1.5 s) showing the new preset / language, then auto-hide
  without changing the stored `pill_indicator_mode` preference.

- **FR-009**: Cycling preset or language MUST NOT affect a
  recording that is already in progress. The values in effect at
  the moment recording starts are the values used for that
  dictation's transcription / formatting; cycling during a
  recording updates the displayed labels and the value used for the
  *next* recording.

- **FR-010**: If the active language is removed from the enabled
  set, the system MUST fall back to the first remaining enabled
  language. If the enabled set ever becomes empty (e.g., due to
  external state corruption), the system MUST fall back to a hard
  default of `en` and ensure that `en` is in the enabled set.

- **FR-011**: When an English-only speech model is active, the
  existing forced-English behavior MUST take precedence over both
  the user's active language and the cycle hotkey: the overlay
  shows `en`, the cycle hotkey skips non-English entries (or is a
  no-op), and the actual transcription is performed in English.

- **FR-012**: Both new hotkeys MUST go through the existing hotkey
  conflict-detection and registration paths (`lib/hotkey-conflicts.ts`
  pattern); they MUST NOT silently shadow the dictation hotkey, PTT
  hotkey, or each other.

- **FR-013**: The Enhancements settings surface that controls the
  active preset MUST keep working unchanged for users who never
  bind the cycle-preset hotkey; the Models → Spoken Language
  language picker MUST keep working for users who only ever enable
  one language. This feature is purely additive.

- **FR-014**: Changes to active preset and active language MUST
  persist across app restarts via the existing settings storage,
  alongside the other entries in `AppSettings`.

### Key Entities

- **Active Formatting Preset**: One of `Default`, `Prompts`,
  `Email`, `Commit`. Persists across restarts. Single-valued. Read
  and written by both the Enhancements settings UI and the new
  cycle-preset hotkey. Surfaced on the overlay as a label when the
  "Show preset on overlay" option is enabled.
- **Enabled Languages**: An ordered set of language codes (ISO
  639-1, e.g., `en`, `de`, `fr`, `es`) that the user has marked as
  available for cycling. Persists across restarts. Always contains
  at least one entry.
- **Active Language**: The single language code currently in use
  for dictation. Always an element of *Enabled Languages*. Read and
  written by the Models settings UI, the cycle-language hotkey, and
  the model-driven English-fallback path. Surfaced on the overlay
  as a 2-letter ISO code when the "Show language on overlay" option
  is enabled.
- **Indicator Extras Layout**: One of `right` or `below` —
  determines whether the preset / language labels render to the
  right of the audio dots or below them inside the pill.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with the cycle-preset hotkey bound and the
  preset label visible can cycle to any of the four presets in one
  keypress (worst case: three keypresses to reach the farthest
  preset) and see the overlay update within 200 ms — verified by
  manual timing or a test that asserts the rendered label.
- **SC-002**: A bilingual user can switch the active language from
  English to a second enabled language with a single hotkey press,
  see the overlay's ISO code change within 200 ms, and have the
  next dictation transcribed using the new language — without
  opening the settings window.
- **SC-003**: A monolingual user (one enabled language) sees zero
  behavior change from this feature unless they explicitly enable
  the new overlay extras: the language pickers, the dictation flow,
  and the existing pill geometry / dots animation all remain
  unchanged.
- **SC-004**: With the overlay set to `never`, pressing either
  cycle hotkey causes the overlay to briefly surface the change for
  no more than 2 s and then return to hidden — without the user's
  stored indicator preference being mutated.
- **SC-005**: With the active speech model being English-only, the
  user cannot end up in a state where the overlay shows a
  non-English language code or the transcription is sent in a
  non-English language. Verifiable by enabling
  English + German, switching to a `*.en` Whisper variant, and
  confirming the overlay locks to `en`.
- **SC-006**: The persisted settings shape extends `AppSettings`
  additively: existing fields keep their meaning, and a user
  upgrading from a build without this feature ends up with sensible
  defaults — preset = whatever the Enhancements UI already has,
  enabled languages = `[language]` (the existing single value),
  cycle hotkeys unbound, both overlay extras disabled, layout =
  `right`. No migration prompt is shown to the user.
- **SC-007**: All four preset names and all enabled language ISO
  codes render legibly inside the pill at both layout positions
  ("right" and "below"), at every supported `pill_indicator_position`
  (six corners / centers) and `pill_indicator_offset` value, on at
  least one Retina and one non-Retina display, with no clipping.
- **SC-008**: Both new hotkeys participate in the same conflict-
  detection UX as the dictation hotkey: assigning either to a key
  combination already used by another VoiceTypr action surfaces the
  same warning the user already sees today.

## Assumptions

- The four formatting presets stay exactly as defined in
  `EnhancementPreset` — Default, Prompts, Email, Commit — and the
  cycle order matches that declared order. This feature does not
  add, remove, or rename presets.
- The user wants two *separate* hotkeys (one per axis) rather than
  a single hotkey that cycles both. The phrasing "toggle both via
  hotkey" is read as "each via its own hotkey," consistent with how
  every other VoiceTypr action has its own binding.
- The existing on-screen pill (`RecordingPill.tsx`) is the right
  surface for the new labels; this feature does NOT introduce a
  second floating overlay window.
- "Language" here means the speech-recognition input language
  passed to Whisper / Parakeet / Soniox. It does not affect AI
  formatting prompts (those remain provider-driven and
  language-agnostic in this fork).
- ISO codes shown on the overlay are lowercase two-letter (ISO
  639-1) — `en`, `de`, `fr`, `es`, etc. — matching the codes the
  existing `LanguageSelection` component already uses.
- Enabling a *set* of languages in Models → Spoken Language is the
  natural extension of today's single-select picker; a multi-select
  control replaces or augments the existing single-value control,
  and the existing `language` field becomes the *active* one out of
  the enabled set. No separate "default language" concept is
  introduced.
- Persistence reuses the existing `AppSettings` / settings storage
  (the same store that holds `language`, `hotkey`, `ptt_hotkey`,
  `pill_indicator_*`). No new persistence layer.
- Hotkey registration reuses the existing global-hotkey
  infrastructure (Tauri `globalShortcut` + `lib/hotkey-conflicts.ts`).
  No new keyboard backend.
- The preset and language labels are short enough that the "right"
  layout never needs to wrap. The "below" layout exists primarily
  for users who place the pill in a horizontally-tight position
  (corner placements) and want to keep the horizontal footprint
  small.
- Users who want to keep today's exact UI can leave both new
  hotkeys unbound and both overlay extras disabled; in that mode
  the only persisted change is that `language` is now sourced from
  an enabled-set of size 1 instead of a single field — fully
  backward compatible at the user-facing level.
- When the user has no AI formatting provider configured at all,
  cycling the preset still updates the stored value (so it is ready
  the moment a provider is added), and the next dictation behaves
  exactly as it does today (raw transcription inserted).
- This feature does not introduce per-recording history of which
  preset / language was used. The state is "current," not
  "per-message"; users who need per-message presets can still pick
  a preset before each dictation via the hotkey.
