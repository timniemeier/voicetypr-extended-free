//! Pure logic for the global-shortcut cycle actions added in spec 002
//! ("Overlay Preset & Language Toggles").
//!
//! These helpers are intentionally side-effect-free so they can be unit-tested
//! without booting Tauri. The dispatch glue lives in
//! [`crate::recording::hotkeys`].
//!
//! ## Active-prompt contract (spec 002 + 003 FU-2 — Option B)
//!
//! Spec 003 replaced the legacy `EnhancementPreset` enum-on-the-wire with a
//! string `active_prompt_id` that can point at either a built-in OR a
//! user-authored custom prompt. The cycler in this module operates on the new
//! id surface directly (FU-2 Option B), but only cycles through the four
//! built-ins in canonical order:
//!
//!   `builtin:default → builtin:prompts → builtin:email → builtin:commit → wrap`
//!
//! Custom prompts are intentionally NOT in the cycle for this feature — the
//! 4-built-in cycle is the spec's contract (US1) and a future feature can
//! widen it.

use crate::ai::prompts::{BuiltinId, BUILTIN_DEFAULT_ID};

/// Outcome of a cycle-language attempt. Mirrors the three branches the
/// cycle-language hotkey handler takes (per spec 002 — US2 +
/// `data-model.md` § "Active language cycle").
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LanguageCycleOutcome {
    /// `enabled_languages` has 0 or 1 entries. Frontend should emit a
    /// `cycle-language-noop { reason: "single_language" }` event.
    SingleLanguageNoop,
    /// The active speech model is English-only — the active language stays
    /// pinned to whatever the model-fallback path has already selected
    /// (typically `"en"`). Frontend should emit
    /// `cycle-language-noop { reason: "english_only_model" }`.
    EnglishOnlyModelNoop,
    /// Cycled successfully. The new active language is the wrapped value.
    Advanced(String),
}

/// Canonical ordered list of built-in prompt ids the cycler walks.
pub fn builtin_cycle_ids() -> [String; 4] {
    let order = BuiltinId::canonical_order();
    [
        order[0].prompt_id(),
        order[1].prompt_id(),
        order[2].prompt_id(),
        order[3].prompt_id(),
    ]
}

/// Advance to the next built-in `active_prompt_id` in canonical order,
/// wrapping `builtin:commit → builtin:default`.
///
/// Behaviour:
/// * `current` matches one of the 4 built-in ids → return the next built-in.
/// * `current` is a custom id (`custom:<uuid>`) or anything else → start the
///   cycle at `builtin:default`. Rationale: the cycle is a 4-built-in ring;
///   if the user is currently parked on a custom prompt, pressing the cycle
///   hotkey enters the ring at the canonical first slot.
pub fn next_active_prompt_id(current: &str) -> String {
    let cycle = builtin_cycle_ids();
    if let Some(idx) = cycle.iter().position(|id| id == current) {
        let next_idx = (idx + 1) % cycle.len();
        return cycle[next_idx].clone();
    }
    BUILTIN_DEFAULT_ID.to_string()
}

/// Human-readable label for a built-in prompt id, used as the
/// `active-prompt-changed` event payload's `label` field. Returns `None` for
/// non-built-in ids; callers can fall back to the prompt's `name` field
/// from the library if a custom prompt ever ends up active mid-cycle.
pub fn builtin_label(id: &str) -> Option<&'static str> {
    match id {
        "builtin:default" => Some("Default"),
        "builtin:prompts" => Some("Prompts"),
        "builtin:email" => Some("Email"),
        "builtin:commit" => Some("Commit"),
        _ => None,
    }
}

/// Predicate matching `STTModelsSection.tsx::isEnglishOnlyModel`. The Whisper
/// `*.en` regex is implemented as a case-insensitive suffix check; the
/// Parakeet `-v2` rule is a substring check. Cloud engines (e.g. Soniox)
/// and an empty model name are not English-only.
pub fn is_english_only_model(engine: &str, model_name: &str) -> bool {
    if model_name.is_empty() {
        return false;
    }
    match engine {
        "whisper" => {
            let lower = model_name.to_ascii_lowercase();
            lower.ends_with(".en")
        }
        "parakeet" => model_name.contains("-v2"),
        _ => false,
    }
}

