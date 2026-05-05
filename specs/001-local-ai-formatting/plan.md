# Implementation Plan: Local LLM Text Formatting (Ollama)

**Branch**: `001-local-ai-formatting` | **Date**: 2026-05-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-local-ai-formatting/spec.md`

## Summary

Add **Ollama** as a fifth card in Settings → Formatting → AI Providers, alongside
OpenAI / Anthropic / Google Gemini / Custom (OpenAI-compatible). Ollama formats
transcribed text on-device by talking to the user's locally-running Ollama daemon
through its OpenAI-compatible endpoint (`http://localhost:11434/v1`).

**Technical approach (locked by the spec's AR-001..AR-005)**:

- **Backend (Rust)**: Add a thin `"ollama"` arm to
  `AIProviderFactory::create` in `src-tauri/src/ai/mod.rs` that constructs an
  existing `OpenAIProvider` with Ollama defaults (`base_url =
  http://localhost:11434/v1`, `no_auth = true`) overridable from the
  user's `AIProviderConfig.options`. Add `"ollama"` to `is_valid_provider` and
  to `ALLOWED_PROVIDERS` in `src-tauri/src/commands/ai.rs`. Wire the
  `enhance_transcription` dispatcher to build the same `("openai", "", opts)`
  factory tuple it already builds for the `custom` provider, but with the
  Ollama base URL and `no_auth` defaults. Reuse `test_openai_endpoint` and
  `validate_and_cache_api_key` for the connection probe and persistence.
- **Frontend (TypeScript / React)**: Append one entry (`id: "ollama"`,
  `isCustom: true`) to `AI_PROVIDERS` in `src/types/providers.ts`. Reuse
  `ProviderCard` and `OpenAICompatConfigModal` unchanged; the card opens the
  modal pre-filled with `defaultBaseUrl =
  "http://localhost:11434/v1"`. Persist the model under
  `ai_api_key_ollama` (no key when `no_auth=true`) and the URL under a new
  `ai_ollama_base_url` settings entry.
- **Privacy guarantee (FR-004 / FR-010)**: When Ollama is the active
  provider, no factory dispatch path can reach OpenAI / Anthropic / Gemini —
  the factory hands back an `OpenAIProvider` configured with the Ollama
  `base_url`, so reqwest only ever talks to that host. No silent cloud
  fallback on failure (FR-007).

No new Rust crates, no new npm packages, no new HTTP client, no new
trait — every existing test that exercises the cloud providers continues to
pass unchanged.

## Technical Context

**Language/Version**: Rust 1.75+ (Tauri v2 backend), TypeScript 5.x (React 19 frontend)
**Primary Dependencies**: Tauri v2, `reqwest` (already in tree), `tauri-plugin-store`,
`tauri-plugin-stronghold` (keyring), React 19, Tailwind CSS v4, shadcn/ui. **No new
runtime deps.**
**Storage**: Existing `tauri-plugin-store` (`settings` store) for non-secret config;
existing Stronghold keyring for the optional bearer token.
**Testing**: `cargo test` for backend (extends `src-tauri/src/ai/tests.rs` and
`src-tauri/src/commands/ai.rs::tests`), `vitest` for frontend (extends
`src/components/OpenAICompatConfigModal.test.tsx`,
`src/hooks/useProviderModels.test.ts`, and `src/components/sections/__tests__/EnhancementsSection.test.tsx`).
**Target Platform**: macOS 13+ (per Constitution); the Ollama path is
HTTP-over-loopback so it has no platform-specific code.
**Project Type**: Desktop app (Tauri v2: Rust backend + React frontend).
**Performance Goals**: SC-001 (sub-2-min set-up) and SC-003 (sub-5-s probe) —
both bounded by Ollama itself, not by anything we add. The dispatch arm we add
adds zero latency on the hot path (factory call cost is negligible).
**Constraints**: No outbound network calls beyond the user-configured Ollama URL
when Ollama is active (Constitution II, FR-004, FR-010). No bundled LLM weights
or Ollama binary (FR-011). Diff size budget per SC-006: ~30 lines of Rust in the
factory arm + a small frontend wrapper; the rest is reuse.
**Scale/Scope**: Single-user desktop. One new provider entry; ~150-300 net lines
across Rust + TS + tests + docs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Upstream Fidelity**: ✅ Complies. The plan only **appends** to existing
  upstream code — one match arm in `mod.rs`, one entry in
  `ALLOWED_PROVIDERS`, one branch in `enhance_transcription`, one entry in
  `AI_PROVIDERS`, plus tests. No upstream files renamed, moved, or
  reformatted. The `OpenAIProvider`, `ProviderCard`, and
  `OpenAICompatConfigModal` are reused without modification (the spec's
  AR-004 requires this).
- **II. Privacy & Offline-First**: ✅ Complies and **strengthens** the
  guarantee. The transcription path stays entirely offline; the new
  formatting path adds exactly one outbound destination — the
  user-configured Ollama URL (default loopback). No telemetry, no analytics,
  no silent cloud fallback (FR-007). The privacy disclosure in the UI
  acknowledges that user-supplied non-loopback URLs (LAN GPU box) are still
  the user's responsibility (Edge Cases).
- **III. Native Performance & Lean Dependencies**: ✅ Complies. **Zero** new
  npm or cargo dependencies. The hot path stays in Rust (existing
  `OpenAIProvider` HTTP client, no JS-side request work). The new code is a
  thin dispatcher and a defaults helper — no premature abstraction (third
  caller of `OpenAIProvider` after `openai` and `custom`).
- **IV. Type Safety & Quality Gates**: ✅ Complies. No new `any` in TS — the
  Ollama entry uses the existing `AIProviderConfig` shape. No new
  `#[allow(...)]` in Rust. PR will pass `pnpm lint && pnpm typecheck && pnpm
  test` and `cd src-tauri && cargo test`. UI change is verified by
  `pnpm tauri dev` against a real local Ollama (manual-test note in PR per
  Principle IV).
- **V. Personal-Use Disclosure**: ✅ Complies. No change to README, About
  section, or any release-artifact copy. The new in-app copy ("Local
  LLM via Ollama") is honest about scope ("BYO server, we don't bundle
  Ollama or any model files" per FR-011).

**Result**: All five principles pass. **No** entry in the Complexity Tracking
table is required.

## Project Structure

### Documentation (this feature)

```text
specs/001-local-ai-formatting/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── ipc-commands.md  # Tauri command contract (mostly reused)
├── checklists/          # already present (from /speckit-specify)
└── spec.md              # already present
```

### Source Code (repository root)

This feature touches a small, well-bounded set of existing files. No new
directories are created.

```text
src-tauri/                            # Rust / Tauri backend
├── src/
│   ├── ai/
│   │   ├── mod.rs                    # ✏️  Add `"ollama"` arm to AIProviderFactory::create
│   │   │                             #     Add `"ollama"` to is_valid_provider
│   │   ├── openai.rs                 # ⚪  Unchanged — Ollama uses it as-is
│   │   ├── anthropic.rs              # ⚪  Unchanged
│   │   ├── gemini.rs                 # ⚪  Unchanged
│   │   ├── prompts.rs                # ⚪  Unchanged
│   │   ├── config.rs                 # ⚪  Unchanged
│   │   └── tests.rs                  # ✏️  Add ollama factory-dispatch test
│   ├── commands/
│   │   └── ai.rs                     # ✏️  Add `"ollama"` to ALLOWED_PROVIDERS
│   │                                 #     Add `"ollama"` arm to enhance_transcription
│   │                                 #     Add `OLLAMA_BASE_URL_KEY` constant + helpers
│   │                                 #     Extend AI_PROVIDER_KEYS with "ai_api_key_ollama"
│   │                                 #     Extend validate_and_cache_api_key to accept "ollama"
│   │                                 #     Extend check_has_api_key to recognize ollama no-auth
│   └── lib.rs                        # ⚪  No change — all needed commands already registered

src/                                  # React / TypeScript frontend
├── types/
│   └── providers.ts                  # ✏️  Append `ollama` entry to AI_PROVIDERS
├── components/
│   ├── ProviderCard.tsx              # ⚪  Unchanged
│   ├── OpenAICompatConfigModal.tsx   # ⚪  Unchanged (already accepts defaultBaseUrl)
│   └── sections/
│       └── EnhancementsSection.tsx   # ✏️  Add ollama branch to handleSetupApiKey + onSubmit
│                                     #     Mirror the existing `custom` branch with Ollama defaults
├── hooks/
│   └── useProviderModels.ts          # ⚪  Unchanged — Ollama is treated as a custom (user-typed model)
└── utils/
    └── keyring.ts                    # ✏️  Append `'ollama'` to providers list in loadApiKeysToCache
```

**Structure Decision**: Tauri-style desktop app — the existing
`src-tauri/` (Rust) + `src/` (React) split applies. No new directories,
no new modules, no new traits. All changes are appends to existing files
listed above. This minimizes upstream-rebase risk (Constitution I).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

_No violations — table intentionally empty._
