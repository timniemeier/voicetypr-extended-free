---

description: "Task list for feature 001-local-ai-formatting"
---

# Tasks: Local LLM Text Formatting (Ollama)

**Input**: Design documents from `/specs/001-local-ai-formatting/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-commands.md, quickstart.md

**Tests**: Included as a deliberate part of each story because Constitution IV requires `pnpm lint && pnpm typecheck && pnpm test` and `cargo test` to pass before merge, and the spec's AS-005 explicitly relies on existing provider-agnostic tests continuing to pass.

**Organization**: Tasks are grouped by user story. US1 alone is a complete, shippable MVP (per the spec's "Why this priority" for US1). US2 and US3 are independently testable increments.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps task to user story (US1, US2, US3) for traceability
- File paths are absolute-from-repo-root

## Path Conventions

- **Backend (Rust + Tauri v2)**: `src-tauri/src/`
- **Frontend (React + TypeScript)**: `src/`
- This is the existing layout; no new directories are introduced.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the dev environment can exercise the feature end-to-end before any code changes land.

- [ ] T001 Verify Ollama dev environment per quickstart.md prereqs: `brew install ollama` (or equivalent), run `ollama serve`, confirm `curl http://localhost:11434/v1/models` returns JSON, and `ollama pull llama3.2:3b` succeeds. Document any deviations in a one-line PR note.
- [X] T002 Confirm baseline test suite is green on `001-local-ai-formatting` by running `pnpm lint && pnpm typecheck && pnpm test` from repo root and `cargo test` from `src-tauri/`. Establishes the regression baseline before edits.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tiny foundation that every user story depends on — the new constants, allowlist widenings, and factory dispatch arm. Until these land, no US1 task can wire end-to-end.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Add Ollama constants to `src-tauri/src/commands/ai.rs`: `const DEFAULT_OLLAMA_BASE_URL: &str = "http://localhost:11434/v1";`, `const OLLAMA_BASE_URL_KEY: &str = "ai_ollama_base_url";`, `const OLLAMA_NO_AUTH_KEY: &str = "ai_ollama_no_auth";`. Place near the existing `DEFAULT_OPENAI_BASE_URL` / `CUSTOM_BASE_URL_KEY` block to keep the diff localized.
- [X] T004 Extend `AI_PROVIDER_KEYS` in `src-tauri/src/commands/ai.rs` with `"ai_api_key_ollama"` so `warm_ai_key_cache_from_secure_store` populates the cache for users who configured a bearer token.
- [X] T005 Append `"ollama"` to `ALLOWED_PROVIDERS` in `src-tauri/src/commands/ai.rs` (final value: `&["gemini", "openai", "anthropic", "custom", "ollama"]`).
- [X] T006 Add `"ollama"` arm to `AIProviderFactory::create` and `is_valid_provider` in `src-tauri/src/ai/mod.rs`. The arm constructs an `OpenAIProvider` after merging Ollama defaults into `config.options` (`base_url = http://localhost:11434/v1` if absent, `no_auth = true` if absent). Diff target: ≤30 lines, per spec SC-006.

**Checkpoint**: Foundation ready — all US1/US2/US3 tasks may begin.

---

## Phase 3: User Story 1 — Format transcriptions with a local Ollama server (Priority: P1) 🎯 MVP

**Goal**: A user with Ollama running on `localhost:11434` can configure the new Ollama card in two clicks (URL pre-filled), pick a model, save, set active, dictate, and see the transcription cleaned up by Ollama with zero outbound calls leaving the device.

**Independent Test**: Run quickstart.md "Happy-path verification" steps 1–11. Pass criterion: SC-001 (<2 min), SC-002 (no non-loopback traffic in `nettop`), SC-003 (Test < 5 s), SC-005 (≤3 clicks to switch active provider), SC-007 (output is non-empty and semantically meaningful for a 7B+ instruction-tuned model).

### Tests for User Story 1 (Constitution IV)

> Add tests **alongside** implementation, not strict-TDD-first — the existing
> codebase pattern is mixed. Where the test gives high regression value, prefer
> writing it first.

