# Feature Specification: Local LLM Text Formatting

**Feature Branch**: `001-local-ai-formatting`
**Created**: 2026-05-04
**Status**: Draft
**Input**: User description: "I want the text fixes, that currently run on an external model, to be run on local as well."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Format transcriptions with a local LLM (Priority: P1)

A user who has a local LLM server running on their machine (e.g., Ollama,
LM Studio, llama.cpp-server, MLX-LM) wants their transcribed text to be
cleaned up and formatted by that local model — using the same four
formatting presets they already know (base prompt, prompts, email,
commits) — instead of by Groq or Gemini in the cloud. After a one-time
setup of the local provider, formatting works exactly like the cloud
version: transcription completes, text gets cleaned up, the polished
result is inserted at the cursor — but no audio, no transcription, and
no formatted output ever leaves the device.

**Why this priority**: This is the entire feature. Without it, users who
care about privacy or who work offline either skip AI formatting
altogether or are forced to send sensitive transcriptions to cloud
providers. Delivering this single story is a complete, shippable MVP.

**Independent Test**: With Ollama (or any other local OpenAI-compatible
LLM server) running locally, a user can configure VoiceTypr to point at
that server, select "local" as their formatting provider, dictate a
sentence, and see it cleaned up by the local model — confirmed by
checking that no outbound network request is made to any cloud provider
during the whole flow.

**Acceptance Scenarios**:

1. **Given** the user has a local LLM server reachable at a known URL
   and has not yet configured it in VoiceTypr,
   **When** they open Settings → Formatting and enter the endpoint URL
   and a model name,
   **Then** they can save the configuration and see the local provider
   listed alongside any existing cloud providers.

2. **Given** the user has saved a working local provider configuration,
   **When** they select "local" as the active formatting provider and
   dictate a sentence,
   **Then** the transcription is sent to the local endpoint, the local
   model's response replaces the raw transcription, and the cleaned-up
   text is inserted at the cursor — with no calls to Groq, Gemini, or
   any other third-party host.

3. **Given** the user has both a cloud provider and a local provider
   configured,
   **When** they switch the active provider from cloud to local,
   **Then** their previously-edited custom prompt templates remain
   intact and apply to the local provider with no further setup.

---

### User Story 2 - Recover gracefully when the local server is unreachable (Priority: P2)

A user has previously configured a local provider, but on a given day
the local server is not running (forgot to start it, machine just
rebooted, model not loaded). They press the dictation hotkey expecting
formatted output. Rather than seeing a generic failure or having their
text silently sent to a cloud provider, they get a clear, specific
message that explains the local server is unreachable and how to fix
it, and the raw (unformatted) transcription is still inserted so their
work is not lost.

**Why this priority**: Without this, a single misconfiguration produces
an opaque failure that wastes the user's time and undermines trust in
the privacy guarantee (because they can't tell whether their text was
sent somewhere unexpected). Important but not part of the core MVP loop.

**Independent Test**: Configure a local provider pointing at a port
where nothing is listening, then trigger formatting. Verify the user
sees an actionable error referencing the configured URL, the raw
transcription is still inserted at the cursor, and no cloud requests
are made.

**Acceptance Scenarios**:

1. **Given** the local provider is configured but the server at the
   configured URL is not running,
   **When** the user triggers a formatting request,
   **Then** the user sees an error message naming the configured URL
   and indicating the server is unreachable, the raw transcription is
   inserted at the cursor as a fallback, and no request is made to any
   cloud provider.

2. **Given** the local provider is configured but the chosen model is
   not loaded on the local server,
   **When** the user triggers a formatting request,
   **Then** the user sees an error message that distinguishes "model
   not found" from "server unreachable," and the raw transcription is
   inserted at the cursor.

---

### User Story 3 - Validate the local provider before saving (Priority: P3)

When the user configures a local provider for the first time, they want
to confirm the URL, key, and model name are correct without having to
trigger a real dictation. A "Test connection" action sends a small
probe request to the configured endpoint and reports back whether the
endpoint responded, whether the chosen model is available, and the
round-trip latency.

