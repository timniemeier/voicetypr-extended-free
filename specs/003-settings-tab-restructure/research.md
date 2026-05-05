# Research — Settings Tab Restructure

**Phase**: 0 (Outline & Research) | **Branch**: `003-settings-tab-restructure` | **Date**: 2026-05-04

## Purpose

Resolve the technical unknowns implied by the spec — storage shape for the new prompt library, migration of existing user data, repurposing of `enhancement_options.preset`, and a sanity check on what `EnhancementSettings` actually is in code today vs. how the spec described it.

---

## R1 — What `EnhancementSettings` actually is today (correction to spec framing)

**Decision**: Treat `EnhancementSettings` as **the active-preset pill picker**, not "per-preset toggles". Update spec edge case + assumptions accordingly.

**Rationale**: Reading `src/components/EnhancementSettings.tsx`: the component renders four pills (Default / Prompts / Email / Commit) and emits a `preset` change. There are no per-preset on/off toggles, no aggressiveness sliders, no behavior knobs. The persisted shape `EnhancementOptions { preset: EnhancementPreset }` (Rust + TS) confirms this — a single enum field. The spec's "per-preset toggles … breaking change" framing came from my initial misreading and overstates the impact of Q5.

**Real consequence of Q5 ("Remove EnhancementSettings entirely")**:
- The duplicate active-preset selection UI inside Formatting/LLM Models is removed. The Prompts tab (per Q2) becomes the single place to set the active prompt.
- The persisted field `enhancement_options.preset` is **repurposed**, not deleted: it becomes the active-prompt id (string), capable of pointing at any prompt — built-in or custom. Backwards-compat migration translates the four enum values (`Default`/`Prompts`/`Email`/`Commit`) into stable built-in ids (`builtin:default`, `builtin:prompts`, `builtin:email`, `builtin:commit`).
- No user-visible behavior is silently lost. The "release-note callout" edge case in spec is downgraded to "communicate the moved location of the active-prompt selector".

**Alternatives considered**:
- *Treat Q5 literally as written* — delete `EnhancementOptions` entirely, store active prompt only as a top-level `active_prompt_id` setting key. Cleaner long-term, but adds churn to `commands/ai.rs` (4 cmds rewired) and to the AI provider call sites that read `EnhancementOptions`. Not worth it for a fork-local rename.
- *Keep `EnhancementOptions.preset` as `EnhancementPreset` enum, store custom prompts entirely separately* — would force two parallel "active" concepts. Rejected: contradicts Q2's single-active model.

**Action**: Edit spec edge case "Removal of `EnhancementSettings` toggles (Q5 / FR-014a)" to reflect the corrected reality (no behavior loss, just UI consolidation + storage rename). Also tighten Assumption bullet about Q5.

---

## R2 — Prompt library storage shape

**Decision**: Store a single library blob under `tauri-plugin-store` key `prompts`, shape:

```jsonc
{
  "version": 1,
  "active_prompt_id": "builtin:default",
  "prompts": [
    {
      "id": "builtin:default",
      "kind": "builtin",
      "builtin_id": "default",         // stable enum tag for build_enhancement_prompt routing
      "name": "Default",
      "icon": "FileText",              // lucide icon name from a fixed allowlist
      "prompt_text": "<resolved text>" // user-edited or shipped default
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
      "id": "custom:9c3f...",          // UUIDv4 prefixed with kind
      "kind": "custom",
      "name": "Slack reply",
      "icon": "MessageSquare",
      "prompt_text": "..."
    }
  ]
}
```

**Rationale**:
- A single key keeps writes atomic — no risk of half-saved migrations.
- `version: 1` lets future migrations bump cleanly.
- `id` is the canonical handle used everywhere (`active_prompt_id`, hotkey-cycle from feature 002, etc.). Built-ins use a stable string id; custom prompts use UUIDs. Prefixes (`builtin:` / `custom:`) make logs readable and prevent collisions.
- Built-ins keep a `builtin_id` enum tag — that's what `build_enhancement_prompt` matches on to apply language-specific transforms. The Name and Icon are pure UI sugar; the active prompt's `prompt_text` is what the AI gets.
- Shipped-default text is **not** persisted on the built-in entry. It lives in the binary (Rust constants) and is fetched on demand for the "Reset to default" action. This avoids carrying a frozen old default forward across upgrades.

**Alternatives considered**:
- *Per-prompt records as separate keys* (`prompt:builtin:default`, `prompt:custom:9c3f...`): list operations become N reads, ordering unstable. Rejected.
- *Active-prompt id stored in a separate top-level key* (e.g., `active_prompt_id`): clean separation but two keys to keep in sync during migration. Inlined into the library blob is simpler.

---

## R3 — Migration from current state

