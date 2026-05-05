# Phase 1 Contracts: Tauri Commands & Events

This feature primarily reuses existing Tauri commands. Only **events**
are net new on the IPC boundary.

## Tauri commands (Rust → frontend)

### Reused — no signature change

| Command                          | Use in this feature |
|----------------------------------|---------------------|
| `get_settings()`                 | Frontend reads new fields (`enabled_languages`, `cycle_preset_hotkey`, etc.) on app boot. |
| `set_settings(settings)`         | Frontend writes new fields when user updates Models / GeneralSettings. Backend validates `enabled_languages` non-empty + `language ∈ enabled_languages`. |
| `get_enhancement_options()`      | Frontend reads active preset on app boot. |
| `update_enhancement_options(opts)` | Frontend writes new preset value when the Enhancements UI changes it. The cycle-preset Rust handler also writes via this same code path internally. |

### No new commands

The cycle actions are driven by the global-shortcut handler, which
runs entirely in Rust. No frontend-invoked command exists for "cycle
preset" or "cycle language" — they would only ever be invoked by the
shortcut. (If a future need arises to invoke from a menu item, two
commands `cycle_preset` / `cycle_language` can be added without
breaking changes.)

## Tauri events (Rust → frontend, emitted)

### Net new

| Event name                  | Payload                                                       | Emitted when |
|-----------------------------|---------------------------------------------------------------|--------------|
| `active-preset-changed`     | `{ "preset": "Default" \| "Prompts" \| "Email" \| "Commit" }` | After the cycle-preset hotkey writes the new preset to the `ai` store. |
| `active-language-changed`   | `{ "language": "<iso-639-1>" }`                               | After the cycle-language hotkey writes the new active language to the `settings` store. |
| `cycle-language-noop`       | `{ "reason": "single_language" \| "english_only_model" }`     | When the cycle-language hotkey fires but the cycle is gated. Frontend renders a non-disruptive toast. |

### Existing — listened to in new places

| Event name                  | Existing emitter                                       | New listener |
|-----------------------------|--------------------------------------------------------|--------------|
| `language-changed`          | Already emitted on any `Settings.language` change.     | `RecordingPill.tsx` listens to update `activeLanguage` (covers the model-driven English-fallback path uniformly with the cycle-hotkey path). |
| `hotkey-registration-failed`| Already emitted when the dictation shortcut fails.     | Reused for the two new shortcuts; existing toast UX applies. |

## Settings shape (TypeScript ↔ Rust serde)

The TS `AppSettings` interface and Rust `Settings` struct must stay in
lockstep. The seven new fields described in `data-model.md` are
serialised via the existing `tauri-plugin-store` JSON layer with the
camelCase ↔ snake_case convention already in use (e.g.
`pill_indicator_mode` ↔ `pill_indicator_mode` — the project keeps
snake_case on both sides for store keys).

```jsonc
// Example serialised Settings after the user enables 2 languages,
// binds both cycle hotkeys, and turns on both pill extras with
// "below" layout:
{
  "hotkey": "CommandOrControl+Shift+Space",
  "current_model": "ggml-base.en",
  "current_model_engine": "whisper",
  "language": "de",
  "enabled_languages": ["en", "de"],
  "cycle_preset_hotkey": "CommandOrControl+Shift+P",
  "cycle_language_hotkey": "CommandOrControl+Shift+L",
  "pill_show_preset": true,
  "pill_show_language": true,
  "pill_extras_layout": "below",
  "pill_indicator_mode": "when_recording",
  "pill_indicator_position": "bottom-center",
  "pill_indicator_offset": 10
  /* …existing fields unchanged… */
}
```

## Backwards compatibility

A user upgrading from a build without this feature has none of the
seven new keys in their stored `Settings` JSON. The Rust deserializer
applies the field defaults from `Default for Settings`:

- `enabled_languages` → `vec!["en"]`. The backend then bumps it on
  first read to `vec![<existing language>]` so a user who was on
  German lands with `enabled_languages = ["de"]`, not `["en"]`.
- `cycle_preset_hotkey` / `cycle_language_hotkey` → `None` (unbound).
- `pill_show_preset` / `pill_show_language` → `false` (overlay
  unchanged).
- `pill_extras_layout` → `"right"` (irrelevant while both flags are
  false).

Result: zero behavior change on first launch (SC-006).

## Test surface

| Boundary                      | Test file (existing or new) | What it asserts |
|-------------------------------|------------------------------|-----------------|
| `Settings` serde round-trip    | `src-tauri/src/tests/settings_commands.rs` (extend) | New fields default correctly; round-trip `["en", "de"]` survives serialize/deserialize; missing-field defaults match `Default`. |
| `set_settings` validation      | Same file (extend)           | Empty `enabled_languages` resets to `["en"]`; `language` not in `enabled_languages` resets to `enabled_languages[0]`. |
| Global-shortcut dispatch       | New unit test or integration via `#[cfg(test)]` of `handle_global_shortcut` | `Action::CyclePreset` advances Default → Prompts; `Action::CycleLanguage` cycles `[en, de, fr]`. |
| English-only gate              | New test                     | With `current_model = "ggml-base.en"` and `enabled_languages = ["en", "de"]`, cycle-language emits `cycle-language-noop { english_only_model }` and `Settings.language` stays `en`. |
| `RecordingPill` render         | `src/components/RecordingPill.test.tsx` (extend) | Renders preset label when `pill_show_preset`; renders ISO code when `pill_show_language`; layout switches between row and col; `forceShow` flashes for 1.5 s when mode is `never` and a cycle event fires. |
| Multi-select `LanguageSelection` | `src/components/sections/__tests__/ModelsSection.languages.test.tsx` (new) | Adding/removing entries; toggling active marker; collapse-to-single-row at n=1; English-only model disables non-EN entries. |
| `GeneralSettings` new rows     | `src/components/sections/__tests__/GeneralSettings.recording-indicator.test.tsx` (extend) | Two cycle-hotkey rows, `pill_show_preset` / `pill_show_language` toggles, layout radio. |

## Non-goals (explicit)

- No new `cycle_preset` / `cycle_language` Tauri command — the cycle
  is driven only by the global shortcut.
- No new persistence layer, no new store, no new database.
- No backend localization of preset names. The English strings
  `Default / Prompts / Email / Commit` are passed through unchanged.
- No backwards cycle binding. Forward-only with wrap.
- No per-recording history of preset/language used. State is
  "current," not "per-message."