**Why this priority**: Quality-of-life. Reduces setup friction and the
class of "I configured something wrong" support questions. Not blocking
for the core feature.

**Independent Test**: With the Settings → Formatting screen open and a
local provider partly configured, click "Test connection." Verify the
result reflects reality: success when the server is reachable and the
model exists, a specific error otherwise.

**Acceptance Scenarios**:

1. **Given** the user has entered a URL and model name,
   **When** they click "Test connection,"
   **Then** within 5 seconds they see either a success indicator with
   measured latency, or a specific failure (server unreachable / model
   not found / authentication failed).

---

### Edge Cases

- The user enters an HTTPS URL pointing to a non-loopback host (e.g., a
  LAN machine or remote server). The system MUST allow this but MUST
  NOT silently treat it as "local for privacy purposes" — privacy
  guarantees only hold when the user controls the destination.
- The local model returns an empty string. The system MUST treat this
  as a failed format and insert the raw transcription rather than an
  empty result.
- The local model returns a response wrapped in extra prose ("Sure,
  here is the cleaned text: ..."). The system MUST extract the intended
  formatted text using the same extraction logic already applied to
  cloud responses, or document a known limitation.
- The local model is slow (> 30 s). The system MUST surface a
  cancellable progress indicator and let the user abort without losing
  the raw transcription.
- The user has no formatting provider configured at all (neither cloud
  nor local). The dictation flow MUST continue to work and insert raw
  transcriptions, exactly as it does today.
- The user switches the active provider mid-recording. The setting in
  effect at the time the formatting request is sent applies; switching
  during a recording does not reroute an in-flight request.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Formatting settings screen MUST allow the user to
  configure a local LLM provider with: an endpoint URL, an optional
  authentication token, and a model identifier.
- **FR-002**: When the active formatting provider is set to "local,"
  the system MUST send formatting requests only to the configured local
  endpoint and MUST NOT make any request to Groq, Gemini, or any other
  third-party host as part of that formatting flow.
- **FR-003**: The local provider MUST work with all four existing
  formatting presets (base prompt, prompts, email, commits) and with
  any user edits the fork already supports for those presets.
- **FR-004**: The system MUST persist the local provider configuration
  (URL, optional token, model name) across app restarts, using the same
  secure storage already used for cloud API keys.
- **FR-005**: When a local formatting request fails (network error,
  server error, empty response, or timeout), the system MUST: (a)
  display a clear, actionable error message that names the configured
  URL and distinguishes between "server unreachable," "model not
  found," and "authentication failed" where the underlying error
  permits, (b) insert the raw (unformatted) transcription at the cursor
  as a fallback, and (c) NOT silently fall back to a cloud provider.
- **FR-006**: The user MUST be able to switch the active formatting
  provider between cloud and local at any time without losing custom
  prompt template edits and without restarting the app.
- **FR-007**: The Formatting settings screen MUST provide a "Test
  connection" action that sends a probe request to the configured local
  endpoint and reports the result (success with latency, or a specific
  error category) within 5 seconds.
- **FR-008**: When the local provider is the active formatting
  provider, the system MUST NOT transmit the audio recording, the raw
  transcription, or the formatted result to any host other than the
  one the user explicitly configured.
- **FR-009**: When the configured local endpoint exposes a list of
  available models, the user MUST be able to pick the model name from
  that list; when no such list is exposed, the user MUST be able to
  enter the model name as free text.
- **FR-010**: The cloud-provider experience (Groq, Gemini) MUST remain
  functionally unchanged for users who do not configure or activate a
  local provider.
- **FR-011**: VoiceTypr MUST NOT bundle, install, download, or manage
  local LLM model files or runtimes. The user is responsible for
  running and operating a separate local LLM server. Ollama is the
  primary supported target; any other OpenAI-compatible local endpoint
  (LM Studio, llama.cpp-server, MLX-LM, vLLM, etc.) is acceptable
  because all of them expose the same `/v1/chat/completions` contract.
- **FR-012**: The Formatting settings screen SHOULD pre-fill the local
  endpoint URL field with Ollama's default OpenAI-compatible URL
  (`http://localhost:11434/v1`) when no value is configured yet, so
  the most common setup is one click rather than copy-paste. The user
  remains free to change it.

### Key Entities

- **Formatting Provider**: A configurable destination for text
  formatting. Has a kind (cloud or local), a display name, and the
  parameters needed to address it (for cloud: API key; for local:
  endpoint URL, optional token, model identifier).
- **Active Provider Selection**: The single user choice of which
  configured Formatting Provider is currently in use; switching this
  is a non-destructive operation that preserves all configured
  providers and the user's custom prompts.
- **Local Provider Configuration**: A specific kind of Formatting
  Provider that points at a user-controlled HTTP endpoint exposing an
  OpenAI-compatible chat-completions API. Includes endpoint URL,
  optional token, model identifier, and a "last successful probe"
  timestamp used for diagnostics.
- **Formatting Preset**: One of the four existing prompt templates
  (base, prompts, email, commits). Already editable in this fork; this
  feature does not change the preset model — it only changes which
  provider executes the preset.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with a working local LLM server can complete the
  full set-up — endpoint URL, model selection, save, switch active
  provider, dictate a test sentence, see formatted output — in under
  3 minutes.
- **SC-002**: When a user activates the local provider, 100 % of
  formatting requests for the supported four presets complete the
  end-to-end flow without any outbound request leaving the user's
  device or LAN, as observable from the OS-level network monitor.
- **SC-003**: When a local request fails for any of the documented
  failure categories (server unreachable, model not found,
  authentication failed, empty response, timeout), the user sees an
  actionable error within 5 seconds of triggering the request, and the
  raw transcription is preserved at the cursor.
- **SC-004**: A user who already has a cloud provider configured and
  working sees zero behavior change when they have not configured or
  activated a local provider.
- **SC-005**: Switching active provider between cloud and local takes
  no more than 3 user interactions (e.g., open settings → click
  provider → confirm) and requires no app restart.
- **SC-006**: All four formatting presets (base, prompts, email,
  commits) produce non-empty, semantically-meaningful output on the
  local provider when paired with a user-supplied general-purpose
  instruction-tuned model of at least 7 B parameters; specific output
  quality is the user's responsibility based on the model they choose.

## Assumptions

- The user runs and manages their own local LLM server outside of
  VoiceTypr. **Ollama is the primary supported target** because it is
  the most common, easiest-to-install local LLM runtime on macOS. Any
  other server that exposes an OpenAI-compatible chat-completions
  endpoint (LM Studio, llama.cpp-server, MLX-LM, vLLM) is also
  acceptable and expected to work without code changes. VoiceTypr
  itself does not start, stop, install, update, or supervise these
  servers.
- Local LLM servers expose an OpenAI-compatible
  `/v1/chat/completions` endpoint. Ollama, LM Studio,
  llama.cpp-server, MLX-LM, and vLLM all do, and this is the de-facto
  standard for local LLM tooling.
- The optional authentication token is left empty by most users; it
  exists for setups where the local server is fronted by a reverse
  proxy that requires a bearer token.
- "Local" in this spec means "user-controlled host." If the user
  points the configuration at a remote server they control (e.g., a
  home-LAN GPU box), the privacy guarantee still holds because the
  user owns the destination — but VoiceTypr does not validate this
  and the privacy disclosure in the UI MUST be honest about what
  "local" means.
- When local formatting fails, falling back to cloud silently is
  forbidden (per Constitution II). Falling back to inserting the raw
  transcription is the correct behavior because it preserves the
  user's words and matches what happens today when no formatting
  provider is configured.
- Existing editable prompt templates from this fork apply identically
  to the local provider — the prompt-editing UX does not need
  duplication or per-provider variants.
- Audio capture, transcription (Whisper / Parakeet), and text
  insertion remain entirely unchanged; this feature only adds an
  alternative destination for the post-transcription formatting step.