**Decision**: One-shot, idempotent migration on app startup. Read old keys, write new key, leave old keys in place but mark migration done with a sentinel inside the new library blob (`version: 1`). On subsequent boots, presence of `prompts` key → skip migration.

**Steps**:

1. On startup, after `tauri-plugin-store` load: check for `prompts` key. If present and `version >= 1` → done.
2. Else, read:
   - `enhancement_options` (legacy `{ preset: "Default" | ... }`) → maps to `active_prompt_id = "builtin:" + lowercase(preset)`.
   - `custom_prompts` (legacy `{ base, prompts, email, commit }`, each `Option<String>`):
     - `base`: dropped during migration (the new model has no separate "base" template; the four built-ins each carry their full prompt text). Document this in release notes as a behavior change for users who edited only `base`.
     - `prompts`, `email`, `commit`: become the `prompt_text` of the corresponding built-in. If `None` or empty, the built-in starts with its shipped default.
   - Note: today's `Default` preset has no separate user-editable override (the UI's tabbed editor offers only `base/prompts/email/commit`). The new "Default" built-in starts with the **shipped default** prompt text; users can edit it after migration.
3. Write the new `prompts` blob with `version: 1`.
4. Old keys (`enhancement_options`, `custom_prompts`) are NOT deleted — they remain as forensic state. New code never reads them.

**Rationale**: Idempotent + reversible. If the user wipes the new key, the old keys still exist and a re-run of the migration recreates the library. Crash mid-migration is safe because the write is atomic at the store layer.

**Alternatives considered**:
- *Aggressive migration* — delete old keys post-write. Loses forensic trail, doesn't help anything.
- *Lazy migration on first read* — race conditions on parallel callers. Reject in favor of single-shot at startup.

---

## R4 — Backend `build_enhancement_prompt` after refactor

**Decision**: Keep the function signature stable. Replace the old call shape

```rust
fn build_enhancement_prompt(
    text, context, options: &EnhancementOptions, language, custom_prompts: &CustomPrompts,
) -> String
```

with a new call shape that takes the resolved active `Prompt`:

```rust
fn build_enhancement_prompt(
    text, context, active_prompt: &Prompt, language,
) -> String
```

