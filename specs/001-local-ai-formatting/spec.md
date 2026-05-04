# Feature Specification: Local LLM Text Formatting (Ollama)

**Feature Branch**: `001-local-ai-formatting`
**Created**: 2026-05-04
**Status**: Draft
**Input**: User description: "I want the text fixes, that currently run on an external model, to be run on local as well." Follow-ups: BYO local server (Option A); primary target is Ollama; **the new provider MUST fit into the existing AI-provider API rather than introduce a parallel codepath**.

## Context: the existing API surface

VoiceTypr already exposes a four-card AI Providers list at Settings →
Formatting:

1. **OpenAI** — adds via API key
2. **Anthropic** — adds via API key
3. **Google Gemini** — adds via API key
4. **Custom (OpenAI-compatible)** — adds via "Configure" (URL +
   optional key + model)

Behind those cards lives a single Rust trait (`AIProvider`), a single
factory (`AIProviderFactory`), and a single request/response shape
(`AIEnhancementRequest` / `AIEnhancementResponse`). The OpenAI
provider implementation already accepts `base_url` and `no_auth`
options, which is what the Custom card uses. The frontend has
`AI_PROVIDERS` in `src/types/providers.ts`, a `ProviderCard`
component, and an `OpenAICompatConfigModal` for the Custom case.

This feature **adds Ollama as a fifth peer in that list**, reusing
all the abstractions above. It does NOT introduce a parallel codepath.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Format transcriptions with a local Ollama server (Priority: P1)

A user has Ollama running on their Mac (the most common local-LLM
setup on macOS). They want their transcribed text to be cleaned up
and formatted by an Ollama-served model — using the same four
formatting presets they already know (base prompt, prompts, email,
commits) — instead of by OpenAI / Anthropic / Gemini in the cloud.
They expect Ollama to appear as one more card in the AI Providers
list, configured with one or two clicks (URL is pre-filled, just
pick a model), and to behave identically to the cloud providers
once active: dictate → text gets cleaned up → polished result
inserted at the cursor — except no audio, no transcription, and
no formatted output ever leaves the device.

**Why this priority**: This is the entire feature. Without it, users
who care about privacy or who work offline either skip AI formatting
altogether or are forced to send sensitive transcriptions to cloud
providers. Delivering this single story is a complete, shippable MVP.

**Independent Test**: With Ollama running on `localhost:11434`, the
user opens Settings → Formatting, clicks the new Ollama card, picks
a pulled model from the dropdown, sets it active, dictates a
sentence, and sees it cleaned up by Ollama — confirmed by checking
the OS network monitor: no outbound connection leaves loopback.

**Acceptance Scenarios**:

1. **Given** Ollama is running locally and the user has not yet
   configured it in VoiceTypr,
   **When** they open Settings → Formatting,
   **Then** they see an **Ollama** card listed alongside OpenAI,
   Anthropic, Google Gemini, and Custom (OpenAI-compatible).

2. **Given** the user clicks the Ollama card,
   **When** the configuration sheet opens,
   **Then** the endpoint URL is pre-filled with
   `http://localhost:11434/v1`, no API key is required, and the
   model dropdown is populated from the Ollama server's installed
   models (or shows a clear message if the server is unreachable).

3. **Given** the user has selected a model and saved,
   **When** they make Ollama the active provider and dictate a
   sentence,
   **Then** the transcription is sent only to the configured Ollama
   endpoint, the model's response replaces the raw transcription,
   and the cleaned-up text is inserted at the cursor — with zero
   calls to OpenAI, Anthropic, Google Gemini, or any other
   third-party host.

4. **Given** the user has both OpenAI (or any cloud provider) and
   Ollama configured,
   **When** they switch the active provider from cloud to Ollama,
   **Then** their previously-edited custom prompt templates remain
   intact and apply to Ollama with no further setup, and the active
   marker in the AI Providers header updates to reflect the new
   selection.

5. **Given** Ollama is the active provider,
   **When** any of the four formatting presets (base, prompts,
   email, commits) is invoked,
   **Then** the same `AIEnhancementRequest` / `AIEnhancementResponse`
   contract used by the cloud providers is honored, and the rest of
   the dictation pipeline (audio capture, transcription, text
   insertion) is unaware that the provider is local — verifiable
   from existing integration tests passing unchanged for the
   provider-agnostic layers.

---

### User Story 2 - Recover gracefully when Ollama is not reachable (Priority: P2)

