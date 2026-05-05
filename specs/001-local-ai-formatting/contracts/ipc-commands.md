# Phase 1 — IPC Command Contracts

VoiceTypr's "external interface" is the set of Tauri commands the React
frontend calls via `invoke()`. **This feature adds no new commands.** It
extends two existing commands' permitted `provider` values and adds support
for one new settings key in two more.

---

## Commands extended (no signature change)

### 1. `validate_provider_name` (internal helper, not a command — but it gates several commands)

**File**: `src-tauri/src/commands/ai.rs`

**Change**: Append `"ollama"` to `ALLOWED_PROVIDERS`:

```rust
const ALLOWED_PROVIDERS: &[&str] = &["gemini", "openai", "anthropic", "custom", "ollama"];
```

**Effect**: All commands that call `validate_provider_name` now accept
`"ollama"`. These are: `get_ai_settings_for_provider`, `cache_ai_api_key`,
`validate_and_cache_api_key`, `update_ai_settings`,
`clear_ai_api_key_cache`, `list_provider_models`.

### 2. `validate_and_cache_api_key`

**Existing signature** (no change):

```rust
#[tauri::command]
pub async fn validate_and_cache_api_key(
    app: tauri::AppHandle,
    args: ValidateAndCacheApiKeyArgs,   // { provider, api_key?, base_url?, model?, no_auth? }
) -> Result<(), String>;
```

**Change in behavior** for `provider == "ollama"`:

- Treated like `provider == "custom"`:
  - `inferred_no_auth = no_auth.unwrap_or(false) || api_key.is_empty()` — defaults to `true`
    when key is empty, which is the common Ollama case.
  - Persists `ai_ollama_base_url` (new key) instead of `ai_custom_base_url`.
  - Persists `ai_ollama_no_auth` (new key).
  - Calls `run_openai_probe_request` with `allow_chat_probe_fallback = true`
    against the resolved base URL (defaults to `http://localhost:11434/v1`).
- Caches API key under `ai_api_key_ollama` only when `inferred_no_auth = false`
  (the rare proxied-Ollama case).

**Frontend invocation example** (called from `EnhancementsSection` modal-submit):

```typescript
await invoke('validate_and_cache_api_key', {
  args: {
    provider: 'ollama',
    apiKey: '',                                      // empty → no_auth inferred
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2:3b',
  }
});
```

### 3. `update_ai_settings`

**Existing signature** (no change):

```rust
#[tauri::command]
pub async fn update_ai_settings(
    enabled: bool,
    provider: String,
    model: String,
    app: tauri::AppHandle,
) -> Result<(), String>;
```

**Change in behavior** for `provider == "ollama"`:

- The "must have an API key" gate is satisfied by either a cached
  `ai_api_key_ollama` **or** a configured `ai_ollama_base_url`. Mirrors the
  existing `custom` branch.

### 4. `enhance_transcription`

**Existing signature** (no change):

```rust
#[tauri::command]
pub async fn enhance_transcription(
    text: String,
    app: tauri::AppHandle,
) -> Result<String, String>;
```

**Change in behavior** for stored `ai_provider == "ollama"`:

- New arm in the provider-resolution `if/else` chain (sibling to the
  existing `custom` arm):

```rust
} else if provider == "ollama" {
    let base_url = store
        .get(OLLAMA_BASE_URL_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| DEFAULT_OLLAMA_BASE_URL.to_string());

    let no_auth = store
        .get(OLLAMA_NO_AUTH_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let cache = API_KEY_CACHE.lock().map_err(/* ... */)?;
    let cached = cache.get("ai_api_key_ollama").cloned();
    drop(cache);

    let mut opts = HashMap::new();
    opts.insert("base_url".into(), serde_json::Value::String(base_url));
    opts.insert("no_auth".into(), serde_json::Value::Bool(no_auth || cached.is_none()));

    ("ollama".to_string(), cached.unwrap_or_default(), opts)
}
```

- Returns the formatted text (success) or an `AIError`-wrapped message
  (failure). On failure the caller pipeline inserts the raw transcription
  per FR-007.