/// Compute the next active language given the current active code, the
/// ordered enabled set, and the active model.
///
/// Returns one of three outcomes (no I/O, no Tauri dependency):
///   * `SingleLanguageNoop` — the enabled set has ≤ 1 entries.
///   * `EnglishOnlyModelNoop` — the model is English-only.
///   * `Advanced(next)` — wrapped advance through `enabled_languages`. If
///     the `current` code is not in the set (data-corruption case), we wrap
///     to the first entry.
pub fn next_language(
    enabled_languages: &[String],
    current: &str,
    engine: &str,
    model_name: &str,
) -> LanguageCycleOutcome {
    if enabled_languages.len() <= 1 {
        return LanguageCycleOutcome::SingleLanguageNoop;
    }
    if is_english_only_model(engine, model_name) {
        return LanguageCycleOutcome::EnglishOnlyModelNoop;
    }
    let idx = enabled_languages.iter().position(|c| c == current);
    let next_idx = match idx {
        Some(i) => (i + 1) % enabled_languages.len(),
        None => 0,
    };
    LanguageCycleOutcome::Advanced(enabled_languages[next_idx].clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_active_prompt_id_advances_default_to_prompts() {
        assert_eq!(next_active_prompt_id("builtin:default"), "builtin:prompts");
    }

    #[test]
    fn next_active_prompt_id_wraps_commit_to_default() {
        assert_eq!(next_active_prompt_id("builtin:commit"), "builtin:default");
    }

    #[test]
    fn next_active_prompt_id_full_cycle_returns_to_start() {
        let mut id = String::from("builtin:default");
        for _ in 0..4 {
            id = next_active_prompt_id(&id);
        }
        assert_eq!(id, "builtin:default");
    }

    #[test]
    fn next_active_prompt_id_from_custom_enters_cycle_at_default() {
        // FU-2 Option B: custom prompts are NOT in the cycle. If the user is
        // parked on a custom prompt, pressing the cycle hotkey enters the
        // built-in ring at slot 0.
        assert_eq!(
            next_active_prompt_id("custom:1f9e2c4a-deaf-4f7c-b1f2-9f93de57a90a"),
            "builtin:default"
        );
    }

    #[test]
    fn next_active_prompt_id_from_unknown_enters_cycle_at_default() {
        // Defensive: garbage id falls back to default.
        assert_eq!(next_active_prompt_id(""), "builtin:default");
        assert_eq!(next_active_prompt_id("not-a-real-id"), "builtin:default");
    }

    #[test]
    fn builtin_label_matches_event_payload_strings() {
        assert_eq!(builtin_label("builtin:default"), Some("Default"));
        assert_eq!(builtin_label("builtin:prompts"), Some("Prompts"));
        assert_eq!(builtin_label("builtin:email"), Some("Email"));
        assert_eq!(builtin_label("builtin:commit"), Some("Commit"));
        assert_eq!(builtin_label("custom:abc"), None);
    }

    fn s(values: &[&str]) -> Vec<String> {
        values.iter().map(|v| v.to_string()).collect()
    }

    #[test]
    fn is_english_only_whisper_dot_en_suffix() {
        assert!(is_english_only_model("whisper", "ggml-base.en"));
        assert!(is_english_only_model("whisper", "ggml-tiny.en"));
        assert!(is_english_only_model("whisper", "ggml-base.EN"));
    }

    #[test]
    fn is_english_only_whisper_multilingual_returns_false() {
        assert!(!is_english_only_model("whisper", "ggml-base"));
        assert!(!is_english_only_model("whisper", "ggml-large-v3"));
    }

    #[test]
    fn is_english_only_parakeet_v2_substring() {
        assert!(is_english_only_model("parakeet", "parakeet-tdt-0.6b-v2"));
        assert!(!is_english_only_model("parakeet", "parakeet-tdt-0.6b-v3"));
    }

    #[test]
    fn is_english_only_unknown_engine_returns_false() {
        assert!(!is_english_only_model("soniox", "ggml-base.en"));
        assert!(!is_english_only_model("", ""));
    }

    #[test]
    fn next_language_advances_through_three_codes() {
        let langs = s(&["en", "de", "fr"]);
        assert_eq!(
            next_language(&langs, "en", "whisper", "ggml-base"),
            LanguageCycleOutcome::Advanced("de".to_string())
        );
        assert_eq!(
            next_language(&langs, "de", "whisper", "ggml-base"),
            LanguageCycleOutcome::Advanced("fr".to_string())
        );
        assert_eq!(
            next_language(&langs, "fr", "whisper", "ggml-base"),
            LanguageCycleOutcome::Advanced("en".to_string())
        );
    }

    #[test]
    fn next_language_single_entry_is_noop() {
        let langs = s(&["en"]);
        assert_eq!(
            next_language(&langs, "en", "whisper", "ggml-base"),
            LanguageCycleOutcome::SingleLanguageNoop
        );
    }

    #[test]
    fn next_language_empty_set_is_single_noop() {
        // Defensive: an empty set is data-corrupted, but the helper still
        // refuses to cycle (the validation layer in `save_settings` is what
        // resets to `["en"]`).
        let langs: Vec<String> = vec![];
        assert_eq!(
            next_language(&langs, "en", "whisper", "ggml-base"),
            LanguageCycleOutcome::SingleLanguageNoop
        );
    }

    #[test]
    fn next_language_english_only_model_is_noop() {
        let langs = s(&["en", "de"]);
        assert_eq!(
            next_language(&langs, "en", "whisper", "ggml-base.en"),
            LanguageCycleOutcome::EnglishOnlyModelNoop
        );
    }

    #[test]
    fn next_language_parakeet_v2_is_english_only_noop() {
        let langs = s(&["en", "de"]);
        assert_eq!(
            next_language(&langs, "en", "parakeet", "parakeet-tdt-0.6b-v2"),
            LanguageCycleOutcome::EnglishOnlyModelNoop
        );
    }

    #[test]
    fn next_language_unknown_current_wraps_to_first() {
        // The active language is invariably in the enabled set thanks to
        // `normalize_overlay_and_languages`; this case exercises the
        // defensive fallback branch.
        let langs = s(&["en", "de"]);
        assert_eq!(
            next_language(&langs, "fr", "whisper", "ggml-base"),
            LanguageCycleOutcome::Advanced("en".to_string())
        );
    }
}