A user has previously configured Ollama, but on a given day the
Ollama daemon is not running (forgot to start it, machine just
rebooted, requested model not pulled). They press the dictation
hotkey expecting formatted output. Rather than seeing a generic
failure or having their text silently sent to a cloud provider,
they get a clear, specific message that explains the local server
is unreachable and how to fix it, and the raw (unformatted)
transcription is still inserted so their work is not lost.

**Why this priority**: Without this, a single misconfiguration
produces an opaque failure that wastes the user's time and
undermines trust in the privacy guarantee (because they can't tell
whether their text was sent somewhere unexpected). Important but
not part of the core MVP loop.

**Independent Test**: Stop Ollama, then trigger formatting. Verify
the user sees an actionable error referencing
`http://localhost:11434/v1`, the raw transcription is still
inserted at the cursor, and no cloud requests are made.

**Acceptance Scenarios**:

1. **Given** Ollama is configured and active but the daemon is not
   running,
   **When** the user triggers a formatting request,
   **Then** the user sees an error message that names the
   configured URL and indicates the server is unreachable, the raw
   transcription is inserted at the cursor as a fallback, and no
   request is made to any cloud provider.

2. **Given** Ollama is configured and active but the chosen model
   is not pulled / loaded,
   **When** the user triggers a formatting request,
   **Then** the user sees an error message that distinguishes
   "model not found" from "server unreachable," and the raw
   transcription is inserted at the cursor.

---

### User Story 3 - Validate the Ollama configuration before saving (Priority: P3)

When the user configures Ollama for the first time, they want to
confirm the URL and chosen model work without having to trigger a
real dictation. A "Test connection" action sends a small probe
request to the configured endpoint and reports back whether the
endpoint responded, whether the chosen model is available, and the
round-trip latency.

**Why this priority**: Quality-of-life. Reduces setup friction and
the class of "I configured something wrong" support questions.
Not blocking for the core feature; if the existing Custom
(OpenAI-compatible) modal already has a test action, the Ollama
card MUST reuse it.

**Independent Test**: With the Ollama configuration sheet open and
a URL + model entered, click "Test connection." Verify the result
reflects reality: success when the daemon is reachable and the
model is available, a specific error otherwise.

**Acceptance Scenarios**:

1. **Given** the user has entered a URL and chosen a model,
   **When** they click "Test connection,"
   **Then** within 5 seconds they see either a success indicator
   with measured latency, or a specific failure (server unreachable
   / model not found / authentication failed).

---

### Edge Cases

- The user points the Ollama card at a non-loopback host (e.g., a
  LAN GPU box at `http://gpu-server:11434/v1`). The system MUST
  allow this but MUST NOT silently treat it as "local for privacy
  purposes" — privacy guarantees only hold when the user controls
  the destination.
- The Ollama model returns an empty string. The system MUST treat
  this as a failed format and insert the raw transcription rather
  than an empty result. (Same behavior the existing OpenAI provider
  already enforces at `openai.rs` for empty `enhanced_text`.)
