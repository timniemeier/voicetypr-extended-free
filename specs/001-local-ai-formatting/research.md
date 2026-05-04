# Phase 0 — Research: Local LLM Text Formatting (Ollama)

**Status**: Complete. No `NEEDS CLARIFICATION` markers remain in Technical Context.

The spec (AR-001..AR-005) is unusually prescriptive — it specifies the exact
implementation pattern (reuse `OpenAIProvider` with Ollama defaults). So research
focuses on the small set of Ollama-specific facts the implementation depends on,
not on architectural choices.

---

## R-1. Ollama's OpenAI-compatible API surface

**Question**: Can `OpenAIProvider` (which already accepts `base_url` and `no_auth`)
talk to Ollama unmodified?

**Decision**: Yes. Ollama exposes an OpenAI-compatible API at
`http://localhost:11434/v1` with these endpoints used by VoiceTypr:

| Endpoint | Used by VoiceTypr | Ollama support |
|----------|-------------------|----------------|
| `POST /v1/chat/completions` | `OpenAIProvider::enhance_text` | Supported, returns `choices[0].message.content` |
| `GET /v1/models` | `run_openai_probe_request` (test connection + model existence check) | Supported, returns `{"data": [{"id": "<model>"}, ...]}` |

The wire format Ollama serves is byte-compatible with `OpenAIRequest` /
`OpenAIResponse` in `src-tauri/src/ai/openai.rs`. No request/response struct
changes needed.

**Rationale**: The whole reason AR-001 exists — we already proved this works
for the `Custom (OpenAI-compatible)` card pointed at Ollama; this feature
just removes the manual URL-typing step.

**Alternatives considered**:

- *Native Ollama API* (`/api/generate`, `/api/chat`): rejected. Different
  request shape, different streaming protocol. Would force a parallel HTTP
  client, retry path, and response-extraction path — exactly what AR-001
  forbids.
- *llama.cpp-server / LM Studio direct*: rejected for this card. Already
  supported via the existing `Custom (OpenAI-compatible)` card; adding a
  separate card would be the same anti-pattern.

---

## R-2. Authentication: how Ollama handles `Authorization`

**Question**: Does Ollama require an API key? Does it reject requests that
include an unsolicited `Authorization: Bearer …` header?

**Decision**: Ollama, by default, requires **no auth**. It accepts requests
without an `Authorization` header. It also tolerates an `Authorization` header
when one is sent (it ignores it). So:

- Default: `no_auth = true`, no `Authorization` header sent.
- Override (rare; for proxied / hosted Ollama behind a reverse proxy that
  enforces auth): user can set `no_auth = false` and supply a bearer token.
  `OpenAIProvider::make_single_request` already implements this conditional.

**Rationale**: Matches the existing `Custom` card's `no_auth` flag. AR-003
covers persistence.

**Alternatives considered**: none — the spec FR-002 directly mandates
`no_auth = true` as the default.

---

## R-3. Probe / "Test connection" semantics for Ollama

**Question**: Does `run_openai_probe_request` in `src-tauri/src/commands/ai.rs`
work correctly against Ollama (model existence check + no-auth + chat-probe
fallback)?

**Decision**: Yes, with one caveat. The probe path already does the right
thing in three steps:

1. `GET /v1/models` → on `200`, parse `data[]` and check the chosen model
   exists. ✅ Ollama returns this for installed models only — exactly the
   behavior we want for FR-009 ("model not found" detection).
2. On `404`/`405` from `/v1/models`, fall back to a minimal
   `POST /v1/chat/completions` with `max_tokens: 10`. ✅ Ollama serves
   `/v1/models`, so this fallback is unused for it.
3. The `allow_chat_probe_fallback` flag is already gated to `provider ==
   "custom"`. **We must extend that gate** to include `"ollama"` so the
   fallback also works for hypothetical Ollama deployments where `/v1/models`
   is hidden.

**Caveat**: Ollama's `/v1/chat/completions` ignores `max_tokens` for some
models and may stream a long response. The existing 10-token probe is fine
because Ollama still responds with a valid envelope; the existing
`is_probe_output_limit_error` retry covers the rare case the response is
truncated by an upstream proxy.

**Rationale**: FR-009 (5 s, three error categories: server unreachable,
model not found, auth failed) is satisfied by the existing probe. We add no
new code path — only one boolean to the existing gate.

**Alternatives considered**:

- *Ollama's `/api/tags` for model list*: rejected. Native API, breaks AR-001.
- *Skip the probe entirely*: rejected. Removes the FR-009 user benefit.

---

## R-4. Streaming and timeouts

**Question**: Ollama responses can be slow on small machines (first-token
latency 1-30 s). Does the existing 30-second `DEFAULT_TIMEOUT_SECS` hold?

**Decision**: Yes for MVP, with a note for future. `OpenAIProvider`'s reqwest
client uses `DEFAULT_TIMEOUT_SECS` (30 s) and disables streaming.
Ollama supports non-streaming responses on `/v1/chat/completions` and returns
the entire response when generation finishes. For first-time use of a freshly-
loaded model on cold-start, the 30 s window is sometimes tight.

