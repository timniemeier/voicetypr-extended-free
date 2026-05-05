# Feature Specification: Settings Tab Restructure — Prompts as a First-Class Tab

**Feature Branch**: `003-settings-tab-restructure`
**Created**: 2026-05-04
**Status**: Draft
**Input**: User description: "I want to create a new tab 'Prompts' in the menu. It moves the prompt configuration from 'Formatting' into this new tab. The next tab will be 'LLM Models' with the current 'Prompt' content (excl. the prompt 'advanced'). The current 'Models' tab will be 'TTS Models'."

## Clarifications

### Session 2026-05-04

- Q: Tab label for the renamed Models tab — keep "TTS Models" verbatim, switch to STT Models, Transcription Models, or Speech-to-Text Models? → A: **STT Models**. The original "TTS Models" wording was a slip; the tab content is speech-to-text (Whisper, Parakeet) and the canonical label going forward is "STT Models".
- Q: In the Prompts tab, does clicking a row activate the prompt, or is selection-for-editing decoupled from setting-active? → A: **Decoupled**. Clicking a prompt row selects it for editing only; an explicit "Set as active" affordance in the editor pane (or an inline toggle on the row) is required to make it the active prompt. The orange-dot active indicator and the row's editing-focus state are independent.
- Q: How is an empty prompt text field handled — silent fallback, warn-but-allow, block save, or send empty? → A: **Block save while empty**. Inline validation prevents persisting an empty Prompt field on either built-in or custom prompts. Built-ins offer "Reset to default" as the recovery path; custom prompts must be created with non-empty text. The AI provider is never asked to run with an empty user prompt.
- Q: Reset-to-default scope on built-in prompts — per-field, per-prompt, or both? → A: **Per-prompt**. A single "Reset this prompt to default" action on the editor pane restores Name, Icon, and Prompt text together to their shipped defaults. There is no per-field reset; users intentionally resetting accept that all three fields revert.
- Q: What happens to today's "Formatting Options" (`EnhancementSettings` per-preset toggles) — keep on LLM Models, move to Prompts as per-prompt state, remove entirely, or move to Settings? → A: **Remove entirely**. The `EnhancementSettings` toggles are deleted. Any behavior users relied on must be expressed via the Prompt text itself (e.g., "be conservative with edits"). This is an explicit breaking change accepted as part of the simplification: prompts become the single source of formatting intent, with no separate runtime-behavior toggles.

## Context: the settings surfaces this feature touches

Today VoiceTypr's left-hand settings sidebar exposes (in order): Overview,
History, Upload, Settings, **Models**, **Formatting**, About — with
**Advanced** in the bottom group.

The two tabs being restructured are:

- **Models** — downloads and manages the on-device speech-to-text models
  (Whisper variants, Parakeet). Users choose which transcription engine
  is active here. Per Q1 in Clarifications above, this tab is renamed
  to **STT Models** (not "TTS Models" as the original input read).

- **Formatting** — today bundles three concerns into one screen:
    1. **AI Providers** — provider/model selection (OpenAI, Anthropic,
       Ollama, …), API key entry, and the active LLM picker.
    2. **Formatting Options** — per-preset toggles (`EnhancementSettings`)
       and the active-preset pill selector (Default / Prompts / Email /
       Commit).
    3. **Custom Prompts (Advanced)** — a collapsible panel that lets the
       user override the base post-processor prompt and each preset's
       transform prompt, with per-field reset.

After this feature, prompt configuration becomes a first-class destination
("Prompts") rather than a buried "Advanced" panel. Provider/model selection
gets its own clearer label ("LLM Models"). Speech-to-text model management
keeps its content but is renamed to **STT Models** (per Q1 above).
The screenshot the user shared shows the target Prompts tab layout: a
two-pane prompt library (search + grouped list of built-in and custom
prompts on the left, name/icon/prompt-text editor on the right) with
an "active" indicator (orange dot) next to the currently selected prompt.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Find and edit a prompt without hunting through "Advanced" (Priority: P1)

