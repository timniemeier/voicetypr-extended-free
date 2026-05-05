# Data Model — Settings Tab Restructure

**Phase**: 1 (Design & Contracts) | **Branch**: `003-settings-tab-restructure` | **Date**: 2026-05-04

## Entities

### Prompt

A named, icon-decorated piece of post-processor instruction text. Either built-in (one of the four shipped presets, with editable user overrides) or custom (user-created, deletable).

**Fields**:

| Field | Type | Built-in | Custom | Notes |
|---|---|---|---|---|
| `id` | string | required | required | Stable handle. Built-ins: `"builtin:default"`, `"builtin:prompts"`, `"builtin:email"`, `"builtin:commit"`. Custom: `"custom:" + UUIDv4`. |
| `kind` | `"builtin" \| "custom"` | required | required | Discriminator. |
| `builtin_id` | `"default" \| "prompts" \| "email" \| "commit"` | required | absent | Used by `build_enhancement_prompt` to apply the language-aware base assembly. Custom prompts skip that path. |
| `name` | string | required, non-empty, ≤ 64 chars | required, non-empty, ≤ 64 chars | Display name. Built-ins start with shipped name; user can override. |
| `icon` | string (lucide name) | required, from allowlist | required, from allowlist | See R6 in research.md for allowlist. |
| `prompt_text` | string | required, non-empty, ≤ 8192 bytes | required, non-empty, ≤ 8192 bytes | Full prompt text. Empty rejected (FR-013a). |

**Validation rules**:

- `name`: non-empty, ≤ 64 chars after trim. Whitespace-only ≡ empty.
- `prompt_text`: non-empty, ≤ `MAX_CUSTOM_PROMPT_LEN` = 8192 bytes. Whitespace-only ≡ empty.
- `icon`: must be one of the 16 names in the allowlist.
- Built-ins: `id` must match the canonical built-in id; `builtin_id` must match `id` after stripping `"builtin:"` prefix.
- Custom: `id` must start with `"custom:"` followed by a UUIDv4.

**State transitions**:

- *Built-in created* — never. Built-ins are seeded by migration on first run; their existence is invariant.
- *Built-in edited* — `name`, `icon`, `prompt_text` may change. `id`, `kind`, `builtin_id` are immutable.
- *Built-in reset* — atomic restore of `name` + `icon` + `prompt_text` to shipped defaults (per FR-009).
- *Built-in deleted* — forbidden (FR-009).
- *Custom created* — id assigned, kind = "custom", builtin_id absent.
- *Custom edited* — any of name / icon / prompt_text. id, kind immutable.
- *Custom reset* — N/A. No shipped default to reset to.
- *Custom deleted* — entry removed. If was active → fallback per FR-011.

---

### PromptLibrary

The persistent collection of prompts plus the active selection.

**Fields**:

| Field | Type | Notes |
|---|---|---|
| `version` | integer | Schema version. v1 for this feature. Future migrations bump and re-seed. |
| `active_prompt_id` | string | The id of the currently active Prompt. Must reference a prompt in `prompts`. Defaults to `"builtin:default"` after migration. |
| `prompts` | `Prompt[]` | All prompts. Ordering: built-ins first in canonical order (default, prompts, email, commit), then custom in creation order (newest last). |

**Invariants**:

- Exactly four built-ins always exist with the canonical ids. Migration guarantees this; CRUD cmds enforce it.
- `active_prompt_id` always references an existing prompt. On custom-prompt deletion that was active, fallback re-points to `"builtin:default"` (FR-011).
- No two prompts share an `id`.

**Persistence**:

- One JSON blob under `tauri-plugin-store` key `prompts`. Atomic writes.
- Legacy keys `enhancement_options` and `custom_prompts` are NOT deleted post-migration — left for forensic recovery. New code never reads them.

---

### Settings tab definition (frontend-only)

The sidebar's tab list — pure UI structure, not persisted.

**Fields**: `id`, `label`, `icon`, `route` (implicit via switch on `id` in `App.tsx`).

**Restructure**:

- **Removed**: tab id `models` (label "Models"), tab id `formatting` (label "Formatting").
- **Added**: tab id `prompts` (label "Prompts").
- **Added (replacing removed)**: tab id `llm-models` (label "LLM Models"), tab id `stt-models` (label "STT Models").
- **Order**: `stt-models` → `prompts` → `llm-models` (between `general` and `about`). Per spec Q6.

---

## Migration: legacy → v1

**Trigger**: app startup, when `prompts` key is absent from `tauri-plugin-store` (or present but `version < 1`).

**Inputs** (read from `tauri-plugin-store`):

- `enhancement_options`: optional `{ preset: "Default" | "Prompts" | "Email" | "Commit" }`. Absent → treat preset as `"Default"`.
- `custom_prompts`: optional `{ base, prompts, email, commit }` each `Option<String>`. Absent or empty fields → use shipped defaults.

**Output**: a `PromptLibrary` v1 blob written under the `prompts` key.

**Mapping**:

| Source | Target |
|---|---|
| (always) | Built-in `default` with shipped name/icon/text. |
| `custom_prompts.prompts` (Some, non-empty) | Built-in `prompts.prompt_text` ← override; otherwise shipped default. |
| `custom_prompts.email` (Some, non-empty) | Built-in `email.prompt_text` ← override; otherwise shipped default. |
| `custom_prompts.commit` (Some, non-empty) | Built-in `commit.prompt_text` ← override; otherwise shipped default. |
| `custom_prompts.base` | **Dropped**. Document in release notes — the new model has no separate base template; built-ins each carry their full prompt. Users who customized only `base` should re-author their intent in the four built-ins' `prompt_text`. |
| `enhancement_options.preset` | `active_prompt_id` ← `"builtin:" + lowercase(preset)`. Absent → `"builtin:default"`. |

**Failure modes**:

- Read failure on either legacy key → log + continue with shipped defaults (don't block app startup).
- Write failure on the new `prompts` key → migration aborts; legacy keys untouched; app surfaces a one-shot toast on next foreground (or fails silently — TBD by /speckit-tasks).

**Idempotency**: After successful write, the `version: 1` marker prevents re-running the migration. If the user manually deletes the `prompts` key, the next startup re-derives state from the still-present legacy keys.
