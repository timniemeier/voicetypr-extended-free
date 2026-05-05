//! Unit tests for the pure cycle-action helpers added in spec 002.
//!
//! The dispatch glue in `src-tauri/src/recording/hotkeys.rs` runs an
//! `async_runtime::spawn` task that reads/writes the AI store and emits
//! Tauri events; that path is exercised manually per `quickstart.md` § 2.
//! These tests cover the side-effect-free helpers so the cycle order is
//! locked-in by CI.

use crate::ai::prompts::EnhancementPreset;
use crate::recording::cycle_actions::{
    is_english_only_model, next_language, next_preset, preset_label, LanguageCycleOutcome,
};

#[test]
fn next_preset_default_advances_to_prompts() {
    assert!(matches!(
        next_preset(&EnhancementPreset::Default),
        EnhancementPreset::Prompts
    ));
}

#[test]
fn next_preset_prompts_advances_to_email() {
    assert!(matches!(
        next_preset(&EnhancementPreset::Prompts),
        EnhancementPreset::Email
    ));
}

#[test]
fn next_preset_email_advances_to_commit() {
    assert!(matches!(
        next_preset(&EnhancementPreset::Email),
        EnhancementPreset::Commit
    ));
}

#[test]
fn next_preset_commit_wraps_to_default() {
    assert!(matches!(
        next_preset(&EnhancementPreset::Commit),
        EnhancementPreset::Default
    ));
}

#[test]
fn next_preset_full_round_returns_to_start() {
    let mut preset = EnhancementPreset::Default;
    for _ in 0..4 {
        preset = next_preset(&preset);
    }
    assert!(matches!(preset, EnhancementPreset::Default));
}

#[test]
fn preset_label_strings_match_event_payload_contract() {
    // These are the only values the frontend type is allowed to receive
    // (per `contracts/ipc-commands.md` § "Net new").
    assert_eq!(preset_label(&EnhancementPreset::Default), "Default");
    assert_eq!(preset_label(&EnhancementPreset::Prompts), "Prompts");
    assert_eq!(preset_label(&EnhancementPreset::Email), "Email");
    assert_eq!(preset_label(&EnhancementPreset::Commit), "Commit");
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
fn english_only_predicate_matches_modelssection_rules() {
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