A power user wants to tweak the wording of the "Email" formatting prompt
because it's adding too many salutations. Today they have to: open
Formatting → scroll past AI Providers and Formatting Options → expand the
collapsed "Custom Prompts (Advanced)" panel → switch tabs inside that
panel to "Email" → edit. After this feature, they click **Prompts** in the
sidebar, click **Email** in the prompt list, and edit the text directly in
the right pane. Editing the visible prompt content is the primary task of
this feature.

**Why this priority**: This is the change's core value. Prompt editing is
a frequent, intentional action for users who care about output quality;
hiding it inside an "Advanced" collapsible behind two unrelated sections
is the friction this feature removes. Without this, the rest of the
restructure has no payoff.

**Independent Test**: A user starting on Overview can reach the Email
prompt's editable text in two clicks (Prompts tab → Email row) and a
saved edit is reflected the next time the Email preset is used during
transcription post-processing — verifiable end-to-end without changes to
LLM Models or STT Models tabs.

**Acceptance Scenarios**:

1. **Given** the user is on any settings screen, **When** they click
   "Prompts" in the sidebar, **Then** the Prompts tab opens showing a
   list of all built-in prompts (Default, Prompts, Email, Commit) and
   any user-created custom prompts, plus a search field and a "New
   prompt" entry.
2. **Given** the Prompts tab is open with no selection, **When** the
   user clicks the "Email" row, **Then** the right pane shows the
   prompt's name, icon, and full prompt text in editable fields.
3. **Given** a built-in prompt is selected, **When** the user edits the
   prompt text and pauses typing, **Then** the change is auto-saved
   (status indicator shows "Saved automatically") and persists across
   app restarts.
4. **Given** a built-in prompt has been edited, **When** the user
   transcribes audio with that preset active, **Then** the AI provider
   receives the user's edited prompt text (not the shipped default).
5. **Given** any prompt is selected for editing, **When** the user
   triggers the explicit "Set as active" affordance, **Then** the
   active indicator (orange dot) moves to that prompt and that prompt
   is used for the next transcription. Selecting a row alone (without
   activating) MUST NOT change the active prompt.

---

### User Story 2 — Distinguish "language model" settings from "transcription model" settings (Priority: P1)

A new user installs VoiceTypr and wants to set up an OpenAI API key for
post-processing. Today they have to know that "Formatting" is where API
keys live — the label gives no hint. After this feature, **LLM Models**
clearly signals "this is where I configure the language model that
formats my transcripts," visually separated from **STT Models** (which
manages the speech-to-text engine that produces the raw transcript).

**Why this priority**: Discoverability for first-run users. The current
"Formatting" label conflates two different model types and is the single
most common navigation question for new users. P1 because it directly
affects activation/onboarding success.

**Independent Test**: A user who has never seen the app can identify, on
first look at the sidebar, which tab to open to enter an OpenAI/Anthropic
API key (LLM Models) and which tab to open to download a Whisper model
(STT Models). Verifiable via a quick label-comprehension check, separate
from the Prompts tab work.

**Acceptance Scenarios**:

1. **Given** the user opens settings for the first time, **When** they
   scan the sidebar, **Then** they see three labels in this section:
   "Prompts", "LLM Models", "STT Models" — each with a distinct icon.
2. **Given** the user clicks "LLM Models", **Then** they see only AI
   provider selection, API key entry, model picker, and the Setup
   Guide — but NOT the prompt text editor, NOT the legacy "Custom
   Prompts (Advanced)" collapsible, and NOT the legacy "Formatting
   Options" toggles (the latter are removed entirely per FR-014a).
3. **Given** the user clicks "STT Models", **Then** they see exactly the
   content that today appears in the "Models" tab (Whisper / Parakeet
   downloads, transcription engine selection, language picker) — only
   the tab label and icon may differ.

---

### User Story 3 — Create a custom prompt (Priority: P2)

A user wants a "Slack reply" prompt that produces lowercased, casual,
slightly-truncated replies. They click **Prompts → New prompt**, give it
a name and an icon, paste their prompt text, and from then on it appears
alongside the built-in prompts and can be selected as the active prompt
for a recording.

**Why this priority**: This unlocks user expression beyond the four
shipped presets, which today is impossible without code edits. P2 rather
than P1 because P1 (in-place editing of built-ins) already delivers the
core "edit your prompts" value; custom prompts are an expansion on top.

