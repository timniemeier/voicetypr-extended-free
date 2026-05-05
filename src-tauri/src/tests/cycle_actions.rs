//! Unit tests for the pure cycle-action helpers added in spec 002.
//!
//! Per FU-2 Option B (resolved 2026-05-05): the cycler operates on
//! `active_prompt_id` strings, not the legacy `EnhancementPreset` enum.
//!
//! The dispatch glue in `src-tauri/src/recording/hotkeys.rs` runs an
//! `async_runtime::spawn` task that reads/writes the prompt library and
//! emits Tauri events; that path is exercised manually per `quickstart.md`
//! § 2. These tests cover the side-effect-free helpers so the cycle order
//! is locked-in by CI.

use crate::recording::cycle_actions::{
    builtin_cycle_ids, builtin_label, is_english_only_model, next_active_prompt_id,
    next_language, LanguageCycleOutcome,
};

#[test]
fn builtin_cycle_ids_match_canonical_order() {
    assert_eq!(
        builtin_cycle_ids(),
        [
            "builtin:default".to_string(),
            "builtin:prompts".to_string(),
            "builtin:email".to_string(),
            "builtin:commit".to_string(),
        ]
    );
}

#[test]
fn next_active_prompt_id_default_advances_to_prompts() {
    assert_eq!(next_active_prompt_id("builtin:default"), "builtin:prompts");
}

#[test]
fn next_active_prompt_id_prompts_advances_to_email() {
    assert_eq!(next_active_prompt_id("builtin:prompts"), "builtin:email");
}

#[test]
fn next_active_prompt_id_email_advances_to_commit() {
    assert_eq!(next_active_prompt_id("builtin:email"), "builtin:commit");
}

#[test]
fn next_active_prompt_id_commit_wraps_to_default() {
    assert_eq!(next_active_prompt_id("builtin:commit"), "builtin:default");
}

#[test]
fn next_active_prompt_id_full_round_returns_to_start() {
    let mut id = String::from("builtin:default");
    for _ in 0..4 {
        id = next_active_prompt_id(&id);
    }
    assert_eq!(id, "builtin:default");
}

#[test]
fn next_active_prompt_id_from_custom_enters_cycle_at_default() {
    // FU-2 Option B: custom prompts are not in the cycle ring. Pressing the
    // cycle hotkey while parked on a custom prompt enters at slot 0.
    assert_eq!(
        next_active_prompt_id("custom:11111111-2222-3333-4444-555555555555"),
        "builtin:default"
    );
}

#[test]
fn next_active_prompt_id_from_unknown_falls_back_to_default() {
    assert_eq!(next_active_prompt_id(""), "builtin:default");
    assert_eq!(next_active_prompt_id("not-an-id"), "builtin:default");
}

#[test]
fn builtin_label_strings_match_event_payload_contract() {
    // These labels are the values the frontend overlay renders.
    assert_eq!(builtin_label("builtin:default"), Some("Default"));
    assert_eq!(builtin_label("builtin:prompts"), Some("Prompts"));
    assert_eq!(builtin_label("builtin:email"), Some("Email"));
    assert_eq!(builtin_label("builtin:commit"), Some("Commit"));
    assert_eq!(builtin_label("custom:abc"), None);
}

// ----- T023: cycle-language pure logic ---------------------------------------

fn s(values: &[&str]) -> Vec<String> {
    values.iter().map(|v| v.to_string()).collect()
}

#[test]
fn cycle_language_advances_three_entry_set_with_wrap() {
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
fn cycle_language_single_entry_emits_single_language_noop() {
    let langs = s(&["en"]);
    assert_eq!(
        next_language(&langs, "en", "whisper", "ggml-base"),
        LanguageCycleOutcome::SingleLanguageNoop
    );
}

#[test]
fn cycle_language_english_only_whisper_emits_english_only_noop() {
    // SC-005: with an English-only whisper model and a multi-language
    // enabled set, the cycle MUST be a no-op AND the active language must
    // not be mutated (the noop branch returns before any write).
    let langs = s(&["en", "de"]);
    let outcome = next_language(&langs, "en", "whisper", "ggml-base.en");
    assert_eq!(outcome, LanguageCycleOutcome::EnglishOnlyModelNoop);
}

#[test]
fn cycle_language_parakeet_v2_is_english_only() {
    let langs = s(&["en", "de"]);
    assert_eq!(
        next_language(&langs, "en", "parakeet", "parakeet-tdt-0.6b-v2"),
        LanguageCycleOutcome::EnglishOnlyModelNoop
    );
}

#[test]
fn english_only_predicate_matches_sttmodelssection_rules() {
    // Whisper *.en (case-insensitive)
    assert!(is_english_only_model("whisper", "ggml-base.en"));
    assert!(is_english_only_model("whisper", "ggml-large-v3.EN"));
    assert!(!is_english_only_model("whisper", "ggml-large-v3"));

    // Parakeet -v2 substring
    assert!(is_english_only_model("parakeet", "parakeet-tdt-0.6b-v2"));
    assert!(!is_english_only_model("parakeet", "parakeet-tdt-0.6b-v3"));

    // Cloud / unknown engines never gate the cycle.
    assert!(!is_english_only_model("soniox", "soniox-stt-rt-preview"));
    assert!(!is_english_only_model("", ""));
}