- [X] T007 [P] [US1] Add factory-dispatch test `test_factory_dispatches_ollama_to_openai_provider` in `src-tauri/src/ai/tests.rs`: build `AIProviderConfig{provider:"ollama", model:"llama3.2:3b", api_key:"", enabled:true, options:{}}` and assert `AIProviderFactory::create(&config)` returns `Ok(_)`. (The returned provider's internal HTTP base URL is private; the test asserts construction success — the wire-level assertion is covered by the OpenAIProvider's existing tests.)
- [X] T008 [P] [US1] Add `test_factory_ollama_default_no_auth_when_options_empty` in `src-tauri/src/ai/tests.rs`: pass `options = HashMap::new()` and assert construction succeeds with empty `api_key` (proving the arm injects `no_auth = true` so `OpenAIProvider::new` doesn't reject the empty key).
- [X] T009 [P] [US1] Add `test_factory_ollama_respects_options_override` in `src-tauri/src/ai/tests.rs`: pass `options` with `base_url = "http://gpu-server:11434/v1"` and `no_auth = false` plus a non-empty `api_key`; assert construction succeeds (proving the arm uses caller-provided overrides instead of defaults).
- [X] T010 [P] [US1] Add `test_validate_provider_name_accepts_ollama` and `test_curated_models_returns_empty_for_ollama` in `src-tauri/src/commands/ai.rs::tests` (mirroring the existing `custom` assertions).
- [X] T011 [P] [US1] Add modal-render test in `src/components/OpenAICompatConfigModal.test.tsx`: mount with `defaultBaseUrl="http://localhost:11434/v1"` and assert the URL Input renders that value. Asserts the privacy helper text "Privacy depends on the host you control" is present in the DOM.
- [X] T012 [P] [US1] Add card-listing test in `src/components/sections/__tests__/EnhancementsSection.test.tsx`: render the section, query the rendered provider cards, and assert their order matches **OpenAI → Anthropic → Google Gemini → Ollama → Custom** (per FR-001 clarification).
- [X] T013 [P] [US1] Add config-flow test in `src/components/sections/__tests__/EnhancementsSection.test.tsx`: simulate clicking the **Ollama** card, expect the `OpenAICompatConfigModal` to open with `defaultBaseUrl="http://localhost:11434/v1"`, fill model `"llama3.2:3b"`, mock `test_openai_endpoint` ok, click **Test**, then **Save**, and assert `validate_and_cache_api_key({provider:"ollama", baseUrl:"http://localhost:11434/v1", model:"llama3.2:3b"})` was invoked and `update_ai_settings({enabled:true, provider:"ollama", model:"llama3.2:3b"})` followed.

### Implementation for User Story 1

#### Backend (Rust)

- [X] T014 [US1] Extend `validate_and_cache_api_key` in `src-tauri/src/commands/ai.rs` to handle `provider == "ollama"`. Mirror the existing `"custom"` branch but persist URL/no_auth under `OLLAMA_BASE_URL_KEY` / `OLLAMA_NO_AUTH_KEY`. Default URL when absent: `DEFAULT_OLLAMA_BASE_URL`. Probe via `run_openai_probe_request(..., allow_chat_probe_fallback = true)`.
- [X] T015 [US1] Extend `check_has_api_key` in `src-tauri/src/commands/ai.rs` so `provider == "ollama"` is treated like `"custom"`: configured base URL OR cached key counts as configured. New branch reads `OLLAMA_BASE_URL_KEY` (no legacy fallback needed; the key is brand-new).
- [X] T016 [US1] Extend the `update_ai_settings` enable-time gate in `src-tauri/src/commands/ai.rs` with an `else if provider == "ollama"` branch identical in shape to the existing `"custom"` branch but reading `OLLAMA_BASE_URL_KEY`.
- [X] T017 [US1] Add the `else if provider == "ollama"` arm to `enhance_transcription` in `src-tauri/src/commands/ai.rs` per `contracts/ipc-commands.md` §4. Reads `OLLAMA_BASE_URL_KEY` (default `DEFAULT_OLLAMA_BASE_URL`) and `OLLAMA_NO_AUTH_KEY` (default `true`); reads `ai_api_key_ollama` from cache; sets `options.no_auth = no_auth || cached.is_none()`. Returns the `("ollama".to_string(), cached.unwrap_or_default(), opts)` tuple — matching the factory dispatch arm added in T006. **Privacy check**: assert by code review that this arm has zero references to `gemini`, `anthropic`, or any cloud base URL constant (FR-004 / FR-010).

#### Frontend (TypeScript / React)

- [X] T018 [P] [US1] Insert the Ollama entry into `AI_PROVIDERS` in `src/types/providers.ts` between the `gemini` and `custom` entries. Use `{ id: "ollama", name: "Ollama", color: "text-purple-600" /* pick a distinct hue */, apiKeyUrl: "https://ollama.com/library", isCustom: true }`. (`isCustom: true` makes `useProviderModels` short-circuit and `ProviderCard` show the gear/Configure button — no curated model list needed.)
- [X] T019 [P] [US1] Append `"ollama"` to the providers array in `loadApiKeysToCache()` in `src/utils/keyring.ts` so cached bearer tokens (rare proxied case) are warmed at startup.
- [X] T020 [US1] Add the privacy helper line in `src/components/OpenAICompatConfigModal.tsx` directly under the existing `<p className="text-xs text-muted-foreground">Examples: …</p>`: `<p className="text-xs text-muted-foreground">Privacy depends on the host you control.</p>`. Required by the Edge Case clarification recorded in spec.md.
- [X] T021 [US1] Extend `handleSetupApiKey` in `src/components/sections/EnhancementsSection.tsx` so `providerId === "ollama"` opens the existing `OpenAICompatConfigModal` with `defaultBaseUrl = "http://localhost:11434/v1"` (read first from `get_openai_config`-style logic stored under `ai_ollama_base_url` if present, falling back to the default).
- [X] T022 [US1] Extend the `OpenAICompatConfigModal` `onSubmit` callback in `src/components/sections/EnhancementsSection.tsx` so that when the active selected provider is `"ollama"`: invoke `validate_and_cache_api_key({provider:"ollama", baseUrl, apiKey: trimmedKey || undefined, model})` (replaces the current Custom-only `set_openai_config` + `saveApiKey('custom', …)` path; mirror the same try/catch/toast structure). Also call `saveApiKey('ollama', trimmedKey)` only when a key was supplied. Then `invoke('update_ai_settings', {enabled:nextEnabled, provider:'ollama', model: trimmedModel})` and update local state (`setAISettings`, `setProviderApiKeys`).
- [X] T023 [US1] Update the `isActive` and `selectedModel` ProviderCard derivations in `src/components/sections/EnhancementsSection.tsx` so the `"ollama"` provider is treated identically to `"custom"` for activeness display: `isActive = provider.isCustom ? (aiSettings.provider === provider.id && providerApiKeys[provider.id] && aiSettings.enabled) : ...` (the existing condition uses literal `'custom'` — generalize it to any `isCustom: true` provider so this works for both).
- [X] T024 [US1] Track `ollamaModelName` in `src/components/sections/EnhancementsSection.tsx` so the Ollama card shows the configured model under the card title. Mirrors the existing `customModelName` state + the `if (settings.provider === 'custom') setCustomModelName(settings.model)` line; add a sibling for `'ollama'`. Pass it as `customModelName` prop to the matching `ProviderCard`.

### Manual verification for User Story 1

- [ ] T025 [US1] Run `pnpm tauri dev` and walk through quickstart.md "Happy-path verification" steps 1–11. Confirm SC-001 (<2 min), SC-002 (only loopback traffic in `nettop -P -p $(pgrep voicetypr)`), SC-005 (≤3 user interactions to switch active provider). Capture the `nettop` summary as evidence in the PR description (Constitution IV: UI-affecting PR manual-test note).

**Checkpoint**: User Story 1 fully functional. The feature is shippable as MVP at this point.

---

## Phase 4: User Story 2 — Recover gracefully when Ollama is not reachable (Priority: P2)

**Goal**: When the Ollama daemon is down or the chosen model isn't pulled, the user sees a clear, specific error toast naming the configured URL, the raw transcription is inserted at the cursor as a fallback, and no cloud request is made.

**Independent Test**: Run quickstart.md "Failure-mode verification" sections "Server unreachable" and "Model not found." Pass criterion: error toast appears within 5 s (SC-003), raw transcription is at the cursor (FR-007 b), and `nettop` shows zero non-loopback traffic during the failed attempt.

### Tests for User Story 2

- [X] T026 [P] [US2] Add backend test in `src-tauri/src/ai/tests.rs` (or `src-tauri/src/commands/ai.rs::tests` — pick whichever is closer to the failure injection point) that exercises `enhance_transcription`'s ollama arm with `ai_provider = "ollama"` set in a temporary store and a mock URL pointing at a closed port. Assert the returned `Err(...)` message includes the configured URL and "network" / "connection" wording. Skip if the existing test infrastructure can't easily mock the store — in that case, add a lighter unit test confirming `OpenAIProvider::new` with an Ollama-style options map produces a provider whose `enhance_text` would route to the supplied URL (no network call needed).
- [X] T027 [P] [US2] Frontend test in `src/components/sections/__tests__/EnhancementsSection.test.tsx`: mock `enhance_transcription` to reject with a string containing `"http://localhost:11434/v1"` and `"network error"`; emit a `formatting-error` event with the rejection message; assert the `toast.error` is called with text mentioning the URL.

### Implementation for User Story 2

The dictation pipeline already inserts the raw transcription on `enhance_transcription` failure (existing behavior in the audio command flow), so most of US2 is covered by US1 + verifying error-message quality. Concrete tweaks:

- [X] T028 [US2] In `src-tauri/src/commands/ai.rs::enhance_transcription`, before returning the formatting error, log the configured Ollama base URL and the underlying `AIError` variant separately (so the UI toast and the log file together let the user distinguish "server unreachable" / "model not found" / "auth failed"). Reuse `log::error!` — no new logging crate.
- [X] T029 [US2] Confirm the `pill_toast` and `formatting-error` event payload in `src-tauri/src/commands/ai.rs::enhance_transcription` carry a string usable by the frontend toast. If the current message is too generic, prepend the configured URL: `format!("AI formatting failed at {}: {}", base_url, e)`. Keep this within the existing single-line toast — no new IPC events.

### Manual verification for User Story 2

- [ ] T030 [US2] With Ollama configured and active, stop the daemon (`brew services stop ollama` or kill `ollama serve`). Trigger a dictation, observe (a) toast within 5 s names `http://localhost:11434/v1`, (b) raw transcription at cursor, (c) `nettop` shows no outbound non-loopback request. Capture in PR.
- [ ] T031 [US2] With Ollama running, change configured model to a deliberately invalid id (`fake-model:nonexistent`). Trigger a dictation. Observe a "model not found" style error and raw transcription inserted.

**Checkpoint**: US1 + US2 both work independently and reinforce the privacy contract on failure paths.

---

## Phase 5: User Story 3 — Validate the Ollama configuration before saving (Priority: P3)

**Goal**: From the Ollama config sheet, the user can click **Test connection** and within 5 s see either a success indicator with measured latency, or a specific error category (server unreachable / model not found / auth failed). Reuses the existing Test action in the shared modal — no new modal, no new command.

**Independent Test**: Open the Ollama config sheet (already wired by US1's T021), enter URL+model, click **Test**. Observe a green "Connection successful" or a red error within 5 s (SC-003). Verified per quickstart.md happy-path step 6 and failure-mode "Model not found" path.

### Tests for User Story 3

- [X] T032 [P] [US3] Add a test in `src/components/OpenAICompatConfigModal.test.tsx` that mocks `test_openai_endpoint` to resolve, then clicks **Test** with `defaultBaseUrl="http://localhost:11434/v1"`, model `"llama3.2:3b"`, no API key. Assert the button label transitions through "Testing…" → result row "Connection successful" and that **Save** becomes enabled.
- [X] T033 [P] [US3] Add a counterpart test in `src/components/OpenAICompatConfigModal.test.tsx` that mocks `test_openai_endpoint` to reject with `"Model 'llama3.2:3b' not found in endpoint model list"`; assert the result row shows that exact message and **Save** stays disabled.

### Implementation for User Story 3

- [X] T034 [US3] No new code expected — the shared modal's Test action already invokes `test_openai_endpoint`, which already runs `run_openai_probe_request(..., allow_chat_probe_fallback = true)`. Validate this by reading `src-tauri/src/commands/ai.rs::test_openai_endpoint` and confirming the call site passes `allow_chat_probe_fallback = true` for the Ollama URL (it currently does — the parameter is hard-coded `true` in `test_openai_endpoint`). Note in PR description: "Test action confirmed to work for Ollama with no backend changes."

### Manual verification for User Story 3

- [ ] T035 [US3] Open the Ollama config sheet. With Ollama running and `llama3.2:3b` pulled, click **Test**. Confirm green "Connection successful" within 5 s (SC-003). Then change the model to `not-pulled-model:99b` and click **Test** again — confirm a "model not found" error within 5 s. Capture in PR.

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: User-facing copy fixups, regression checks, constitutional gate.

- [X] T036 [P] Update Setup Guide copy in `src/components/sections/EnhancementsSection.tsx` (lines around `"Choose a provider above (OpenAI, Anthropic, or Google)"` in the inline `<ol>`) to mention Ollama, e.g., `"Choose a provider above (OpenAI, Anthropic, Google, or Ollama)"`. Keep upstream wording style.
- [X] T037 [P] Verify CLAUDE.md SPECKIT block points at this feature's plan (already updated by `/speckit-plan`; sanity check only — no edit if pointer already correct).
- [X] T038 Run `pnpm lint && pnpm typecheck && pnpm test` from repo root. All four MUST pass green (Constitution IV). Address any new warnings — do NOT add `any` or disable rules.
- [X] T039 Run `cargo test` from `src-tauri/`. All MUST pass green (Constitution IV). Address any new Rust warnings — do NOT add `#[allow(...)]`.
- [ ] T040 End-to-end manual run of quickstart.md "Privacy-guarantee verification" + "Coexistence with Custom provider" + "Custom-prompt coexistence" sections. Confirm FR-004, FR-010, FR-012, FR-005, FR-008 with `nettop` evidence captured in PR.
- [ ] T041 PR description includes: (a) one-line statement of which constitutional principles the change touches and how it stays compliant (Constitution Compliance review), (b) manual-test note (Constitution IV), (c) `nettop` evidence excerpt for SC-002.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1, T001-T002)**: No dependencies; can start immediately.
- **Foundational (Phase 2, T003-T006)**: Depends on Setup; **BLOCKS all user stories** because every US task either reads the new constants or dispatches through the new factory arm.
- **US1 (Phase 3, T007-T025)**: Depends on Foundational. The MVP.
- **US2 (Phase 4, T026-T031)**: Depends on US1's backend (T014-T017) being merged, because US2 verifies failure paths through the same dispatch.
- **US3 (Phase 5, T032-T035)**: Depends on US1's frontend (T021) being merged, because US3 exercises the same modal opened from the Ollama card.
- **Polish (Phase 6, T036-T041)**: Depends on US1 (mandatory), and US2/US3 if they're in the same PR.

### Within Each User Story

- Tests for US1 (T007-T013) can be written in parallel with the implementation tasks of the same story; running them red → green is the verification step.
- Backend tasks (T014-T017) are sequential because they all edit `src-tauri/src/commands/ai.rs` — same file.
- Frontend tasks T018, T019, T020 edit different files and can run in parallel; T021-T024 share `EnhancementsSection.tsx` and must serialize.

### Parallel Opportunities

- T001 + T002 (Setup): independent files / commands.
- T007 + T008 + T009 + T010 (Rust unit tests): same file (`src-tauri/src/ai/tests.rs`) but additive; safe to write in one editing session.
- T011 + T012 + T013 (Frontend tests): different test files (modal vs. enhancements section), parallelizable.
- T018 + T019 + T020 (Frontend code): different files, parallelizable.
- T026 + T027 (US2 tests): different files, parallelizable.
- T032 + T033 (US3 tests): same file but independent test cases.
- T036 + T037 (Polish): different files, parallelizable.

---

## Parallel Example: User Story 1

Within US1, after the Foundational phase is done, three parallel tracks can run:

```text
Track A (Backend tests): T007, T008, T009, T010   [src-tauri/src/ai/tests.rs + commands/ai.rs::tests]
Track B (Backend impl):  T014 → T015 → T016 → T017  [serial; same file]
Track C (Frontend tests):T011, T012, T013         [different test files; parallel]
Track D (Frontend impl): T018 || T019 || T020 then T021 → T022 → T023 → T024
```

A single developer takes Track B then Track D in sequence (~1 working session) and runs Tracks A and C alongside as commit-the-test-then-the-code units.

---

## Implementation Strategy

### MVP First (US1 only — recommended)

1. Phase 1: Setup (verify Ollama dev environment, baseline tests green).
2. Phase 2: Foundational (constants + factory arm).
3. Phase 3: US1 (full happy path + tests).
4. **STOP and VALIDATE**: Run quickstart.md happy-path; capture `nettop`; merge.
5. Ship as the first user-visible increment.

US1 alone delivers the entire spec promise per the spec's "Why this priority" — local Ollama formatting works, privacy holds, presets work, all four formatting modes apply.

### Incremental Delivery

1. MVP merge: US1 + Polish (T036-T041 minus US2/US3 sections).
2. Follow-up PR: US2 (graceful failure) — independently testable.
3. Follow-up PR: US3 (Test action coverage) — purely test additions if T034 confirms no code change needed.

This split is rebase-friendly (Constitution I): each PR adds without touching what the previous PR shipped.

### Single-PR Strategy (also acceptable)

Because the total diff is small (~30 lines Rust per SC-006 plus a few hundred lines of TS), shipping all three stories in one PR is reasonable. Verification is then quickstart.md end-to-end.

---

## Notes

- [P] tasks = different files, no dependencies; same-file [P] is permitted only when the edits are independent additions (e.g., separate test functions).
- [Story] label maps each task to a user story for traceability.
- Each user story is independently completable and independently testable.
- Verify tests fail (red) before implementing; verify they pass (green) after.
- Commit after each task or each tightly-coupled task group; commit messages use Conventional Commits per Constitution Development Workflow.
- Avoid: introducing `any` in TS, adding `#[allow(...)]` in Rust, growing the diff by reformatting upstream code, adding new dependencies (Constitution III).
- The implementation MUST add zero new runtime dependencies — verified by reading the post-merge `package.json` and `src-tauri/Cargo.toml` diffs.
