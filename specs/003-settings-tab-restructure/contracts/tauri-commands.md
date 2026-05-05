# Tauri Command Contracts — Prompt Library

**Phase**: 1 (Design & Contracts) | **Module**: `src-tauri/src/commands/ai.rs`

These commands replace the old `get_custom_prompts` / `update_custom_prompts` pair and extend `get_enhancement_options` / `update_enhancement_options` with a unified prompt-library API. Backward-compat: the old commands remain registered for one release with a one-line `#[deprecated]` note (so anything still calling them gets a compile-time warning but the binary doesn't break); they are removed in the release after.

## Conventions

- All cmds are `#[tauri::command] pub async fn`.
- Errors return `Result<T, String>` with a short human-readable message; UI is responsible for translating common patterns into user-friendly toasts.
- `Prompt` and `PromptLibrary` types are defined in `src-tauri/src/ai/prompts.rs` and exported from `src-tauri/src/ai/mod.rs`. Types are `serde`-derived and serialize identically to the persisted JSON.

## Commands

### `list_prompts`

```rust
async fn list_prompts(app: AppHandle) -> Result<PromptLibrary, String>
```

Returns the full library. Used by the Prompts tab on mount. UI sorts/filters client-side.

**Error cases**: store unavailable; library blob present but malformed (return `"corrupt prompt library: <reason>"` and let UI offer "reset to defaults").

---

### `create_prompt`

```rust
async fn create_prompt(
    app: AppHandle,
    name: String,
    icon: String,
    prompt_text: String,
) -> Result<Prompt, String>
```

Creates a new custom prompt. Server-side: assigns `id = "custom:" + uuidv4()`, `kind = "custom"`. Validates `name`, `icon` (allowlist), `prompt_text` (non-empty, ≤ 8192 bytes). Appends to library, persists, returns the created `Prompt`.

**Error cases**: validation failure (`"name must be non-empty"`, `"icon not in allowlist"`, `"prompt_text must be non-empty"`, `"prompt_text exceeds 8192 bytes"`); store write failure.

---

### `update_prompt`

```rust
async fn update_prompt(
    app: AppHandle,
    id: String,
    name: Option<String>,
    icon: Option<String>,
    prompt_text: Option<String>,
) -> Result<Prompt, String>
```

Partial update — only fields with `Some` are mutated. Validation same as `create_prompt`. Works for both built-in and custom prompts; for built-ins, `id`, `kind`, `builtin_id` remain immutable. Returns the updated `Prompt`.

**Error cases**: `"prompt not found: <id>"`; validation failures; store write failure. Empty `prompt_text` after trim → `"prompt_text must be non-empty"` (FR-013a).

---

### `delete_prompt`

```rust
async fn delete_prompt(app: AppHandle, id: String) -> Result<PromptLibrary, String>
```

Deletes a custom prompt. Returns the new library (UI refreshes from the result). If the deleted prompt was active, server-side falls back `active_prompt_id` to `"builtin:default"` (FR-011).

**Error cases**: `"prompt not found: <id>"`; `"cannot delete built-in prompt"` (FR-009); store write failure.

---

### `reset_prompt_to_default`

```rust
async fn reset_prompt_to_default(app: AppHandle, id: String) -> Result<Prompt, String>
```

Resets a built-in prompt's `name`, `icon`, and `prompt_text` to their shipped defaults atomically (FR-009). Returns the reset `Prompt`. Custom prompts cannot be reset (no shipped default exists).

**Error cases**: `"prompt not found: <id>"`; `"cannot reset custom prompt"`; store write failure.

---

### `set_active_prompt`

```rust
async fn set_active_prompt(app: AppHandle, id: String) -> Result<String, String>
```

Sets `active_prompt_id` to the given id after verifying the prompt exists. Returns the new `active_prompt_id`.

**Error cases**: `"prompt not found: <id>"`; store write failure.

---

### `get_active_prompt`

```rust
async fn get_active_prompt(app: AppHandle) -> Result<Prompt, String>
```

Returns the resolved active `Prompt` (not just its id). Used at recording time by the AI provider call sites — replaces the old combo of `get_enhancement_options` + `get_custom_prompts` + manual override-resolution.

**Error cases**: `"active prompt not found in library: <id>"` (corruption); store read failure.

---

## Deprecated commands (keep for one release with `#[deprecated]`)

- `get_enhancement_options` — replaced by `get_active_prompt` for runtime use; library introspection now via `list_prompts`.
- `update_enhancement_options` — replaced by `set_active_prompt`.
- `get_custom_prompts` — replaced by `list_prompts`.
- `update_custom_prompts` — replaced by `update_prompt` (per-id) + `create_prompt`.
- `get_default_prompts` — folded into `reset_prompt_to_default` server-side; UI no longer needs to know shipped defaults.

Removal target: the release after the one shipping this feature. Add a tracking note in CHANGELOG.

## Migration command (internal)

Not a public Tauri cmd — invoked from `lib.rs` `setup` hook. Conceptually:

```rust
fn migrate_prompt_library_v1(app: &AppHandle) -> Result<(), String>
```

Implements the migration described in `data-model.md`. Idempotent. Tested via unit tests in `src-tauri/src/migrations/prompt_library_v1.rs`.
