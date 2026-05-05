# Settings Store Contracts — `tauri-plugin-store` Keys

**Phase**: 1 (Design & Contracts) | **Storage**: `tauri-plugin-store` JSON file (path: standard Tauri app-data location)

## New keys

### `prompts` (the library)

```jsonc
{
  "version": 1,
  "active_prompt_id": "builtin:default",
  "prompts": [
    {
      "id": "builtin:default",
      "kind": "builtin",
      "builtin_id": "default",
      "name": "Default",
      "icon": "FileText",
      "prompt_text": "<long string ≤ 8192 bytes>"
    },
    {
      "id": "builtin:prompts",
      "kind": "builtin",
      "builtin_id": "prompts",
      "name": "Prompts",
      "icon": "Sparkles",
      "prompt_text": "..."
    },
    {
      "id": "builtin:email",
      "kind": "builtin",
      "builtin_id": "email",
      "name": "Email",
      "icon": "Mail",
      "prompt_text": "..."
    },
    {
      "id": "builtin:commit",
      "kind": "builtin",
      "builtin_id": "commit",
      "name": "Commit",
      "icon": "GitCommit",
      "prompt_text": "..."
    }
  ]
}
```

**Read pattern**: `list_prompts` returns this blob. `get_active_prompt` resolves `active_prompt_id` → matching entry.

**Write pattern**: any cmd that mutates the library does a read-modify-write of the entire blob (atomic at the `tauri-plugin-store` layer). Concurrency is not a concern (single Tauri main thread for cmd dispatch).

**Schema evolution**: bump `version` and add a one-shot migration in `src-tauri/src/migrations/`. Code reading the blob branches on `version` to apply forward-migrations on the fly if needed.

---

## Legacy keys (read-only after migration)

### `enhancement_options` (legacy)

```jsonc
{ "preset": "Default" | "Prompts" | "Email" | "Commit" }
```

Migration reads this once; new code never reads or writes this key after migration completes. Left in place for forensics.

### `custom_prompts` (legacy)

```jsonc
{
  "base":    "string | null",
  "prompts": "string | null",
  "email":   "string | null",
  "commit":  "string | null"
}
```

Migration reads this once. `base` field has no equivalent in the new model and is dropped (documented in release notes). The other three become the corresponding built-in's `prompt_text`.

---

## Unchanged keys (touched by adjacent features only)

This feature does NOT modify any of these keys:

- `current_model`, `current_model_engine` (STT engine selection — STT Models tab content unchanged)
- `language` (spoken-language picker — STT Models tab content unchanged)
- `hotkey`, `ptt_hotkey`, `recording_mode` (Settings tab — out of scope)
- `pill_indicator_*` (Settings tab — out of scope)
- AI provider config keys (`api_key_*`, model selection per provider — LLM Models tab uses these unchanged)

Listed here so that during code review we can verify no migration code or new write paths accidentally touch these.
