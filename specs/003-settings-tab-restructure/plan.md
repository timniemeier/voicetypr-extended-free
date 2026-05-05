# Implementation Plan: Settings Tab Restructure — Prompts as a First-Class Tab

**Branch**: `003-settings-tab-restructure` | **Date**: 2026-05-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-settings-tab-restructure/spec.md`

## Summary

Restructure the settings sidebar slot today occupied by **Models** + **Formatting** into three first-class tabs:

1. **Prompts** — new tab. Two-pane prompt library: search + grouped list (BUILT-IN: Default, Prompts, Email, Commit; CUSTOM: user-created) on the left; name + icon + prompt-text editor on the right. Active prompt indicated by an orange dot, decoupled from row-selection.
2. **LLM Models** — renamed from `Formatting`. Provider/model/API-key UI + Setup Guide. The duplicate active-preset selector and the `Custom Prompts (Advanced)` collapsible are removed (their functions moved to Prompts).
3. **STT Models** — renamed from `Models`. Same content (Whisper / Parakeet downloads, engine select, language picker); only the label changes.

Technical approach: introduce a new `Prompt` library entity (kind = built-in | custom; fields = id, name, icon, prompt_text, optional shipped-default fields for built-ins) persisted in `tauri-plugin-store` under a new `prompts` key. The existing `enhancement_options.preset` field is repurposed as `active_prompt_id` (string), with a one-shot migration that translates the four enum values + any `custom_prompts` overrides into the new library. Backend `build_enhancement_prompt` continues to use the four built-in template strings via a stable lookup; custom prompts replace the entire transform string. UI: new `PromptsSection.tsx`, refactored `EnhancementsSection.tsx` (renamed surface "LLM Models", `EnhancementSettings` pill picker + `Custom Prompts (Advanced)` block deleted), `ModelsSection.tsx` header relabeled, `Sidebar.tsx` tab list updated.

## Technical Context

**Language/Version**: TypeScript 5.x (frontend), Rust 1.75+ (backend) — pinned by upstream.
**Primary Dependencies**: Tauri v2, React 19, Tailwind v4, shadcn/ui, lucide-react (icons), `tauri-plugin-store` (persistence). No new deps planned.
**Storage**: `tauri-plugin-store` keyed JSON (existing). New key `prompts` (library). Existing `enhancement_options` shape evolves: `preset` → `active_prompt_id`. Existing `custom_prompts` key is consumed by migration then deleted.
**Testing**: Vitest + Testing Library (frontend); `cargo test` (backend). Existing tests in `src/components/__tests__/`, `src-tauri/src/ai/tests.rs`, `src-tauri/src/tests/`.
**Target Platform**: macOS 13+ (per constitution). No platform-specific work in this feature.
**Project Type**: desktop-app (Tauri v2 + React).
**Performance Goals**: Prompts tab renders in <50ms with up to 100 custom prompts. No hot-path impact (transcription/inference unchanged). Active-prompt resolution at recording time stays an in-memory lookup — no extra I/O.
**Constraints**: Offline-first preserved (no new network calls). Per-prompt `MAX_PROMPT_LEN` enforced backend-side (reuse existing `MAX_CUSTOM_PROMPT_LEN = 8192`). Migration must be idempotent and run on first post-upgrade launch only.
**Scale/Scope**: Personal-use fork. Realistic upper bound: a handful of users (maintainer + acquaintances), ~10–20 custom prompts per user. No multi-user concerns.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Upstream Fidelity**: Touched files split into upstream-shared and fork-local. **Sidebar.tsx**: fork-modified once (license-entry removal). Adding/renaming entries here is a one-line tweak, low rebase risk. **EnhancementsSection.tsx**: heavily fork-modified (the editable-prompts feature itself was fork-local — commits `be818c9`, `bd09e39`, `3db7bf6`). Pulling the prompt-editor out of this file actually *reduces* the fork's footprint inside it — net win for rebases. **ModelsSection.tsx**: header rename only; no structural change. **`EnhancementSettings.tsx`**: fork-local component (it's the preset pill picker; the editable-prompts work added it / extended it). Deletion is fork-local cleanup. **Backend `src-tauri/src/ai/prompts.rs`** + **`src-tauri/src/commands/ai.rs`**: fork-local extensions. New cmds + storage migration are additive on fork-local code. **Pass** — divergence stays bounded; the new code consolidates rather than scatters.

- **II. Privacy & Offline-First**: No new outbound calls. Prompts library is local JSON in `tauri-plugin-store`. AI provider integration unchanged — same active-prompt resolution at recording time. **Pass.**

- **III. Native Performance & Lean Dependencies**: No new npm or cargo deps. Hot path (audio capture / inference / text insertion) untouched — only the *configuration UI* moves; the build-prompt path stays in Rust. New UI work is straightforward React (lists, controls, validation) — no abstractions introduced past what's already present. **Pass.**

- **IV. Type Safety & Quality Gates**: New TS types (`Prompt`, `PromptKind`, `PromptLibrary`) will be strict, no `any`. New Rust types (`Prompt`, `PromptLibrary`) derive standard traits, warnings-clean. Migration code is fork-local with explicit unit tests. **Pass** (verified at re-check post-design).

- **V. Personal-Use Disclosure**: No README / About / release-artifact copy touched. Settings-UI strings only. **Pass.**

No violations → no rows in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-settings-tab-restructure/
├── plan.md              # This file
├── research.md          # Phase 0 — design choices + rationale
├── data-model.md        # Phase 1 — Prompt entity, library shape, migration
├── quickstart.md        # Phase 1 — manual smoke-test steps
├── contracts/
│   ├── tauri-commands.md  # Tauri cmd signatures for prompts CRUD + active selection
│   └── settings-store.md  # `tauri-plugin-store` key shapes (prompts, enhancement_options)
├── checklists/
│   └── requirements.md  # Spec quality checklist (already present)
└── tasks.md             # Phase 2 — generated by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── Sidebar.tsx                     # MODIFY: tab list (Models→STT, Formatting→LLM, +Prompts)
│   ├── EnhancementSettings.tsx         # DELETE: preset-pill picker, function moves to Prompts
│   ├── prompts/                        # NEW dir
│   │   ├── PromptList.tsx              # NEW: search + grouped list (BUILT-IN / CUSTOM)
│   │   ├── PromptRow.tsx               # NEW: single row (name, icon, badge, active dot)
│   │   ├── PromptEditor.tsx            # NEW: name/icon/prompt-text editor pane
│   │   └── IconPicker.tsx              # NEW: pick from a fixed lucide icon set
│   └── sections/
│       ├── PromptsSection.tsx          # NEW: top-level Prompts tab (composes PromptList + PromptEditor)
│       ├── EnhancementsSection.tsx     # MODIFY: header → "LLM Models"; remove EnhancementSettings + CustomPromptsAdvanced
│       └── ModelsSection.tsx           # MODIFY: header → "STT Models" (label only)
├── contexts/
│   └── SettingsContext.tsx             # MODIFY: drop `enhancementOptions.preset` redundancy, add prompts library bridge (optional)
├── hooks/
│   └── usePromptLibrary.ts             # NEW: list/create/update/delete/setActive helpers wrapping Tauri cmds
├── types/
│   └── ai.ts                           # MODIFY: replace EnhancementOptions.preset → active_prompt_id; add Prompt, PromptKind, PromptLibrary types
└── lib/
    └── prompts/
        └── builtins.ts                 # NEW: shipped-default Name + Icon + Prompt for the 4 built-ins (mirrors Rust)

src-tauri/src/
├── ai/
│   ├── prompts.rs                      # MODIFY: add Prompt + PromptLibrary structs; keep build_enhancement_prompt resolving active prompt by id
│   ├── mod.rs                          # MODIFY: export new types
│   └── tests.rs                        # MODIFY: cover migration + custom-prompt resolution
├── commands/
│   └── ai.rs                           # MODIFY: add list_prompts/create_prompt/update_prompt/delete_prompt/reset_prompt/set_active_prompt; deprecate update_custom_prompts
├── migrations/                         # NEW dir (or add to existing setup path)
│   └── prompt_library_v1.rs            # NEW: one-shot read-old → write-new on first post-upgrade launch
└── lib.rs                              # MODIFY: register new cmds; invoke migration on startup
```

**Structure Decision**: Keep the existing `src/components/sections/*Section.tsx` pattern. Add a `src/components/prompts/` subdirectory for the new Prompts tab's internal sub-components (List, Row, Editor, IconPicker) so the section file itself stays a thin composer. Backend additions stay inside `src-tauri/src/ai/` for the type/library layer and `src-tauri/src/commands/ai.rs` for the Tauri surface — matches today's organization.

## Complexity Tracking

> Empty — Constitution Check passed with no violations.