### 5. `list_provider_models`

**Existing signature** (no change):

```rust
#[tauri::command]
pub async fn list_provider_models(
    provider: String,
    _app: tauri::AppHandle,
) -> Result<Vec<ProviderModel>, String>;
```

**Change in behavior** for `provider == "ollama"`:

- Returns `Err(...)` because no curated models exist for Ollama (mirrors
  current `"custom"` behavior — the user types the model name in the
  modal). The frontend `useProviderModels` hook already short-circuits for
  `isCustom: true` providers, so this command is not invoked for Ollama in
  the normal UI path. The error is the safety net.

### 6. `test_openai_endpoint`

**No code change.** The existing command takes the URL/model/API key from
the modal directly, so it works for Ollama without any backend
modification. The frontend modal that opens for the Ollama card is the
same `OpenAICompatConfigModal` already used by Custom — it already calls
this command.

---

## Commands added

**None.** Per AR-001 / AR-002 / AR-004, this feature MUST NOT introduce new
trait methods, new request/response shapes, or parallel codepaths.

---

## Internal Rust constants added

```rust
// src-tauri/src/commands/ai.rs
const DEFAULT_OLLAMA_BASE_URL: &str = "http://localhost:11434/v1";
const OLLAMA_BASE_URL_KEY: &str = "ai_ollama_base_url";
const OLLAMA_NO_AUTH_KEY: &str = "ai_ollama_no_auth";

// Extended:
const AI_PROVIDER_KEYS: &[&str] = &[
    "ai_api_key_gemini",
    "ai_api_key_openai",
    "ai_api_key_anthropic",
    "ai_api_key_custom",
    "ai_api_key_ollama",                               // ⬅️ NEW
];
```

---

## Test contracts

### Backend (`cargo test`)

- **`src-tauri/src/ai/tests.rs`** — extend with:
  - `test_factory_dispatches_ollama_to_openai_provider` — assert
    `AIProviderFactory::create(&{provider:"ollama", ...})` returns a
    `Box<dyn AIProvider>` whose `name()` is `"ollama"` (or `"openai"`
    if we keep the existing `OpenAIProvider::name()` — see **Open
    decision** below) and which uses the Ollama base URL when supplied.
  - `test_factory_ollama_default_base_url` — assert the arm fills in
    `http://localhost:11434/v1` when `options.base_url` is absent.
  - `test_factory_ollama_default_no_auth` — assert `no_auth = true` is
    the default when not specified.

- **`src-tauri/src/commands/ai.rs::tests`** — extend with:
  - `test_validate_provider_name_accepts_ollama`.
  - `test_curated_models_returns_empty_for_ollama` (mirrors the existing
    `custom` assertion).

### Frontend (`pnpm test`)

- **`src/components/OpenAICompatConfigModal.test.tsx`** — already covers
  the modal mechanics; add one test that the modal renders with
  `defaultBaseUrl="http://localhost:11434/v1"` when invoked from the
  Ollama card.
- **`src/components/sections/__tests__/EnhancementsSection.test.tsx`** —
  extend with: clicking the Ollama card opens the modal with Ollama
  defaults; submitting saves under `provider: "ollama"`; the card shows
  Active when `ai_provider = "ollama"` and `ai_enabled = true`.

### Open decision: `OpenAIProvider::name()` for ollama dispatch

`OpenAIProvider::name()` returns `"openai"` today. When dispatched from the
ollama arm, the response's `provider` field will read `"openai"` even
though the user picked Ollama. Two options:

1. **Leave as-is** (return `"openai"` even for Ollama dispatch). Pros:
   zero change to upstream `OpenAIProvider`. Cons: confusing in logs.
2. **Pass a `name_override` through `options`** and have `name()` read
   from it when present. Pros: accurate logs. Cons: 5 LOC of upstream
   change.

**Recommendation for `/speckit-tasks` phase**: Option 2 — accurate
logging is small, useful, and the change is additive (if `name_override`
is absent, behavior is exactly today's). Final call deferred to the task
breakdown / implementation review.