**Mitigation in scope**:

- Acceptance is governed by the spec's Edge Case ("user MUST have a way to
  cancel without losing the raw transcription"). Whatever cancellation
  pattern already exists for cloud requests applies — Ollama does not
  introduce a new one.
- On timeout, FR-007 (a) the user sees an actionable error mentioning the
  configured URL, (b) the raw transcription is inserted as fallback,
  (c) no cloud request is made. Existing dispatch already does (b) and (c)
  by virtue of `enhance_transcription` returning `Err` (caller uses raw).
- We surface `AIError::NetworkError` with a useful message for timeout —
  reqwest distinguishes timeout from connection refused; the existing
  `e.to_string()` formatting includes "operation timed out" / "connection
  refused" which the UI can show.

**Out of scope for MVP**: lifting `DEFAULT_TIMEOUT_SECS` or adding
streaming. Deferred until users actually report it.

**Rationale**: Constitution III ("don't add abstractions before the third
caller exists"). Streaming would add complexity that isn't yet justified.

---

## R-5. Cancellation

**Question**: How does the user cancel a slow Ollama request without losing
their raw transcription?

**Decision**: Use the existing dictation-flow cancellation. The
`enhance_transcription` Tauri command runs as a Tauri async command from the
audio pipeline; today, if the user starts a new recording or uses the
existing cancel UI, the previous formatting future is dropped on the
frontend side. Ollama is no different from OpenAI here — same
`provider.enhance_text(request).await` call, same drop semantics.

**Rationale**: AR-002 ("no new patterns"); spec Edge Cases ("Ollama does not
introduce a new pattern").

**Alternatives considered**: explicit cancellation token plumbed through
`AIProvider`: rejected. Constitution III — premature abstraction; would
require modifying upstream `OpenAIProvider`, breaking Constitution I.

---

## R-6. Edge cases the spec calls out — confirmed handled

| Edge case | Where it's handled |
|-----------|--------------------|
| Empty Ollama response → insert raw | `OpenAIProvider::enhance_text` already returns `AIError::InvalidResponse("Empty response from API")` when `enhanced_text.is_empty()`. `enhance_transcription` in `commands/ai.rs` propagates `Err`; calling code falls back to raw text. ✅ |
| Model wraps response in extra prose | Same response-extraction as OpenAI/Anthropic/Gemini (no provider-specific extraction). No code needed beyond what already exists. ✅ |
| Mid-recording provider switch | Unchanged: the `provider` read from store at request time is what the formatter uses. ✅ |
| Existing Custom config pointed at Ollama keeps working | We do not touch `CUSTOM_BASE_URL_KEY` or `LEGACY_OPENAI_BASE_URL_KEY`. ✅ |
| Non-loopback host (LAN GPU box) | Allowed (FR-002 says URL is overridable). UI copy must not claim loopback-grade privacy when the user picks a non-loopback host. Implementation: clarify the modal subtitle for the Ollama variant. |

---

## R-7. Things we deliberately do **not** add

These appeared as plausible work items but are forbidden or out-of-scope:

- ❌ A new `OllamaProvider` struct → AR-001 forbids it.
- ❌ A new `AI_PROVIDER_KEYS` style for ollama-with-no-key-but-with-base-url —
  the existing `check_has_api_key` for `custom` already does the
  "has-base-url-counts-as-configured" check. We replicate that one boolean
  check for `"ollama"`.
- ❌ Bundling Ollama or downloading models → FR-011 explicitly forbids it.
- ❌ A separate "Ollama" preset list distinct from the four existing
  presets → FR-005 forbids it.
- ❌ A streaming response path → R-4 defers.
- ❌ A health-check daemon polling Ollama in the background → out of scope;
  the user runs the test-connection action.

---

## Summary of decisions

1. **Reuse `OpenAIProvider` with Ollama defaults** (`base_url =
   http://localhost:11434/v1`, `no_auth = true`). No new struct.
2. **Add `"ollama"` to `is_valid_provider`, `ALLOWED_PROVIDERS`, factory
   `create`, `enhance_transcription`, `AI_PROVIDER_KEYS`, and probe-fallback
   gate.** All single-line additions in existing files.
3. **Reuse `OpenAICompatConfigModal`** with `defaultBaseUrl =
   "http://localhost:11434/v1"`. No new modal.
4. **Treat Ollama like Custom in the UI** (`isCustom: true`) — user types
   the model name; no curated model list.
5. **Persist `ai_ollama_base_url` separately** from `CUSTOM_BASE_URL_KEY`
   so existing Custom configurations keep working unchanged (Edge Case).
6. **Honor existing 30 s timeout and existing cancellation** — no new
   patterns. Streaming and longer timeouts deferred until needed.

All NEEDS CLARIFICATION resolved. Ready for Phase 1.
