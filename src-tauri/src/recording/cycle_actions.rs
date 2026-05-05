//! Pure logic for the global-shortcut cycle actions added in spec 002
//! ("Overlay Preset & Language Toggles").
//!
//! These helpers are intentionally side-effect-free so they can be unit-tested
//! without booting Tauri. The dispatch glue lives in
//! [`crate::recording::hotkeys`].

use crate::ai::prompts::EnhancementPreset;

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

/// Advance the active formatting preset one step in the fixed cycle
/// `Default → Prompts → Email → Commit → Default` (per spec 002 § US1 and
/// `data-model.md` § "Active preset cycle").
///
/// Forward-only with wrap-around.
pub fn next_preset(current: &EnhancementPreset) -> EnhancementPreset {
    match current {
        EnhancementPreset::Default => EnhancementPreset::Prompts,
        EnhancementPreset::Prompts => EnhancementPreset::Email,
        EnhancementPreset::Email => EnhancementPreset::Commit,
        EnhancementPreset::Commit => EnhancementPreset::Default,
    }
}

/// String label for the preset, used as the `active-preset-changed` event
/// payload (per `contracts/ipc-commands.md` § "Net new").
pub fn preset_label(preset: &EnhancementPreset) -> &'static str {
    match preset {
        EnhancementPreset::Default => "Default",
        EnhancementPreset::Prompts => "Prompts",
        EnhancementPreset::Email => "Email",
        EnhancementPreset::Commit => "Commit",
    }
}

/// Predicate matching `ModelsSection.tsx::isEnglishOnlyModel`. The Whisper
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
    fn next_preset_advances_default_to_prompts() {
        assert!(matches!(
            next_preset(&EnhancementPreset::Default),
            EnhancementPreset::Prompts
        ));
    }

    #[test]
    fn next_preset_wraps_commit_to_default() {
        assert!(matches!(
            next_preset(&EnhancementPreset::Commit),
            EnhancementPreset::Default
        ));
    }

    #[test]
    fn next_preset_full_cycle_returns_to_start() {
        let mut preset = EnhancementPreset::Default;
        for _ in 0..4 {
            preset = next_preset(&preset);
        }
        assert!(matches!(preset, EnhancementPreset::Default));
    }

    #[test]
    fn preset_label_matches_event_payload_strings() {
        assert_eq!(preset_label(&EnhancementPreset::Default), "Default");
        assert_eq!(preset_label(&EnhancementPreset::Prompts), "Prompts");
        assert_eq!(preset_label(&EnhancementPreset::Email), "Email");
        assert_eq!(preset_label(&EnhancementPreset::Commit), "Commit");
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
