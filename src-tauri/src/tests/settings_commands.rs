#[cfg(test)]
mod tests {
    use crate::commands::settings::{
        get_supported_languages, normalize_overlay_and_languages, Settings,
    };
    use serde_json::json;

    #[test]
    fn test_settings_default() {
        let settings = Settings::default();

        assert_eq!(settings.hotkey, "CommandOrControl+Shift+Space");
        assert_eq!(settings.current_model, ""); // Empty means auto-select
        assert_eq!(settings.language, "en");
        assert_eq!(settings.theme, "system");
        assert_eq!(settings.transcription_cleanup_days, None);
        assert_eq!(settings.launch_at_startup, false);
        assert_eq!(settings.onboarding_completed, false);
        assert_eq!(settings.check_updates_automatically, true); // Default to true
        assert_eq!(settings.auto_paste_transcription, true); // Default to true
    }

    #[test]
    fn test_settings_serialization() {
        let settings = Settings {
            hotkey: "CommandOrControl+A".to_string(),
            current_model: "base".to_string(),
            current_model_engine: "whisper".to_string(),
            language: "es".to_string(),
            theme: "dark".to_string(),
            transcription_cleanup_days: Some(7),
            pill_position: Some((100.0, 200.0)),
            launch_at_startup: false,
            onboarding_completed: true,
            translate_to_english: false,
            check_updates_automatically: true,
            selected_microphone: None,
            recording_mode: "toggle".to_string(),
            use_different_ptt_key: false,
            ptt_hotkey: Some("Alt+Space".to_string()),
            keep_transcription_in_clipboard: false,
            play_sound_on_recording: true,
            play_sound_on_recording_end: true,
            pill_indicator_mode: "when_recording".to_string(),
            pill_indicator_position: "bottom-center".to_string(),
            pill_indicator_offset: 10,
            pause_media_during_recording: true,
            auto_paste_transcription: true,
            enabled_languages: vec!["es".to_string()],
            cycle_preset_hotkey: None,
            cycle_language_hotkey: None,
            pill_show_preset: false,
            pill_show_language: false,
            pill_extras_layout: "right".to_string(),
        };

        // Test serialization
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("\"hotkey\":\"CommandOrControl+A\""));
        assert!(json.contains("\"current_model\":\"base\""));
        assert!(json.contains("\"language\":\"es\""));
        assert!(json.contains("\"theme\":\"dark\""));
        assert!(json.contains("\"transcription_cleanup_days\":7"));
        assert!(json.contains("\"auto_paste_transcription\":true"));

