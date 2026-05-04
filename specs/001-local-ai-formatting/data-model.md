# Phase 1 — Data Model: Local LLM Text Formatting (Ollama)

**Scope**: This feature does **not** introduce a new entity. It extends the
existing `AIProviderConfig` shape with one additional permitted value of the
`provider` field (`"ollama"`) and adds two new settings keys in the existing
`tauri-plugin-store` `settings` store.

---

## Existing entity (extended): `AIProviderConfig`

Defined in `src-tauri/src/ai/mod.rs`. **No struct change.** Only the
permitted values of `provider` change.

```rust
pub struct AIProviderConfig {
    pub provider: String,                                   // ⬅️ ADD "ollama" to allowed set
    pub model: String,                                      // user-supplied model id (e.g. "llama3.2:3b")
    #[serde(skip_serializing)]
    pub api_key: String,                                    // typically empty for ollama (no_auth)
    pub enabled: bool,
    #[serde(default)]
    pub options: HashMap<String, serde_json::Value>,        // ⬅️ holds base_url + no_auth for ollama
}
```

| Field | For `provider = "ollama"` | Validation |
|-------|---------------------------|------------|
| `provider` | `"ollama"` | Must match `^[a-zA-Z0-9_-]+$` AND be in `ALLOWED_PROVIDERS = ["gemini", "openai", "anthropic", "custom", "ollama"]`. |
| `model` | User-typed string (e.g. `"llama3.2:3b"`, `"qwen2.5:7b"`). No curated list (matches `custom` behavior). | Non-empty when `enabled = true`. No format constraint — Ollama accepts any model the user has pulled. |
| `api_key` | Empty string by default. Optional bearer token for proxied Ollama setups. | Allowed empty when `options.no_auth = true`. |
| `enabled` | Standard bool. | When `true`, must have a model selected. |
| `options.base_url` | Defaults to `"http://localhost:11434/v1"`. User-overridable. | URL string. Must include the version segment (`/v1`); `OpenAIProvider::new` appends `/chat/completions` to it. |
| `options.no_auth` | Defaults to `true`. | Boolean. When `true`, no `Authorization` header is sent. |

**Validation summary**: All validation paths (`validate_provider_name`,
`OpenAIProvider::new`, `AIEnhancementRequest::validate`) already cover the
above. The only change required is widening the `ALLOWED_PROVIDERS` allowlist
to include `"ollama"`.

---

## New persisted settings keys (in the existing `settings` store)

These are **values inside the existing `tauri-plugin-store` `settings`
store** — there is no new store, no new schema file, and the upstream store
plumbing is untouched.

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `ai_ollama_base_url` | `string` | `"http://localhost:11434/v1"` | The Ollama OpenAI-compatible endpoint URL. Separate from `ai_custom_base_url` so existing `Custom` configurations are unaffected (spec Edge Case + FR-012). |
| `ai_ollama_no_auth` | `bool` | `true` | Whether the request omits the `Authorization` header. Default `true` because Ollama by default requires no auth. |

`ai_provider` (already exists) gets one new permitted value: `"ollama"`.

`ai_model` (already exists) gets used identically — stores the user-typed
model id when `ai_provider = "ollama"`.

---

## Secret store key (Stronghold)

| Key | Type | Stored when | Notes |
|-----|------|-------------|-------|
| `ai_api_key_ollama` | `string` | Only if user toggles `no_auth = false` and supplies a bearer token. Most users never have this. | Stored via existing `keyringSet` flow in `src/utils/keyring.ts`. Backend `AI_PROVIDER_KEYS` constant in `src-tauri/src/commands/ai.rs` is extended to include this key for cache-warming on startup. |

---

## State transitions

The provider's lifecycle is unchanged from existing providers:

```text
[unconfigured]
      │
      │  user clicks Ollama card → modal opens with defaults
      ▼
[modal open]
      │
      │  user clicks "Test" → run_openai_probe_request
      ▼
[modal: tested-ok]
      │
      │  user clicks "Save" → store.set(ai_ollama_base_url, ai_ollama_no_auth, ai_provider="ollama", ai_model)
      │                     + (optional) Stronghold.set(ai_api_key_ollama)
      │                     + cache_ai_api_key("ollama", ...) when key present
      ▼
[configured, inactive]   ← provider card now shows "Configure" (gear icon) + Trash
      │
      │  user clicks the card → setActive("ollama") (already wired via handleSelectModel)
      ▼
[configured, active]
      │
      │  dictation pipeline → enhance_transcription("…") → factory.create("ollama") → OpenAIProvider HTTP call
      ▼
   [formatted text inserted]
```

Removal:

```text
[configured *] → user clicks Trash → confirm → keyringDelete + clear_ai_api_key_cache + (frontend) reset to [unconfigured]
```

State transitions are identical to the `custom` provider — the only difference
is which set of store keys is read/written and which defaults are pre-filled
in the modal.

---

## Relationships

- `AIProviderConfig` (logical, in-memory) is built from:
  - `ai_provider` (settings store) → sets `provider` field;
  - `ai_model` (settings store) → sets `model` field;
  - `ai_api_key_ollama` (Stronghold + in-memory cache) → sets `api_key` field
    (or empty string if `no_auth`);
  - `ai_ollama_base_url`, `ai_ollama_no_auth` (settings store) → packed into
    `options`.

- `AIProviderFactory::create(&config)` receives the above and returns a
  `Box<dyn AIProvider>`. For `provider = "ollama"`, it constructs an
  `OpenAIProvider` with the `options` containing the Ollama base URL and
  `no_auth = true`.

- `enhance_transcription` (Tauri command) is the only caller that builds an
  `AIProviderConfig` from store values. It already handles `openai` and
  `custom`; we add a sibling `ollama` arm with mirrored logic.

No new relationships, no new entities, no schema migration.
