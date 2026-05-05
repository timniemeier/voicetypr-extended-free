# Quickstart — Overlay Preset & Language Toggles

A short walkthrough so a developer can verify the feature end-to-end after
implementing it. Times reference the success criteria in `spec.md`.

---

## Prerequisites

1. **VoiceTypr dev environment** running:

   ```bash
   pnpm install
   pnpm tauri dev
   ```

2. **At least one non-English-only Whisper or Parakeet model installed**
   (e.g. `ggml-base` — *not* `ggml-base.en`). Required for the language
   cycling tests; the preset cycling test works with any model.

3. **A clean settings store** for the first launch verification:

   ```bash
   # macOS — back up and clear the store to simulate a fresh user
   mv "$HOME/Library/Application Support/com.voicetypr/settings.json"{,.bak} 2>/dev/null || true
   ```

   Restore from `.bak` after testing.

---

## Happy-path verification

### 1. First-launch is unchanged (SC-006)

1. With a cleared settings store, `pnpm tauri dev` and open the main window.
2. Open Settings → General → "Recording Indicator."
3. **Expected**: the section looks identical to the previous build except
   for five new rows added at the bottom: "Cycle preset hotkey,"
   "Cycle language hotkey," "Show preset on overlay,"
   "Show language on overlay," "Indicator extras layout."
4. **Expected**: the two new toggles are off, both hotkeys are unbound,
   layout shows "right." The overlay renders byte-identically to before
   this feature.

### 2. Cycle preset hotkey (US1, SC-001)

1. Settings → General → bind "Cycle preset hotkey" to ⌘⇧P.
2. Settings → General → enable "Show preset on overlay."
3. Settings → General → set `pill_indicator_mode` to "always."
4. Trigger ⌘⇧P four times in succession.
5. **Expected**: overlay label cycles `Default → Prompts → Email → Commit
   → Default`, each transition rendering within 200 ms (SC-001).
6. Settings → Formatting / Enhancements panel: confirm the preset
   selector reflects the same value the overlay shows (single source
   of truth — FR-001).
7. Trigger a dictation. The transcription is post-formatted with the
   preset that was active when recording started (FR-009).
8. Quit and relaunch the app. Overlay still shows the last preset
   (persistence via the existing `ai` store).

### 3. Multi-language enable + cycle (US2, SC-002, SC-003)

1. Settings → Models → Spoken Language: open the multi-select.
2. **Expected**: control collapses visually to a single-row layout
   identical to the previous single-select dropdown when only one
   language is enabled (SC-003).
3. Add a second language (e.g. German). The control switches into a
   chip / row list; the active language is marked with a radio + check.
4. Settings → General → bind "Cycle language hotkey" to ⌘⇧L.
5. Settings → General → enable "Show language on overlay."
6. Trigger ⌘⇧L.
7. **Expected**: overlay label flips between `en` and `de` within
   200 ms (SC-002). Each press advances to the next enabled language;
   wraps after the last one.
8. Trigger a dictation in each language; transcription respects the
   active value at recording-start time.

### 4. English-only model gate (FR-011)

1. Settings → Models: switch the active model to `ggml-base.en`.
2. Settings → Models → Spoken Language: confirm the multi-select shows
   non-English entries as disabled.
3. Trigger ⌘⇧L (cycle-language hotkey).
4. **Expected**: a non-disruptive toast — "Active model is English-only
   — switch model in Models to use other languages." `Settings.language`
   does not change; overlay does not change.
5. Switch back to a multilingual model. Cycling resumes normally.

### 5. Hidden-pill flash (FR-008, SC-004)

1. Settings → General → set `pill_indicator_mode` to "never" — the pill
   is now normally hidden.
2. Trigger ⌘⇧P (cycle-preset).
3. **Expected**: pill briefly appears for ~1.5 s with the new preset
   label, then auto-hides.
4. Reopen Settings → General. `pill_indicator_mode` is still "never"
   (the visible-flash state did NOT mutate the persisted preference —
   SC-004).

### 6. Layout toggle (FR-007)

1. Enable both pill extras with `pill_indicator_mode = "always"`.
2. Settings → General → "Indicator extras layout" → "right."
3. **Expected**: pill renders `[dots] en · Email` on a single row.
4. Switch the layout to "below."
5. **Expected**: pill renders dots on the first row and `en · Email`
   on a second row beneath them.

### 7. Both extras off (FR-006)

1. Disable both "Show preset on overlay" and "Show language on overlay."
2. **Expected**: pill renders only the audio dots — byte-identical to
   the pre-feature pill (no separator, no labels, no extra padding).

### 8. Hotkey conflict (FR-013)

1. Set "Cycle preset hotkey" and "Cycle language hotkey" to the same
   combination, OR equal to the existing dictation `hotkey` /
   `ptt_hotkey`.
2. **Expected**: the existing hotkey-conflicts UX surfaces the
   conflict; the second binding is rejected. Backend logs a warning
   and refuses to register the duplicate.

### 9. Language removed mid-flight (FR-010)

1. Enabled languages = `[en, de]`, active = `de`.
2. In Models → Spoken Language, remove German.
3. **Expected**: active language falls back to `en`. Overlay updates.
4. Remove the last entry too (force the empty state).
5. **Expected**: backend resets `enabled_languages = ["en"]` and
   `Settings.language = "en"`. Overlay shows `en`.

---

## Automated test commands

```bash
pnpm typecheck
pnpm lint
pnpm test                  # vitest — RecordingPill, ModelsSection, GeneralSettings tests
cd src-tauri && cargo test # backend serde + cycle action tests
```

All of these MUST pass before merging (Constitution Principle IV).

---

## Diagnostic tips

- **Cycle hotkey doesn't fire**: Check Console.app for
  `hotkey-registration-failed` events. Likely cause: the OS has
  already claimed the combination (e.g. ⌘⇧P is bound to a system
  service). Pick a different binding.
- **Overlay doesn't update on cycle**: Confirm the frontend listener
  is mounted — `RecordingPill.tsx` should subscribe to
  `active-preset-changed`, `active-language-changed`, and
  `language-changed`. The latter fires whenever any code path mutates
  `Settings.language`, so removing it would make the cycle event the
  only refresh path and miss the existing English-fallback path.
- **Preset cycle desyncs from Enhancements UI**: Both surfaces must
  read from `enhancement_options.preset` in the `ai` store. If the
  Enhancements UI shows `Email` but the overlay shows `Default`, one
  side is reading from a stale local state — re-check the
  `update_enhancement_options` writer / event listener pairing.
