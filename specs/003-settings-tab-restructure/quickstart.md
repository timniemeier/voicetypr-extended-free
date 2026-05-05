# Quickstart — Manual Smoke Test

**Phase**: 1 (Design & Contracts) | **Audience**: implementer running `pnpm tauri dev` after wiring the feature

This is the manual-test checklist that satisfies Constitution Principle IV (UI-affecting PRs include a manual-test note). Run through it before declaring the feature done.

## Pre-conditions

- Branch `003-settings-tab-restructure` checked out, all changes applied.
- `pnpm install` clean. `cargo check` clean.
- `pnpm lint && pnpm typecheck && pnpm test` all green.
- `cd src-tauri && cargo test` green.
- Pre-test: have a dev install with a non-default state in legacy keys to exercise migration. Specifically:
  - `enhancement_options.preset` set to `"Email"`.
  - `custom_prompts.email` set to a custom string (e.g., `"You are an email rewriter — be terse."`).
  - `custom_prompts.base` set to a custom string (e.g., `"Pre-process: strip filler words."`).
- Run `pnpm tauri dev`.

## Migration smoke test

1. App launches; check the dev console for the migration log line (`migrate_prompt_library_v1: ok`).
2. Inspect `tauri-plugin-store` JSON file:
   - New `prompts` key exists with `version: 1`.
   - `active_prompt_id` = `"builtin:email"` (mapped from preset = "Email").
   - `prompts[]` contains exactly four built-in entries, ordered default / prompts / email / commit.
   - The `email` built-in's `prompt_text` is the custom string you set in `custom_prompts.email` — not the shipped default.
   - The `default` and `prompts` and `commit` built-ins have shipped-default `prompt_text` (no overrides existed for them).
   - The `custom_prompts.base` value is **not** present in the library (it was dropped by design).
   - Legacy keys `enhancement_options` and `custom_prompts` are still in the JSON file (forensics retained).
3. Restart the app. Verify migration does NOT re-run (no log line) — idempotency.

## User Story 1 — find and edit a prompt (P1)

1. From any tab, click **Prompts** in the sidebar.
2. Verify: search field, BUILT-IN group with 4 entries (Default, Prompts, Email, Commit), CUSTOM group empty (or with whatever you've created), "New prompt" entry at the bottom.
3. Verify: orange "active" dot is on the **Email** row (because of the migrated state above).
4. Click **Email** row. Editor pane shows: name "Email", icon Mail, prompt text = the custom string you migrated. Save status reads "Saved automatically".
5. Edit the prompt text (e.g., append " Be slightly less formal."). Wait ~1s. Save status updates.
6. Trigger a recording. After transcription, verify the AI provider received the edited prompt (check dev console / network tab for the system message containing your appended text).

## User Story 2 — distinguish LLM Models vs STT Models (P1)

1. Sidebar shows **Prompts**, **LLM Models**, **STT Models** in this order, between Settings and About. Each has a distinct icon.
2. Click **LLM Models**. Verify:
   - AI Providers section present (provider list, API key inputs, model picker).
   - Setup Guide present.
   - Master "AI formatting on/off" toggle present (top of section, not part of removed `EnhancementSettings`).
   - **Absent**: the old preset-pill picker (Default/Prompts/Email/Commit). Verify it doesn't appear.
   - **Absent**: the old "Custom Prompts (Advanced)" collapsible. Verify it doesn't appear.
3. Click **STT Models**. Verify:
   - Whisper / Parakeet model list, sizes, download / delete actions.
   - Spoken-language picker.
   - Model status (active engine).
   - Header reads "STT Models" (not "Models").
   - Functional smoke: click into the active engine, run a recording — transcription works exactly as before.

## User Story 3 — create / activate / delete a custom prompt (P2)

1. Prompts tab → click **New prompt**. Editor pane shows blank Name / Icon (default placeholder) / Prompt text. Save status disabled (cannot save blank — FR-013a).
2. Type Name "Slack reply". Save status still disabled.
3. Pick an icon (e.g., MessageSquare). Save status still disabled.
4. Type Prompt text "Rewrite as a casual Slack reply, lowercase, ≤2 sentences.". Wait ~1s. Save status flips to "Saved automatically". A new row appears in the CUSTOM group named "Slack reply".
5. Verify: the orange "active" dot is still on Email (FR-013 — creation does not auto-activate).
6. Click the explicit **Set as active** affordance (button or row toggle, per implementation choice in FR-013). Active dot moves to "Slack reply".
7. Trigger a recording. Verify AI provider received the Slack-reply prompt text exactly.
8. Delete the "Slack reply" custom prompt. Active dot falls back to **Default** (FR-011). Trigger another recording — verify the default prompt is now used.

## Edge cases

1. **Empty prompt text**: in the editor, clear the prompt text on Default. Save status flips to a validation error ("Prompt cannot be empty"). Click **Reset to default** — name + icon + text revert to shipped defaults atomically (all three at once, FR-009 / Q4).
2. **Built-in delete attempt**: there's no delete control on built-in rows (FR-009). Verify the UI doesn't offer one. (Backend cmd would also reject.)
3. **Search**: type a string that matches no prompt names (e.g., "zzz"). List shows an empty-state message, not a stale list.
4. **Restart**: after all of the above, fully quit and relaunch. Custom prompts persist, edits persist, active selection persists.
5. **Hotkey cycling (if feature 002 is also merged)**: cycle hotkey moves through built-in prompts in canonical order. Active dot updates. Custom prompts may or may not be in the cycle (depends on 002's choice — out of scope here).

## Acceptance summary

If all of the above pass without manual workaround, the feature is ready for `/speckit-tasks` → `/speckit-implement` (already done) → PR. If any step fails, capture the failure in the PR description and either fix or document as a known follow-up.
