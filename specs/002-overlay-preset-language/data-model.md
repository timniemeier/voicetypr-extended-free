# Phase 1 Data Model: Overlay Preset & Language Toggles

This is the **persisted** + **runtime** data model for the feature.
All persisted state extends existing storage layers; no new layer is
introduced.

## Persisted state

### `Settings` (Rust: `src-tauri/src/commands/settings.rs::Settings`; TS: `src/types.ts::AppSettings`)

The seven new fields are appended to the existing struct. All are
optional from the user's perspective via sensible defaults — a user
upgrading from a build without this feature ends up in a
zero-behavior-change state (SC-006).

| Field (Rust)                | Type            | Default                          | Field (TS)                  | Notes |
|-----------------------------|-----------------|----------------------------------|-----------------------------|-------|
| `enabled_languages`         | `Vec<String>`   | `vec!["en".to_string()]`         | `enabled_languages: string[]` | Ordered set of ISO 639-1 codes. Must contain at least 1 entry; backend validation enforces. The existing `language` field is the **active** member of this set. |
| `cycle_preset_hotkey`       | `Option<String>`| `None`                           | `cycle_preset_hotkey?: string` | Tauri-style global shortcut string (e.g. `"CommandOrControl+Shift+P"`). `None` = unbound. Must not equal `hotkey`, `ptt_hotkey`, or `cycle_language_hotkey`. |
| `cycle_language_hotkey`     | `Option<String>`| `None`                           | `cycle_language_hotkey?: string` | Same shape as `cycle_preset_hotkey`. |
| `pill_show_preset`          | `bool`          | `false`                          | `pill_show_preset?: boolean` | When `true`, the active preset name is rendered in the pill. |
| `pill_show_language`        | `bool`          | `false`                          | `pill_show_language?: boolean` | When `true`, the active language ISO code is rendered in the pill. |
| `pill_extras_layout`        | `String`        | `"right".to_string()`            | `pill_extras_layout?: 'right' \| 'below'` | Where the labels render relative to the audio dots. |

The existing `language: String` field is retained unchanged; it
continues to mean "the language used for the next dictation," and
its invariant is now: it MUST be an element of `enabled_languages`.
Backend validation (in `set_settings`) enforces this and silently
falls back to `enabled_languages[0]` (or `"en"` if the set is empty)
when the invariant would be violated (FR-010).

### `ai` store (existing — no schema change)

The active formatting preset continues to live in the existing `ai`
store under the key the `update_enhancement_options` /
`get_enhancement_options` commands already use
(`enhancement_options.preset`). The cycle-preset action is a new
*writer* of that field; no schema change.

| Existing key                       | Type                                      | New writer | Notes |
|------------------------------------|-------------------------------------------|------------|-------|
| `enhancement_options.preset`       | `"Default" \| "Prompts" \| "Email" \| "Commit"` | cycle-preset hotkey | Already written by the Enhancements UI. |

## Runtime state (not persisted)

### Backend (Rust)

| Owner                              | Field                          | Type                            | Notes |
|------------------------------------|--------------------------------|---------------------------------|-------|
| `AppState`                         | `cycle_preset_shortcut`        | `Mutex<Option<Shortcut>>`       | Mirrors the existing `recording_shortcut` / `ptt_shortcut` slots. Holds the parsed shortcut for fast comparison in `handle_global_shortcut`. |
| `AppState`                         | `cycle_language_shortcut`      | `Mutex<Option<Shortcut>>`       | Same pattern. |

### Frontend (TS)

| Owner                              | Field                          | Type                            | Notes |
|------------------------------------|--------------------------------|---------------------------------|-------|
| `RecordingPill.tsx` (local state)  | `forceShow`                    | `boolean`                       | Set true for 1.5 s after a cycle event arrives while `pill_indicator_mode === "never"`. Auto-clears via `setTimeout`. |
| `RecordingPill.tsx` (local state)  | `activePreset`                 | `EnhancementPreset`             | Mirrors `enhancement_options.preset` for fast render. Updated on `active-preset-changed` event. |
| `RecordingPill.tsx` (local state)  | `activeLanguage`               | `string`                        | Mirrors `Settings.language`. Updated on `active-language-changed` event AND on the existing `language-changed` event (already emitted by the language-fallback path). |

## State transitions

### Active preset cycle (forward only, with wrap)

```
Default → Prompts → Email → Commit → Default
```

The Rust handler reads the current value from the `ai` store, advances
to the next entry in this fixed order, writes it back, and emits
`active-preset-changed { preset: <new> }`.

### Active language cycle (forward only, with wrap; gated)

```
enabled_languages = [en, de, fr]   // user-curated order
active = en  → press hotkey → active = de
active = de  → press hotkey → active = fr
active = fr  → press hotkey → active = en
```

Gates:
- If `enabled_languages.len() <= 1`: emit `cycle-language-noop { reason: "single_language" }` and stop.
- If the active speech model is English-only (Whisper `*.en` /
  Parakeet `-v2`): emit `cycle-language-noop { reason: "english_only_model" }` and stop. `Settings.language` stays at its current value (which the model-fallback path has already forced to `en`).
- Otherwise: write the new active language to `Settings.language` via the existing `set_settings` flow and emit `active-language-changed { language: <new> }`.

### Enabled-language set mutation (Models → Spoken Language UI)

- **Add language**: append to `enabled_languages`. If the set was empty, also set `language` to the new entry.
- **Remove language X**:
  - Remove `X` from `enabled_languages`.
  - If `Settings.language == X`: set `language` to the first remaining entry. If no entries remain, set `language = "en"` and `enabled_languages = ["en"]` (FR-010).
- **Mark as active**: set `Settings.language` to that code (no change to the set).

## Validation rules

- `enabled_languages` MUST be non-empty; if it ever becomes empty, backend resets to `["en"]`.
- Each entry in `enabled_languages` MUST be a known ISO 639-1 code (validated against the existing `whisper::languages::SUPPORTED_LANGUAGES` list).
- `Settings.language` MUST be an element of `enabled_languages`; if not, backend resets it to `enabled_languages[0]`.
- `cycle_preset_hotkey` and `cycle_language_hotkey`, when non-None, MUST be parseable Tauri shortcut strings AND MUST NOT equal each other, `hotkey`, or `ptt_hotkey` (validated client-side via the existing hotkey-conflict UX; backend logs a warning and refuses to register on duplicate).
- `pill_extras_layout` ∈ {`"right"`, `"below"`}; any other value is treated as `"right"`.

## Key entities (cross-reference to spec § Key Entities)

| Spec entity                  | Storage location                                   | Source of truth |
|------------------------------|----------------------------------------------------|-----------------|
| Active Formatting Preset     | `ai` store, `enhancement_options.preset`           | Existing — no change. |
| Enabled Languages            | `settings` store, `Settings.enabled_languages`     | New, this feature. |
| Active Language              | `settings` store, `Settings.language`              | Existing — semantics extended (must be in enabled set). |
| Indicator Extras Layout      | `settings` store, `Settings.pill_extras_layout`    | New, this feature. |