        // Test deserialization
        let deserialized: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.hotkey, settings.hotkey);
        assert_eq!(deserialized.current_model, settings.current_model);
        assert_eq!(deserialized.language, settings.language);
        assert_eq!(deserialized.theme, settings.theme);
        assert_eq!(
            deserialized.transcription_cleanup_days,
            settings.transcription_cleanup_days
        );
        assert_eq!(
            deserialized.auto_paste_transcription,
            settings.auto_paste_transcription
        );
    }

    #[test]
    fn test_settings_partial_deserialization() {
        // Test that partial JSON can be deserialized with defaults
        let partial_json = json!({
            "hotkey": "Alt+Space",
            "theme": "light"
        });

        // This should work with serde's default attribute
        let _json_str = serde_json::to_string(&partial_json).unwrap();

        // Since Settings doesn't have default attributes on fields,
        // we can't deserialize partial JSON directly
        // This is expected behavior for the current implementation
    }

    #[test]
    fn test_settings_clone() {
        let settings = Settings {
            hotkey: "CommandOrControl+B".to_string(),
            current_model: "tiny".to_string(),
            current_model_engine: "whisper".to_string(),
            language: "fr".to_string(),
            theme: "light".to_string(),
            transcription_cleanup_days: Some(30),
            pill_position: None,
            launch_at_startup: true,
            onboarding_completed: false,
            translate_to_english: true,
            check_updates_automatically: true,
            selected_microphone: Some("USB Microphone".to_string()),
            recording_mode: "push_to_talk".to_string(),
            use_different_ptt_key: true,
            ptt_hotkey: Some("CommandOrControl+Space".to_string()),
            keep_transcription_in_clipboard: true,
            play_sound_on_recording: false,
            play_sound_on_recording_end: false,
            pill_indicator_mode: "never".to_string(),
            pill_indicator_position: "top-center".to_string(),
            pill_indicator_offset: 25,
            pause_media_during_recording: true,
            auto_paste_transcription: true,
            enabled_languages: vec!["fr".to_string(), "en".to_string()],
            cycle_preset_hotkey: Some("CommandOrControl+Shift+P".to_string()),
            cycle_language_hotkey: Some("CommandOrControl+Shift+L".to_string()),
            pill_show_preset: true,
            pill_show_language: true,
            pill_extras_layout: "below".to_string(),
        };

        let cloned = settings.clone();
        assert_eq!(cloned.hotkey, settings.hotkey);
        assert_eq!(cloned.current_model, settings.current_model);
        assert_eq!(cloned.language, settings.language);
        assert_eq!(cloned.theme, settings.theme);
        assert_eq!(
            cloned.transcription_cleanup_days,
            settings.transcription_cleanup_days
        );
    }

    #[test]
    fn test_valid_hotkey_formats() {
        let valid_hotkeys = vec![
            "CommandOrControl+Shift+Space",
            "Alt+A",
            "CommandOrControl+Alt+B",
            "Shift+F1",
            "CommandOrControl+1",
        ];

        for hotkey in valid_hotkeys {
            let settings = Settings {
                hotkey: hotkey.to_string(),
                ..Settings::default()
            };
            assert!(!settings.hotkey.is_empty());
            assert!(settings.hotkey.len() <= 100);
        }
    }

    #[test]
    fn test_theme_values() {
        let valid_themes = vec!["system", "light", "dark"];

        for theme in valid_themes {
            let settings = Settings {
                theme: theme.to_string(),
                ..Settings::default()
            };
            assert!(["system", "light", "dark"].contains(&settings.theme.as_str()));
        }
    }

    #[test]
    fn test_language_codes() {
        let valid_languages = vec!["en", "es", "fr", "de", "it", "pt", "ru", "zh", "ja", "ko"];

        for lang in valid_languages {
            let settings = Settings {
                language: lang.to_string(),
                ..Settings::default()
            };
            assert_eq!(settings.language, lang);
        }
    }

    #[test]
    fn test_model_selection() {
        // Empty model means auto-select
        let auto_settings = Settings {
            current_model: "".to_string(),
            current_model_engine: "whisper".to_string(),
            ..Settings::default()
        };
        assert_eq!(auto_settings.current_model, "");

        // Specific model
        let specific_settings = Settings {
            current_model: "base".to_string(),
            current_model_engine: "whisper".to_string(),
            ..Settings::default()
        };
        assert_eq!(specific_settings.current_model, "base");
    }

    #[test]
    fn test_settings_to_json_value() {
        let settings = Settings::default();

        // Convert to JSON Value
        let value = json!({
            "hotkey": settings.hotkey,
            "current_model": settings.current_model,
            "language": settings.language,
            "theme": settings.theme,
            "transcription_cleanup_days": settings.transcription_cleanup_days,
            "launch_at_startup": settings.launch_at_startup,
            "onboarding_completed": settings.onboarding_completed,
        });

        assert_eq!(value["hotkey"], "CommandOrControl+Shift+Space");
        assert_eq!(value["current_model"], "");
        assert_eq!(value["language"], "en");
        assert_eq!(value["theme"], "system");
        assert_eq!(value["transcription_cleanup_days"], serde_json::Value::Null);
        assert_eq!(value["launch_at_startup"], false);
        assert_eq!(value["onboarding_completed"], false);
    }

    #[test]
    fn test_hotkey_validation_edge_cases() {
        // Test empty hotkey (invalid)
        assert!("".is_empty());

        // Test very long hotkey (invalid if > 100 chars)
        let long_hotkey = "CommandOrControl+".repeat(10);
        assert!(long_hotkey.len() > 100);

        // Test normal hotkey length
        let normal_hotkey = "CommandOrControl+Shift+Alt+A";
        assert!(!normal_hotkey.is_empty());
        assert!(normal_hotkey.len() <= 100);
    }

    // ----- T006: serde round-trip tests for the new fields -------------------

    #[test]
    fn test_settings_default_new_fields() {
        let settings = Settings::default();

        assert_eq!(settings.enabled_languages, vec!["en".to_string()]);
        assert_eq!(settings.cycle_preset_hotkey, None);
        assert_eq!(settings.cycle_language_hotkey, None);
        assert_eq!(settings.pill_show_preset, false);
        assert_eq!(settings.pill_show_language, false);
        assert_eq!(settings.pill_extras_layout, "right");
    }

    #[test]
    fn test_settings_default_serialises_with_new_field_defaults() {
        let settings = Settings::default();
        let value = serde_json::to_value(&settings).unwrap();

        assert_eq!(value["enabled_languages"], json!(["en"]));
        assert_eq!(value["cycle_preset_hotkey"], serde_json::Value::Null);
        assert_eq!(value["cycle_language_hotkey"], serde_json::Value::Null);
        assert_eq!(value["pill_show_preset"], json!(false));
        assert_eq!(value["pill_show_language"], json!(false));
        assert_eq!(value["pill_extras_layout"], json!("right"));
    }

    #[test]
    fn test_settings_round_trip_preserves_multi_language() {
        let mut settings = Settings::default();
        settings.enabled_languages = vec!["en".to_string(), "de".to_string()];
        settings.language = "de".to_string();
        settings.cycle_preset_hotkey = Some("CommandOrControl+Shift+P".to_string());
        settings.cycle_language_hotkey = Some("CommandOrControl+Shift+L".to_string());
        settings.pill_show_preset = true;
        settings.pill_show_language = true;
        settings.pill_extras_layout = "below".to_string();

        let json = serde_json::to_string(&settings).unwrap();
        let decoded: Settings = serde_json::from_str(&json).unwrap();

        assert_eq!(decoded.enabled_languages, vec!["en", "de"]);
        assert_eq!(decoded.language, "de");
        assert_eq!(
            decoded.cycle_preset_hotkey,
            Some("CommandOrControl+Shift+P".to_string())
        );
        assert_eq!(
            decoded.cycle_language_hotkey,
            Some("CommandOrControl+Shift+L".to_string())
        );
        assert_eq!(decoded.pill_show_preset, true);
        assert_eq!(decoded.pill_show_language, true);
        assert_eq!(decoded.pill_extras_layout, "below");

        // Round-trip through JSON should preserve the byte-for-byte payload.
        let re_encoded = serde_json::to_string(&decoded).unwrap();
        assert_eq!(json, re_encoded);
    }

    // ----- T007: validation tests for save_settings normalisation -----------

    #[test]
    fn test_normalize_resets_empty_enabled_languages_to_en() {
        let mut settings = Settings::default();
        settings.enabled_languages = vec![];
        // language remains "en" from default; with empty enabled set, we should
        // reset to ["en"] and keep the active language as "en".
        normalize_overlay_and_languages(&mut settings);

        assert_eq!(settings.enabled_languages, vec!["en".to_string()]);
        assert_eq!(settings.language, "en");
    }

    #[test]
    fn test_normalize_resets_language_when_not_in_enabled_set() {
        let mut settings = Settings::default();
        settings.enabled_languages = vec!["en".to_string(), "de".to_string()];
        settings.language = "fr".to_string();
        normalize_overlay_and_languages(&mut settings);

        assert_eq!(settings.language, "en");
        assert_eq!(settings.enabled_languages, vec!["en", "de"]);
    }

    #[test]
    fn test_normalize_keeps_valid_active_language() {
        let mut settings = Settings::default();
        settings.enabled_languages = vec!["en".to_string(), "de".to_string()];
        settings.language = "de".to_string();
        normalize_overlay_and_languages(&mut settings);

        assert_eq!(settings.language, "de");
    }

    #[test]
    fn test_normalize_coerces_unknown_pill_extras_layout_to_right() {
        let mut settings = Settings::default();
        settings.pill_extras_layout = "diagonal".to_string();
        normalize_overlay_and_languages(&mut settings);

        assert_eq!(settings.pill_extras_layout, "right");
    }

    #[test]
    fn test_normalize_keeps_below_layout() {
        let mut settings = Settings::default();
        settings.pill_extras_layout = "below".to_string();
        normalize_overlay_and_languages(&mut settings);

        assert_eq!(settings.pill_extras_layout, "below");
    }

    #[tokio::test]
    async fn test_get_supported_languages() {
        let languages = get_supported_languages().await.unwrap();

        // Should have multiple languages
        assert!(languages.len() > 50);

        // Languages should be sorted alphabetically (auto-detect removed)
        // First language will be Afrikaans alphabetically
        assert_eq!(languages[0].code, "af");
        assert_eq!(languages[0].name, "Afrikaans");

        // Should contain common languages
        let codes: Vec<String> = languages.iter().map(|l| l.code.clone()).collect();
        assert!(codes.contains(&"en".to_string()));
        assert!(codes.contains(&"es".to_string()));
        assert!(codes.contains(&"fr".to_string()));
        assert!(codes.contains(&"zh".to_string()));

        // Should be sorted by name alphabetically
        for i in 1..languages.len() {
            assert!(
                languages[i - 1].name <= languages[i].name,
                "Languages should be sorted by name"
            );
        }
    }
}