**Independent Test**: A user with no custom prompts yet creates one,
selects it as active, transcribes a clip, and observes that the AI
provider received the custom prompt text. Verifiable independently of the
LLM Models / STT Models renames.

**Acceptance Scenarios**:

1. **Given** the Prompts tab is open, **When** the user clicks "New
   prompt", **Then** a fresh prompt editor opens with empty
   name/icon/text fields and the new prompt is grouped under "Custom".
2. **Given** the user has filled in name, icon, and prompt text,
   **When** they navigate away or pause typing, **Then** the prompt is
   auto-saved and persists across app restarts.
3. **Given** a custom prompt exists, **When** the user triggers the
   explicit "Set as active" affordance for it and then runs a
   transcription, **Then** the post-processor uses the custom prompt's
   text.
4. **Given** a custom prompt exists, **When** the user deletes it,
   **Then** it is removed from the list, and if it was active, the
   active prompt falls back to "Default".
5. **Given** many prompts exist, **When** the user types into the search
   field, **Then** the list filters to prompts whose name matches.

---

### Edge Cases

- **In-flight overrides from the old "Custom Prompts (Advanced)" panel
  must survive the migration.** A user who edited the Email base prompt
  in the old UI must see those edits as the prompt text on the Email
  row in the new Prompts tab — not the shipped default.
- **Active preset selection.** If today's active preset is stored under
  one of the four built-in identifiers, "active prompt" in the new model
  must remain compatible: built-in active prompts map to the same
  identifier; custom active prompts use a stable id (e.g., UUID).
- **Empty prompt text.** Clearing the prompt text field is blocked
  with inline validation (per Q3): the user cannot save an empty
  prompt. Built-ins surface a "Reset to default" recovery action; the
  AI provider is never invoked with an empty prompt.
- **Deleting the active custom prompt.** Active selection must
  gracefully fall back (e.g., to Default) rather than leaving the system
  with no active prompt.
- **Built-in deletion attempt.** Users must not be able to delete
  built-in prompts (Default, Prompts, Email, Commit) — only reset their
  edits to the shipped default.
- **Search with no matches.** Typing a search term that matches nothing
  shows an empty state, not a frozen previous list.
- **Hotkey-driven preset cycling (in-flight from feature 002).** If the
  in-flight 002 feature ships overlay-driven preset cycling, the
  "active prompt" identifier surface must remain stable so the cycler
  keeps working — no rename of the underlying preset ids as part of this
  UI restructure.
- **Removal of `EnhancementSettings` UI (Q5 / FR-014a).** Reading the
  code revealed `EnhancementSettings` is the **active-preset pill
  picker** (Default/Prompts/Email/Commit), not "per-preset toggles" as
  earlier drafts implied. Q5's "Remove entirely" therefore means: the
  duplicate active-prompt selector is removed from the LLM Models tab,
  because the Prompts tab now owns active-prompt selection. The
  underlying persisted `enhancement_options.preset` field is
  **repurposed**, not deleted: it becomes `active_prompt_id` (string)
  capable of pointing at any prompt — built-in or custom. No user
  behavior is silently lost. Release notes should mention the moved
  selector location.

## Requirements *(mandatory)*

### Functional Requirements

#### Sidebar navigation

- **FR-001**: The settings sidebar MUST expose three tabs in this slot,
  in this order, replacing the current `Models` and `Formatting`
  entries: **Prompts** → **LLM Models** → **STT Models**.
- **FR-002**: Each of the three tabs MUST have a distinct icon and label
  matching the screenshot intent: Prompts uses a sparkle/document icon,
  LLM Models a chip/cpu icon, STT Models a microphone or audio icon
  (specific iconography is a design choice, but the three icons must be
  visually distinct from each other and from existing tabs).
- **FR-003**: Tabs that are NOT part of this restructure (Overview,
  History, Upload, Settings, About, Advanced) MUST remain unchanged in
  position, label, and behavior.

#### Prompts tab