- The Ollama model wraps its response in extra prose ("Sure, here
  is the cleaned text: ..."). The same response-extraction logic
  applied to OpenAI / Anthropic / Gemini MUST apply to Ollama —
  no Ollama-specific extraction path.
- The Ollama model is slow (> 30 s on a small machine). The user
  MUST have a way to cancel without losing the raw transcription.
  Whatever cancellation pattern already exists for cloud requests
  applies; Ollama does not introduce a new pattern.
- The user has no formatting provider active at all. The dictation
  flow MUST continue to work and insert raw transcriptions, exactly
  as it does today.
- The user switches the active provider mid-recording. The setting
  in effect at the time the formatting request is sent applies;
  switching during a recording does not reroute an in-flight
  request.
- The user already configured the existing **Custom
  (OpenAI-compatible)** card to point at Ollama. That continues to
  work unchanged. Adding the Ollama card MUST NOT break or
  invalidate any existing Custom configuration; the two coexist.

## Requirements *(mandatory)*

### Architectural Requirements (NON-NEGOTIABLE — "fits into existing API")

- **AR-001**: The Ollama provider MUST be implemented by adding a
  new dispatch arm to `AIProviderFactory::create` in
  `src-tauri/src/ai/mod.rs`. That arm MUST internally construct an
  `OpenAIProvider` with `base_url = "http://localhost:11434/v1"`
  and `no_auth = true` as defaults (overridable from the user's
  configuration). It MUST NOT introduce a new struct that
  duplicates HTTP, retry, prompt-building, or response-extraction
  logic.
- **AR-002**: The Ollama provider MUST honor the existing
  `AIProvider` trait (`enhance_text`, `name`) and the existing
  request/response types (`AIEnhancementRequest`,
  `AIEnhancementResponse`, `AIError`). No new traits, no new
  request/response shapes.
- **AR-003**: Ollama configuration MUST be persisted via the
  existing `AIProviderConfig` shape (`provider`, `model`, `api_key`,
  `enabled`, `options`). The `provider` field value is `"ollama"`;
  the optional bearer token (rare; for proxied setups) goes into
  `api_key`; URL override and `no_auth` flag go into `options`.
- **AR-004**: The Ollama card in the UI MUST reuse the existing
  `ProviderCard` component, the `useProviderModels` hook (or its
  pattern) for model discovery, and — where the configuration
  sheet's mechanics overlap with Custom — reuse the existing
  `OpenAICompatConfigModal` patterns rather than fork a new modal.
  A thin wrapper that sets Ollama-specific defaults is acceptable;
  a parallel modal duplicating its logic is not.
- **AR-005**: `AI_PROVIDERS` in `src/types/providers.ts` MUST be
  extended with one new entry for Ollama; no other entries change.

### Functional Requirements

- **FR-001**: The Settings → Formatting screen MUST list **Ollama**
  as a fifth provider card, alongside OpenAI, Anthropic, Google
  Gemini, and Custom (OpenAI-compatible). Selecting it opens a
  configuration sheet pre-filled with sensible Ollama defaults.
- **FR-002**: The Ollama configuration sheet MUST default the
  endpoint URL to `http://localhost:11434/v1` and the auth mode to
  "no auth," because Ollama by default exposes its OpenAI-compatible
  endpoint at that path with no API key. Both are user-overridable
  for advanced setups (LAN GPU box, reverse-proxied Ollama, etc.).
- **FR-003**: The Ollama configuration sheet MUST populate the
  model dropdown by querying the configured endpoint's
  `/v1/models` (which Ollama exposes as part of its
  OpenAI-compatible API). When the endpoint is unreachable, the
  dropdown MUST display a clear empty state and allow the user to
  enter a model name as free text.
- **FR-004**: When Ollama is the active formatting provider, the
  system MUST send formatting requests only to the configured
  Ollama endpoint and MUST NOT make any request to OpenAI,
  Anthropic, Google Gemini, or any other third-party host as part
  of that formatting flow.
- **FR-005**: Ollama MUST work with all four existing formatting
  presets (base prompt, prompts, email, commits) and with any
  user edits this fork already supports for those presets. This
  follows automatically from AR-001 and AR-002 — no preset-specific
  branching is permitted.
- **FR-006**: The Ollama configuration MUST persist across app
  restarts via the existing settings storage used by the other
  provider configs. The user's chosen Ollama model survives
  restarts.
- **FR-007**: When an Ollama formatting request fails (network
  error, server error, empty response, or timeout), the system
  MUST: (a) display a clear, actionable error message that names
  the configured URL and distinguishes between "server
  unreachable," "model not found," and "authentication failed"
  where the underlying error permits, (b) insert the raw
  (unformatted) transcription at the cursor as a fallback, and
  (c) NOT silently fall back to a cloud provider.
- **FR-008**: The user MUST be able to switch the active formatting
  provider between any cloud provider and Ollama at any time
  without losing custom prompt template edits and without
  restarting the app.
- **FR-009**: The Ollama configuration sheet MUST provide a "Test
  connection" action that sends a probe request to the configured
  endpoint and reports the result (success with latency, or a
  specific error category) within 5 seconds. If the existing Custom
  (OpenAI-compatible) modal already implements this, the Ollama
  sheet MUST reuse the same implementation.
- **FR-010**: When Ollama is the active formatting provider, the
  system MUST NOT transmit the audio recording, the raw
  transcription, or the formatted result to any host other than
  the one the user explicitly configured.
- **FR-011**: VoiceTypr MUST NOT bundle, install, download, or
  manage Ollama itself or any LLM model files. The user runs and
  operates Ollama (or any other OpenAI-compatible local server).
  This is the BYO-server scope decision (Option A from the
  clarification round).
- **FR-012**: The cloud-provider experience (OpenAI, Anthropic,
  Google Gemini) and the existing **Custom (OpenAI-compatible)**
  card MUST remain functionally unchanged for users who do not
  configure or activate Ollama. Existing Custom configurations that
  point at Ollama keep working without migration.

### Key Entities

- **Formatting Provider**: A configurable destination for text
  formatting, persisted as the existing `AIProviderConfig` shape.
  After this feature, the recognized `provider` field values are
  `openai`, `anthropic`, `gemini`, `custom`, and `ollama`. Ollama
  internally dispatches to the same `OpenAIProvider` HTTP client as
  Custom, with different defaults. There is no parallel "local
  provider configuration" entity.
- **Active Provider Selection**: The single user choice of which
  configured provider is currently in use; switching this is a
  non-destructive operation that preserves all configured providers
  and the user's custom prompts. (Unchanged from today.)
- **Formatting Preset**: One of the four existing prompt templates
  (base, prompts, email, commits). Already editable in this fork;
  this feature does not change the preset model — it only changes
  which provider executes the preset.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with Ollama already running locally can
  complete the full set-up — open Settings → Formatting, click the
  Ollama card, accept the default URL, pick a model from the
  dropdown, save, set active, dictate a test sentence, see
  formatted output — in under 2 minutes.
- **SC-002**: When Ollama is the active provider, 100 % of
  formatting requests for the supported four presets complete the
  end-to-end flow without any outbound request leaving the user's
  device or LAN, as observable from the OS-level network monitor.
- **SC-003**: When an Ollama request fails for any of the
  documented failure categories (server unreachable, model not
  found, authentication failed, empty response, timeout), the user
  sees an actionable error within 5 seconds of triggering the
  request, and the raw transcription is preserved at the cursor.
- **SC-004**: A user who already has a cloud provider configured
  and working sees zero behavior change when they have not
  configured or activated Ollama. Existing Custom
  (OpenAI-compatible) configurations also see zero behavior change.
- **SC-005**: Switching active provider between cloud and Ollama
  takes no more than 3 user interactions (e.g., open Formatting →
  click provider card → confirm) and requires no app restart.
- **SC-006**: The Ollama dispatch arm in `AIProviderFactory` adds
  no more than ~30 lines of Rust beyond a single `match` arm and a
  defaults helper. (This is a proxy metric for "fits into existing
  API" — measured in PR review.) No new HTTP client is added; no
  new prompt-building path; no new request/response struct.
- **SC-007**: All four formatting presets (base, prompts, email,
  commits) produce non-empty, semantically-meaningful output on
  Ollama when paired with a user-supplied general-purpose
  instruction-tuned model of at least 7 B parameters; specific
  output quality is the user's responsibility based on the model
  they choose.

## Assumptions

- The fork's existing AI-provider stack (Rust `AIProvider` trait
  with `OpenAIProvider` accepting `base_url` and `no_auth` options;
  TS `AI_PROVIDERS` list with a `Custom (OpenAI-compatible)` entry
  and an `OpenAICompatConfigModal`) is the foundation for Ollama
  support. Ollama does not justify breaking that abstraction.
- Ollama's OpenAI-compatible endpoint at
  `http://localhost:11434/v1` (chat completions plus `/v1/models`)
  is the canonical target. This is the documented Ollama API and
  has been stable since Ollama 0.1.x.
- Most users will run Ollama on their own Mac at the default port,
  with no auth header, with one or two pulled models. The defaults
  baked into the Ollama card MUST optimize for that case.
- "Local" in this spec means "user-controlled host." If the user
  points Ollama at a remote server they control (home-LAN GPU box,
  for example), the privacy guarantee still holds because the user
  owns the destination — but VoiceTypr does not validate this and
  the disclosure in the UI MUST be honest about what "local" means.
- When Ollama formatting fails, falling back to cloud silently is
  forbidden (per Constitution II, Privacy & Offline-First).
  Falling back to inserting the raw transcription is the correct
  behavior because it preserves the user's words and matches what
  happens today when no formatting provider is configured.
- Existing editable prompt templates from this fork apply
  identically to Ollama — the prompt-editing UX does not need
  duplication or per-provider variants.
- Audio capture, transcription (Whisper / Parakeet), and text
  insertion remain entirely unchanged; this feature only adds an
  alternative destination for the post-transcription formatting
  step, slotted into the existing provider abstraction.
- Other OpenAI-compatible local servers (LM Studio,
  llama.cpp-server, MLX-LM, vLLM) continue to be supported through
  the existing **Custom (OpenAI-compatible)** card; this spec does
  not duplicate that path. Users who want LM Studio etc. use the
  Custom card. Users who want Ollama specifically use the new
  Ollama card.