For built-ins: `active_prompt.builtin_id` selects the language-aware base assembly (same as today's match on `EnhancementPreset`), and `active_prompt.prompt_text` is the user-resolved transform body. For custom prompts: skip the built-in transform-vs-base split entirely — `active_prompt.prompt_text` is the full prompt sent to the AI, with language substitution applied on `{language}` placeholder if present.

**Rationale**:
- Single resolved input ≡ single source of truth at call time.
- Custom prompts get the full power of authoring — no implicit "base" wrapping.
- Built-ins keep their current behavior (language-aware base + transform) so existing tests keep their semantics.

**Alternatives considered**:
- *Keep `EnhancementOptions` + `CustomPrompts` shape unchanged, internally redirect via active_prompt_id*: smaller diff but fragile — the type still implies the four-enum world, hides the new model from readers.

---

## R5 — Auto-save behavior + validation

**Decision**: Debounced auto-save (~500ms after last keystroke). Validation runs before persist. Empty/whitespace-only `prompt_text` blocks save and shows inline error (per Q3). Length cap stays at `MAX_CUSTOM_PROMPT_LEN = 8192` bytes (existing constant). Name field: required, ≤ 64 chars. Icon field: must be from the allowed lucide-react subset.

**Rationale**: 500ms balances "don't spam writes" with "feels saved by the time I look up". Existing length cap stays — no constitutional precedent to expand it. Frontend mirrors backend validation so the user sees errors before a roundtrip.

**Alternatives considered**:
- *Save-on-blur only* — surprising for users who Tab-cycle through fields.
- *No debounce, save on every keystroke* — wastes writes, may starve UI on slow disks.

---

## R6 — Icon set (built-in vs picker)

**Decision**: A fixed allowlist of ~16 lucide-react icons exposed via the Icon picker. Initial set, matching the screenshot:

```
FileText, Sparkles, Mail, GitCommit, Pencil, BookOpen,
List, MessageSquare, Briefcase, Hash, Scissors, Type,
StickyNote, Terminal, Star, Zap
```

**Rationale**:
- Bounded set means the persisted icon string is reliably resolvable to a renderable component (no "icon-not-found" state).
- Mirrors the screenshot grid exactly, so the design matches the supplied mockup.
- Adding icons later is a one-line allowlist update.

**Alternatives considered**:
- *Free-form lucide name* — risk of typos / removed icons across lucide upgrades.
- *Emoji* — works but doesn't match the visual style of the rest of the app.

---

## R7 — Tab definition shape in `Sidebar.tsx`

**Decision**: Replace the current two entries (`models`, `formatting`) with three entries (`prompts`, `llm-models`, `stt-models`) in this order. Top-group order becomes:

```ts
{ id: "overview",   label: "Overview",   icon: Home },
{ id: "recordings", label: "History",    icon: Clock },
{ id: "audio",      label: "Upload",     icon: FileAudio },
{ id: "general",    label: "Settings",   icon: Settings2 },
{ id: "prompts",    label: "Prompts",    icon: Sparkles },        // NEW
{ id: "llm-models", label: "LLM Models", icon: Cpu },             // was "models" → now "llm-models"
{ id: "stt-models", label: "STT Models", icon: Mic },             // was "models" with different content; renamed
{ id: "about",      label: "About",      icon: Info },
```

Wait — collision. "Models" today has id `models` and routes to `ModelsSection`. The new layout repurposes that id. Cleaner: change ids alongside labels (`models` → `stt-models`, `formatting` → `llm-models`), and add `prompts`. Each id maps to its section in the existing route-switch in `App.tsx` (or wherever the `activeSection` state branches).

**Rationale**: Renaming ids is a one-time grep-replace, fork-local, and avoids confusion later (id `models` would be misleading after the LLM/STT split). Routes are not user-visible; only the section component mapping changes.

**Alternatives considered**:
- *Keep ids `models`/`formatting`, only change labels* — simpler diff but leaves stale id naming. Rejected on readability grounds; the cost of rename is trivial.

---

## R8 — Active prompt cycling compatibility (feature 002 hand-off)

**Decision**: Feature 002's overlay preset cycler reads/writes the active preset by enum value (`Default` / `Prompts` / `Email` / `Commit`). After this restructure, it should read/write `active_prompt_id` instead, cycling through built-ins by default and (optionally, future work) including custom prompts.

**For this feature's scope**: ensure the new `active_prompt_id` is the single source of truth for active selection, and the value it can hold maps cleanly to/from feature 002's `EnhancementPreset` for built-ins. Concrete contract: `active_prompt_id == "builtin:" + lowercase(EnhancementPreset)`. Feature 002 either (a) reads/writes the enum and a thin shim translates, or (b) is updated to operate on `active_prompt_id` strings (preferred long-term, but not required for this feature to ship).

**Rationale**: The 002 branch is in-flight and stashed; explicit cross-feature contract reduces merge friction when 002 is unstashed.

**Alternatives considered**:
- *Block 002 from reaching main until 003 unifies the surface* — over-coupling. Both can ship independently with the shim.

---

## R9 — Test surfaces

**Decision**:

- **Backend**: extend `src-tauri/src/ai/tests.rs` with: prompt library serialization round-trip, migration from legacy keys (covering empty / partial / full custom_prompts), `build_enhancement_prompt` with built-in active prompt, with custom active prompt, with empty prompt validation. New file `src-tauri/src/migrations/prompt_library_v1.rs` gets unit tests for all migration branches.
- **Frontend**: add `src/components/prompts/__tests__/PromptList.test.tsx` (search filtering, group rendering, active-dot rendering), `PromptEditor.test.tsx` (auto-save debounce, empty-text validation, reset action restores all three fields), `PromptsSection.test.tsx` (set-active separate from select-for-edit). Existing `EnhancementsSection.test.tsx` is replaced/trimmed to cover only the LLM Models post-restructure surface.
- **Sidebar**: add a tiny snapshot test for the new tab list shape so accidental reorderings during rebases trip CI.

**Rationale**: Tracks the "everything machine-checkable" constitution principle; explicit migration tests prevent silent data loss on first post-upgrade boot.

**Alternatives considered**:
- *Skip migration tests, rely on manual smoke* — directly violates Principle IV (Type Safety & Quality Gates) — rejected.

---

## Summary of resolved unknowns

| Question | Decision |
|---|---|
| What is `EnhancementSettings` actually? | Active-preset pill picker. Removal = UI consolidation, not behavior loss. |
| Storage shape for prompt library | Single `prompts` blob in `tauri-plugin-store`, versioned, atomic. |
| Migration strategy | One-shot idempotent at startup; old keys retained for forensics. |
| `build_enhancement_prompt` signature | Takes resolved `Prompt` directly; built-in vs custom branched on `kind`. |
| Auto-save + validation | 500ms debounce, length cap reused (8192 bytes), empty-text block. |
| Icon picker | Fixed allowlist of 16 lucide icons. |
| Sidebar ids | Renamed alongside labels (`models` → `stt-models`, `formatting` → `llm-models`, new `prompts`). |
| Feature 002 handoff | Stable contract: `active_prompt_id` for built-ins is `"builtin:" + lowercase(EnhancementPreset)`. |
| Test coverage | Backend: migration + resolver. Frontend: list/editor/section + sidebar snapshot. |

All `[NEEDS CLARIFICATION]` flags from spec are resolved (the spec itself ended with zero markers; this research closes the implicit unknowns surfaced when reading code).