- **FR-004**: The Prompts tab MUST display all four built-in prompts
  (Default, Prompts, Email, Commit) under a "BUILT-IN" group, plus all
  user-created prompts under a "CUSTOM" group.
- **FR-005**: Each prompt row MUST show the prompt's name, icon, a
  short description/preview, and a "default" or "custom" badge.
- **FR-006**: The currently active prompt MUST be visually marked (e.g.,
  the orange dot in the screenshot).
- **FR-007**: Selecting a prompt row MUST open an editor in the right
  pane with three editable fields: **Name**, **Icon** (chosen from a
  predefined icon set), and **Prompt** (the full prompt text).
- **FR-008**: Edits to any field MUST auto-save without requiring an
  explicit save button, and the UI MUST display a clear "Saved
  automatically" status with a character count.
- **FR-009**: Built-in prompts MUST be editable (overriding the shipped
  defaults for Name, Icon, and Prompt text) but MUST NOT be deletable.
  A single per-prompt "Reset to default" action MUST be available in
  the editor pane that restores **all three fields** (Name, Icon,
  Prompt text) to their shipped defaults atomically. There is no
  per-field reset.
- **FR-010**: Users MUST be able to create a new custom prompt via a
  "New prompt" entry at the bottom of the list.
- **FR-011**: Users MUST be able to delete custom prompts; deleting the
  currently active custom prompt MUST cause the active selection to
  fall back to the **Default** built-in prompt.
- **FR-012**: A search field above the list MUST filter the visible
  prompts by name match (case-insensitive substring) and show an empty
  state when no prompts match.
- **FR-013**: Selecting a prompt row MUST open that prompt in the
  editor pane WITHOUT changing which prompt is active. Activating a
  prompt MUST require a distinct, explicit affordance (e.g., a "Set as
  active" button in the editor pane or an inline indicator-toggle on
  the row). The active-state indicator (orange dot) and the
  editing-focus state of a row MUST be independent and may point to
  different prompts simultaneously.
- **FR-013a**: The Prompt text field MUST reject empty values via
  inline validation: an empty (or whitespace-only) Prompt MUST NOT be
  persisted. The save-status indicator MUST surface the validation
  error rather than report "Saved automatically". For built-in
  prompts, the per-prompt "Reset to default" action (FR-009) is the
  recovery path. For custom prompts, the user MUST provide non-empty
  text before the prompt can be created.

#### LLM Models tab

- **FR-014**: The LLM Models tab MUST contain exactly the AI Providers
  section (provider selection, API key, active LLM picker) and the
  Setup Guide. It MUST NOT contain the previous "Formatting Options"
  section — those `EnhancementSettings` per-preset toggles are
  removed from the product entirely (see FR-014a).
- **FR-014a**: The `EnhancementSettings` per-preset toggles
  ("Formatting Options") MUST be removed from the UI, from settings
  storage, and from the post-processing pipeline. After this change,
  no toggle in the UI configures runtime AI-formatting behavior outside
  of the active prompt's text. Any behavior a user previously achieved
  via these toggles MUST be re-expressed within the Prompt text
  itself; the migration MUST NOT silently retain or shadow the old
  toggle state.
- **FR-015**: The LLM Models tab MUST NOT display the prompt text
  editor, the per-preset prompt-tab pill selector for editing prompt
  text, the "Formatting Options" toggles, or any "Custom Prompts
  (Advanced)" collapsible.
- **FR-016**: The LLM Models tab MUST preserve all functional behavior
  of today's Formatting tab for AI provider configuration: existing
  configured providers/keys remain valid; switching the active LLM
  works identically; the master "AI formatting on/off" switch (if it
  exists today as a top-level toggle, separate from the per-preset
  `EnhancementSettings`) works identically.
- **FR-017**: The header of the LLM Models tab MUST clearly indicate it
  is for language-model (post-processing) configuration, distinct from
  speech-to-text models.

#### STT Models tab

- **FR-018**: The STT Models tab MUST contain exactly the content of
  today's Models tab (Whisper / Parakeet downloads, transcription
  engine selection, spoken-language picker, model status).
- **FR-019**: Only the sidebar label and (optionally) the page header
  text change; functional behavior, model files, persistence keys, and
  download flows MUST be unchanged.

