# Follow-Ups — Settings Tab Restructure (003)

Items deferred from `/speckit-plan`. Captured here so they survive context clears and don't get lost between this feature and the next.

---

## FU-1 — Delete legacy `enhancement_options` + `custom_prompts` store keys

**Status**: deferred.
**Trigger**: the release **after** the one that ships this feature.
**Reason for defer**: the migration in `data-model.md` deliberately leaves the two legacy `tauri-plugin-store` keys in place post-migration as a forensic trail, so users hitting bugs can be asked to attach them. After one release of in-the-wild bake time, they're dead weight and worth removing to keep the store JSON readable for future fork rebases against upstream.

**What to do**:

1. Confirm the deprecated Tauri cmds (`get_enhancement_options`, `update_enhancement_options`, `get_custom_prompts`, `update_custom_prompts`, `get_default_prompts`) have been removed (per `contracts/tauri-commands.md` plan, that removal happens in the same release-after-next).
2. Add a one-shot cleanup in `src-tauri/src/migrations/` (e.g., `prompt_library_v2_cleanup.rs`):
   - Read the `prompts` key.
   - If `version >= 1` and the blob is sane (4 built-ins present, `active_prompt_id` resolves) → delete keys `enhancement_options` and `custom_prompts` from the store.
   - Bump library `version` to `2`.
3. Add a unit test for both branches (legacy keys present vs already absent — idempotent).
4. CHANGELOG entry: `chore(ai): remove legacy enhancement_options / custom_prompts store keys post-migration`.

**Pre-check before running this**: search the repo for any lingering reads of the legacy keys (`grep -rn 'enhancement_options\|custom_prompts' src-tauri/src/` should return zero hits in non-test, non-migration code). If anything still reads them, address that first.

**Cost**: ~1h dev + a 5-line CHANGELOG note. Low risk because the cleanup is conditional on a sane new-shape blob being present.

---

## FU-2 — Decide feature 002 ↔ feature 003 active-prompt contract when unstashing 002

**Status**: deferred.
**Trigger**: when un-stashing the in-flight `002-overlay-preset-language` work (currently `stash@{0}` on the 002 branch). Decide **before** that branch merges, ideally during 002's own merge process — do **not** retrofit this into 003.

**Background**:

- Feature 002 ships an overlay-driven preset cycler. It reads/writes the active preset by enum value (`EnhancementPreset = Default | Prompts | Email | Commit`) via the legacy `enhancement_options.preset` field.
- Feature 003 (this feature) replaces that field with `active_prompt_id` (string), capable of pointing at built-ins **or** custom prompts.
- Stable contract guaranteed by 003's migration: `active_prompt_id == "builtin:" + lowercase(EnhancementPreset)` for the four built-ins.

**Decision required**: pick one path for 002 to work post-merge.

**Option A — Thin shim**.
- 002 keeps reading/writing the `EnhancementPreset` enum.
- A small adapter in 002 (or shared) translates enum ↔ `active_prompt_id` for built-ins on every read/write.
- Pros: minimal 002 diff; 003 doesn't need to know about 002.
- Cons: 002 can never cycle to a custom prompt — the cycler is permanently 4-built-ins-only. Two parallel "active" surfaces (enum + id) drift risk.

**Option B — 002 operates on `active_prompt_id` strings directly**.
- 002's overlay-cycler code is updated to read/write `active_prompt_id` directly.
- The cycle is a list of ids; can include custom prompts (or be configurable in a future feature).
- Pros: single canonical surface; future-proofs custom-prompt cycling.
- Cons: larger 002 diff; the 002 spec/plan/tasks may need a clarification entry recorded retroactively.

**Recommended**: **Option B**. Rationale: removes a permanent ceiling on the cycler, keeps the data model unified, and the diff cost is one-off vs. carrying a shim forever.

**What to do (when un-stashing 002)**:

1. Pop the 002 stash, resolve any merge conflicts against the now-merged 003 state.
2. Add a clarification entry to `specs/002-overlay-preset-language/spec.md` recording the decision (A or B).
3. If Option B: refactor the cycler in 002 to read/write `active_prompt_id`. Update any 002 tests asserting `EnhancementPreset` enum values to assert `active_prompt_id` strings instead.
4. Smoke test: cycle hotkey on 002 moves through built-ins in canonical order (`builtin:default` → `builtin:prompts` → `builtin:email` → `builtin:commit` → wrap). Active dot in the Prompts tab updates to match. Recording uses the resolved active prompt's text.
5. PR description for 002 mentions which path was taken.

**Cost**: Option A ~30min (write shim, test). Option B ~2–3h (refactor + tests). Either way the work belongs to feature 002, not 003.

---

## How to find this file later

- `specs/003-settings-tab-restructure/follow-ups.md` (this file).
- Referenced from the 003 PR description.
- Add a one-line pointer to the project CHANGELOG when 003 lands so future-you grepping CHANGELOG for "follow-up" finds it.