#### Migration of existing user data

- **FR-020**: Any prompt overrides a user previously made via the old
  "Custom Prompts (Advanced)" panel MUST appear as the corresponding
  built-in prompt's editable text in the new Prompts tab, with no data
  loss.
- **FR-021**: The previously active formatting preset MUST remain the
  active prompt in the new model; users MUST NOT be silently switched
  to a different prompt by this UI restructure alone.

### Key Entities

- **Prompt**: A named, icon-decorated piece of post-processor instruction
  text. Either a **built-in** (one of the four shipped presets, with
  editable user overrides and a fixed id) or **custom** (user-created,
  with a generated stable id, deletable). Has fields: id, kind
  (built-in / custom), name, icon, prompt text, optional shipped-default
  text (built-ins only). The "active" flag — exactly one prompt is
  active — may live on the prompt or as a top-level "active prompt id"
  setting; the latter is simpler and matches today's "active preset"
  storage.
- **Settings tab definition**: The sidebar's tab list — id, label,
  icon, order, and which content section it routes to. The restructure
  changes three entries in this list and adds one new entry (Prompts).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user starting on Overview can reach the editable text of
  any built-in or custom prompt in **at most 2 clicks** (Prompts tab →
  prompt row), with the editor visible in the same view (no further
  expansion / collapse / sub-tab needed). Today's path requires 4+
  clicks (Formatting → expand Advanced → switch sub-tab → edit).
- **SC-002**: After the restructure, **0% of existing user prompt
  overrides** are lost: every user who had edited a built-in preset's
  text in the old UI sees that exact text on the corresponding prompt
  row in the new UI on first launch.
- **SC-003**: After the restructure, **0% of existing API-key/provider
  configurations** are lost: every user who had a working LLM provider
  configured under the old "Formatting" tab continues to see and use
  that configuration under "LLM Models".
- **SC-004**: A first-run user, given only the sidebar labels, can
  correctly identify which tab to open to (a) configure an OpenAI API
  key, (b) download a transcription model, and (c) edit the Email
  prompt — with **>80% accuracy** in a small comprehension test (5+
  participants), versus the current "Formatting" / "Models" labels which
  routinely confuse new users on these tasks.
- **SC-005**: Users can create, edit, set-active, and delete a custom
  prompt — and observe its effect on a transcription — in a single
  uninterrupted session, with **no need to restart the app** between
  any of these steps.
- **SC-006**: STT Models tab functional regressions: **zero**.
  Whisper/Parakeet model downloads, engine selection, language picker,
  and any in-flight 002 overlay/cycler integration all behave
  identically to the pre-restructure Models tab.

## Assumptions

- The user's instruction "no changes to underlying prompt storage, AI
  providers, or transcription engines" is interpreted as: no change to
  how the active prompt is applied during post-processing, no change to
  AI provider integration code, no change to transcription engines.
  Adding a custom-prompt persistence shape (which the screenshot's
  "Slack reply" custom prompt clearly requires) is treated as
  in-scope incremental storage, not a "change" to the existing storage.
- The four shipped preset identifiers (`default`, `prompts`, `email`,
  `commit`, or whatever the codebase uses today) are stable. The
  rename of "Formatting" → "LLM Models" does NOT change any persisted
  preset id, so feature 002's overlay preset cycler keeps working.
- The active prompt is a single global selection (one prompt active at
  a time), consistent with today's "active preset" model. Per-language
  or per-context active prompts are out of scope for this feature.
- Iconography for the three new/renamed tabs is a UX decision and may
  be refined in implementation; the spec only requires three visually
  distinct icons that don't collide with existing sidebar tabs.
- `EnhancementSettings` is the active-preset pill picker (not
  per-preset toggles, despite earlier drafts saying so). Per Q5 / FR-014a
  it is removed from the UI; the underlying persisted active-preset
  field is repurposed as `active_prompt_id` and now owned by the
  Prompts tab. No user-facing behavior is silently lost.
- Bottom-group "Advanced" tab is unrelated to the "Custom Prompts
  (Advanced)" collapsible section name and is unaffected by this
  feature.

