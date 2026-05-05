#[cfg(test)]
#[allow(deprecated)]
mod tests {
    use super::super::*;
    use std::collections::HashMap;

    #[test]
    fn test_ai_error_display() {
        let err = AIError::ApiError("Test error".to_string());
        assert_eq!(err.to_string(), "API error: Test error");

        let err = AIError::ValidationError("Invalid input".to_string());
        assert_eq!(err.to_string(), "Validation error: Invalid input");

        let err = AIError::RateLimitExceeded;
        assert_eq!(err.to_string(), "Rate limit exceeded");
    }

    #[test]
    fn test_ai_enhancement_request_validation() {
        // Empty text
        let request = AIEnhancementRequest {
            text: "".to_string(),
            context: None,
            active_prompt: None,
            options: None,
            language: None,
            custom_prompts: None,
        };
        assert!(request.validate().is_err());

        // Whitespace only
        let request = AIEnhancementRequest {
            text: "   \n\t  ".to_string(),
            context: None,
            active_prompt: None,
            options: None,
            language: None,
            custom_prompts: None,
        };
        assert!(request.validate().is_err());

        // Valid text
        let request = AIEnhancementRequest {
            text: "Hello, world!".to_string(),
            context: None,
            active_prompt: None,
            options: None,
            language: None,
            custom_prompts: None,
        };
        assert!(request.validate().is_ok());

        // Text at max length
        let request = AIEnhancementRequest {
            text: "a".repeat(MAX_TEXT_LENGTH),
            context: None,
            active_prompt: None,
            options: None,
            language: None,
            custom_prompts: None,
        };
        assert!(request.validate().is_ok());

        // Text exceeding max length
        let request = AIEnhancementRequest {
            text: "a".repeat(MAX_TEXT_LENGTH + 1),
            context: None,
            active_prompt: None,
            options: None,
            language: None,
            custom_prompts: None,
        };
        assert!(request.validate().is_err());
    }

    #[test]
    fn test_ai_provider_config_serialization() {
        let config = AIProviderConfig {
            provider: "openai".to_string(),
            model: "gpt-5-nano".to_string(),
            api_key: "secret_key".to_string(),
            enabled: true,
            options: HashMap::new(),
        };

        // API key should not be serialized
        let serialized = serde_json::to_string(&config).unwrap();
        assert!(!serialized.contains("secret_key"));
        assert!(serialized.contains("openai"));
        assert!(serialized.contains("gpt-5-nano"));
    }

    #[test]
    fn test_ai_provider_factory_validation() {
        let config = AIProviderConfig {
            provider: "invalid_provider".to_string(),
            model: "test".to_string(),
            api_key: "test".to_string(),
            enabled: true,
            options: HashMap::new(),
        };

        let result = AIProviderFactory::create(&config);
        assert!(result.is_err());

        if let Err(err) = result {
            match err {
                AIError::ProviderNotFound(provider) => {
                    assert_eq!(provider, "invalid_provider");
                }
                _ => panic!("Expected ProviderNotFound error"),
            }
        }
    }

    #[test]
    fn test_ai_provider_factory_creates_anthropic() {
        let config = AIProviderConfig {
            provider: "anthropic".to_string(),
            model: "claude-haiku-4-5".to_string(),
            api_key: "test_key_12345".to_string(),
            enabled: true,
            options: HashMap::new(),
        };

        let result = AIProviderFactory::create(&config);
        assert!(result.is_ok());
        let provider = result.unwrap();
        assert_eq!(provider.name(), "anthropic");
    }

    #[test]
    fn test_ai_provider_factory_rejects_unknown_anthropic_model() {
        let config = AIProviderConfig {
            provider: "anthropic".to_string(),
            model: "claude-opus-4-7".to_string(), // real model, intentionally not in our curated formatting list
            api_key: "test_key_12345".to_string(),
            enabled: true,
            options: HashMap::new(),
        };

        let result = AIProviderFactory::create(&config);
        assert!(result.is_err());
    }

    #[test]
    fn test_enhancement_prompt_generation() {
        use crate::ai::prompts::{build_enhancement_prompt, CustomPrompts, EnhancementOptions};

        // Test with default options (English)
        let options = EnhancementOptions::default();
        let custom = CustomPrompts::default();
        let prompt = build_enhancement_prompt("hello world", None, &options, None, &custom);

        assert!(prompt.contains("hello world"));
        assert!(prompt.contains("post-processor for voice transcripts"));
        assert!(prompt.contains("written English")); // Default language

        // Test with context
        let prompt_with_context = build_enhancement_prompt(
            "hello world",
            Some("Casual conversation"),
            &options,
            None,
            &custom,
        );

        assert!(prompt_with_context.contains("Context: Casual conversation"));

        // Test with Spanish language
        let prompt_spanish =
            build_enhancement_prompt("hola mundo", None, &options, Some("es"), &custom);
        assert!(prompt_spanish.contains("written Spanish"));

        // Test with French language
        let prompt_french =
            build_enhancement_prompt("bonjour monde", None, &options, Some("fr"), &custom);
        assert!(prompt_french.contains("written French"));

        // Test that a custom base override is honored and the {language}
        // substitution still runs on the override.
        let custom_override = CustomPrompts {
            base: Some("CUSTOM BASE {language}".to_string()),
            ..CustomPrompts::default()
        };
        let prompt_override = build_enhancement_prompt(
            "hello world",
            None,
            &options,
            Some("en"),
            &custom_override,
        );
        assert!(prompt_override.contains("CUSTOM BASE English"));
        assert!(!prompt_override.contains("post-processor for voice transcripts"));
    }

    #[test]
    fn test_enhancement_presets() {
        use crate::ai::prompts::{
            build_enhancement_prompt, CustomPrompts, EnhancementOptions, EnhancementPreset,
        };

        let text = "um hello world";
        let custom = CustomPrompts::default();

        // Test Default preset
        let default_options = EnhancementOptions::default();
        let default_prompt =
            build_enhancement_prompt(text, None, &default_options, None, &custom);
        assert!(default_prompt.contains("post-processor for voice transcripts"));

        // Test Prompts preset
        let mut prompts_options = EnhancementOptions::default();
        prompts_options.preset = EnhancementPreset::Prompts;
        let prompts_prompt =
            build_enhancement_prompt(text, None, &prompts_options, None, &custom);
        assert!(prompts_prompt.contains("transform the cleaned text into a concise AI prompt"));

        // Test Email preset
        let mut email_options = EnhancementOptions::default();
        email_options.preset = EnhancementPreset::Email;
        let email_prompt = build_enhancement_prompt(text, None, &email_options, None, &custom);
        assert!(email_prompt.contains("format the cleaned text as an email"));

        // Test Commit preset
        let mut commit_options = EnhancementOptions::default();
        commit_options.preset = EnhancementPreset::Commit;
        let commit_prompt =
            build_enhancement_prompt(text, None, &commit_options, None, &custom);
        assert!(commit_prompt.contains("convert the cleaned text to a Conventional Commit"));

        // Test that a custom Email override replaces the default email transform.
        let email_override = CustomPrompts {
            email: Some("CUSTOM EMAIL TRANSFORM".to_string()),
            ..CustomPrompts::default()
        };
        let custom_email_prompt =
            build_enhancement_prompt(text, None, &email_options, None, &email_override);
        assert!(custom_email_prompt.contains("CUSTOM EMAIL TRANSFORM"));
        assert!(!custom_email_prompt.contains("format the cleaned text as an email"));
    }

    #[test]
    fn test_custom_prompts_fallback() {
        use crate::ai::prompts::{
            build_enhancement_prompt, CustomPrompts, EnhancementOptions, EnhancementPreset,
        };

        let text = "test";

        // None overrides -> defaults
        let none_overrides = CustomPrompts::default();
        let mut options = EnhancementOptions::default();
        options.preset = EnhancementPreset::Email;
        let prompt_none = build_enhancement_prompt(text, None, &options, None, &none_overrides);
        assert!(prompt_none.contains("post-processor for voice transcripts"));
        assert!(prompt_none.contains("format the cleaned text as an email"));

        // Some("") overrides -> defaults (empty string treated as fallback)
        let empty_overrides = CustomPrompts {
            base: Some("".to_string()),
            prompts: Some("".to_string()),
            email: Some("".to_string()),
            commit: Some("".to_string()),
        };
        let prompt_empty =
            build_enhancement_prompt(text, None, &options, None, &empty_overrides);
        assert!(prompt_empty.contains("post-processor for voice transcripts"));
        assert!(prompt_empty.contains("format the cleaned text as an email"));

        // Defaults() helper produces same content as defaults
        let defaults = CustomPrompts::defaults();
        let prompt_explicit_defaults =
            build_enhancement_prompt(text, None, &options, None, &defaults);
        assert!(prompt_explicit_defaults.contains("post-processor for voice transcripts"));
        assert!(prompt_explicit_defaults.contains("format the cleaned text as an email"));
    }

    #[test]
    fn test_validate_custom_prompts_length_cap() {
        use crate::ai::prompts::{validate_custom_prompts, CustomPrompts, MAX_CUSTOM_PROMPT_LEN};

        // All None -> Ok
        let empty = CustomPrompts::default();
        assert!(validate_custom_prompts(&empty).is_ok());

        // At the cap -> Ok
        let at_cap = CustomPrompts {
            base: Some("a".repeat(MAX_CUSTOM_PROMPT_LEN)),
            ..CustomPrompts::default()
        };
        assert!(validate_custom_prompts(&at_cap).is_ok());

        // One byte over -> Err naming the offending field.
        let over_cap = CustomPrompts {
            email: Some("x".repeat(MAX_CUSTOM_PROMPT_LEN + 1)),
            ..CustomPrompts::default()
        };
        let err = validate_custom_prompts(&over_cap).unwrap_err();
        assert!(err.contains("email"), "error should name the field: {}", err);
        assert!(
            err.contains(&MAX_CUSTOM_PROMPT_LEN.to_string()),
            "error should mention the limit: {}",
            err
        );

        // Defaults helper produces strings well under the cap.
        let defaults = CustomPrompts::defaults();
        assert!(validate_custom_prompts(&defaults).is_ok());
    }

    #[test]
    fn test_custom_prompts_serde_roundtrip() {
        use crate::ai::prompts::CustomPrompts;

        // Mixed shape: None, Some(""), Some(non-empty with placeholder), Some(short).
        let original = CustomPrompts {
            base: None,
            prompts: Some("".to_string()),
            email: Some("hello {language}".to_string()),
            commit: Some("x".to_string()),
        };

        let value = serde_json::to_value(&original).expect("serialize");
        let roundtripped: CustomPrompts =
            serde_json::from_value(value).expect("deserialize");

        assert_eq!(roundtripped.base, original.base);
        assert_eq!(roundtripped.prompts, original.prompts);
        assert_eq!(roundtripped.email, original.email);
        assert_eq!(roundtripped.commit, original.commit);

        // An empty JSON object must deserialize into the all-None default — this
        // is the on-disk reality when the store has never been written and is
        // what `#[serde(default)]` on each field guarantees.
        let from_empty: CustomPrompts =
            serde_json::from_str("{}").expect("deserialize empty object");
        let defaults = CustomPrompts::default();
        assert_eq!(from_empty.base, defaults.base);
        assert_eq!(from_empty.prompts, defaults.prompts);
        assert_eq!(from_empty.email, defaults.email);
        assert_eq!(from_empty.commit, defaults.commit);
        assert!(from_empty.base.is_none());
        assert!(from_empty.prompts.is_none());
        assert!(from_empty.email.is_none());
        assert!(from_empty.commit.is_none());
    }

    #[test]
    fn test_self_correction_rules_in_all_presets() {
        use crate::ai::prompts::{
            build_enhancement_prompt, CustomPrompts, EnhancementOptions, EnhancementPreset,
        };

        let test_text = "send it to john... to mary";
        let custom = CustomPrompts::default();

        // Test that ALL presets include self-correction rules
        let presets = vec![
            EnhancementPreset::Default,
            EnhancementPreset::Prompts,
            EnhancementPreset::Email,
            EnhancementPreset::Commit,
        ];

        for preset in presets {
            let mut options = EnhancementOptions::default();
            options.preset = preset.clone();
            let prompt = build_enhancement_prompt(test_text, None, &options, None, &custom);

            // All prompts should include self-correction rules
            assert!(
                prompt.contains("self-corrections"),
                "Preset {:?} should include self-correction rules",
                preset
            );
        }
    }

    #[test]
    fn test_layered_architecture() {
        use crate::ai::prompts::{
            build_enhancement_prompt, CustomPrompts, EnhancementOptions, EnhancementPreset,
        };

        let test_text = "test";
        let custom = CustomPrompts::default();

        // Test that all presets include base processing
        let presets = vec![
            EnhancementPreset::Default,
            EnhancementPreset::Prompts,
            EnhancementPreset::Email,
            EnhancementPreset::Commit,
        ];

        for preset in presets {
            let mut options = EnhancementOptions::default();
            options.preset = preset.clone();
            let prompt = build_enhancement_prompt(test_text, None, &options, None, &custom);

            // All should include self-correction rules
            assert!(
                prompt.contains("self-corrections"),
                "Preset {:?} should include self-correction rules",
                preset
            );

            // All should include base processing
            assert!(
                prompt.contains("post-processor for voice transcripts"),
                "Preset {:?} should include base processing",
                preset
            );

            // Non-default presets should have transformation instruction
            if !matches!(preset, EnhancementPreset::Default) {
                assert!(
                    prompt.contains("Now"),
                    "Preset {:?} should have transformation",
                    preset
                );
            }
        }
    }

    #[test]
    fn test_default_prompt_comprehensive_features() {
        use crate::ai::prompts::{build_enhancement_prompt, CustomPrompts, EnhancementOptions};

        let test_text = "test transcription";
        let options = EnhancementOptions::default();
        let custom = CustomPrompts::default();
        let prompt = build_enhancement_prompt(test_text, None, &options, None, &custom);

        // Test that Default prompt includes all comprehensive features

        // 1. Self-correction handling
        assert!(
            prompt.contains("self-corrections"),
            "Should handle self-corrections"
        );
        assert!(
            prompt.contains("last-intent wins"),
            "Should use last-intent policy"
        );

        // 2. Error correction
        assert!(
            prompt.contains("grammar, punctuation, capitalization"),
            "Should handle grammar and spelling"
        );

        // 3. Number and time formatting
        assert!(
            prompt.contains("numbers/dates/times as spoken"),
            "Should format numbers and dates"
        );

        // 4. Technical terms
        assert!(
            prompt.contains("Normalize obvious names/brands/terms"),
            "Should normalize technical terms"
        );
    }

    #[test]
    fn test_ai_model_serialization() {
        let model = AIModel {
            id: "test-model".to_string(),
            name: "Test Model".to_string(),
            description: Some("A test model".to_string()),
        };

        let json = serde_json::to_string(&model).unwrap();
        assert!(json.contains("test-model"));
        assert!(json.contains("Test Model"));
        assert!(json.contains("A test model"));
    }

    #[test]
    fn test_language_name_mapping() {
        use crate::ai::prompts::get_language_name;

        // Test common languages
        assert_eq!(get_language_name("en"), "English");
        assert_eq!(get_language_name("es"), "Spanish");
        assert_eq!(get_language_name("fr"), "French");
        assert_eq!(get_language_name("de"), "German");
        assert_eq!(get_language_name("ja"), "Japanese");
        assert_eq!(get_language_name("zh"), "Chinese");
        assert_eq!(get_language_name("ar"), "Arabic");
        assert_eq!(get_language_name("hi"), "Hindi");
        assert_eq!(get_language_name("pt"), "Portuguese");
        assert_eq!(get_language_name("ru"), "Russian");

        // Test case insensitivity
        assert_eq!(get_language_name("EN"), "English");
        assert_eq!(get_language_name("Es"), "Spanish");

        // Test fallback for unknown language codes
        assert_eq!(get_language_name("xyz"), "English");
        assert_eq!(get_language_name(""), "English");
    }

    #[test]
    fn test_language_aware_prompts() {
        use crate::ai::prompts::{build_enhancement_prompt, CustomPrompts, EnhancementOptions};

        let options = EnhancementOptions::default();
        let custom = CustomPrompts::default();
        let text = "test text";

        // English (default)
        let prompt_en = build_enhancement_prompt(text, None, &options, Some("en"), &custom);
        assert!(prompt_en.contains("written English"));

        // Spanish
        let prompt_es = build_enhancement_prompt(text, None, &options, Some("es"), &custom);
        assert!(prompt_es.contains("written Spanish"));

        // Japanese
        let prompt_ja = build_enhancement_prompt(text, None, &options, Some("ja"), &custom);
        assert!(prompt_ja.contains("written Japanese"));

        // None defaults to English
        let prompt_none = build_enhancement_prompt(text, None, &options, None, &custom);
        assert!(prompt_none.contains("written English"));
    }

    // ---- New prompt-library coverage (T015 / T016) ----

    #[test]
    fn test_build_enhancement_prompt_for_active_builtin_email() {
        use crate::ai::prompts::{
            build_enhancement_prompt_for_active, BuiltinId, Prompt, PromptKind,
            BUILTIN_PROMPT_DEFAULTS,
        };

        // Built-ins ship with the base post-processor template baked into
        // `prompt_text` (see Issue #8). The resolver no longer prepends the
        // base — `prompt_text` IS the prompt sent to the AI.
        let shipped = BUILTIN_PROMPT_DEFAULTS
            .get(&BuiltinId::Email)
            .unwrap()
            .prompt_text();
        let active = Prompt {
            id: "builtin:email".to_string(),
            kind: PromptKind::Builtin,
            builtin_id: Some(BuiltinId::Email),
            name: "Email".to_string(),
            icon: "Mail".to_string(),
            prompt_text: shipped,
        };
        let out = build_enhancement_prompt_for_active("hi mary", None, &active, Some("en"));
        assert!(out.contains("post-processor for voice transcripts"));
        assert!(out.contains("written English"));
        assert!(out.contains("format the cleaned text as an email"));
        assert!(out.contains("hi mary"));
    }

    #[test]
    fn test_default_builtin_ships_base_template_no_duplication() {
        use crate::ai::prompts::{
            build_enhancement_prompt_for_active, BuiltinId, BUILTIN_PROMPT_DEFAULTS,
        };

        // Issue #8 regression guard: Default's shipped prompt_text must be
        // non-empty (passes FR-013a validation) and resolving the prompt must
        // not duplicate the base post-processor preamble.
        let default = BUILTIN_PROMPT_DEFAULTS.get(&BuiltinId::Default).unwrap();
        let shipped = default.prompt_text();
        assert!(!shipped.trim().is_empty(), "Default must ship non-empty prompt_text");

        let active = default.to_prompt();
        let out = build_enhancement_prompt_for_active("hello world", None, &active, Some("en"));
        // Exactly one occurrence of the base preamble in the resolved prompt.
        let count = out.matches("post-processor for voice transcripts").count();
        assert_eq!(count, 1, "base preamble must appear exactly once, got {}", count);
        assert!(out.contains("written English"));
        assert!(out.contains("hello world"));
    }

    #[test]
    fn test_build_enhancement_prompt_for_active_custom_replaces_base() {
        use crate::ai::prompts::{build_enhancement_prompt_for_active, Prompt, PromptKind};

        let active = Prompt {
            id: "custom:abc".to_string(),
            kind: PromptKind::Custom,
            builtin_id: None,
            name: "Slack reply".to_string(),
            icon: "MessageSquare".to_string(),
            prompt_text: "Rewrite in {language} as a casual Slack reply.".to_string(),
        };
        let out = build_enhancement_prompt_for_active("ack", None, &active, Some("es"));
        // Custom path skips the shared base.
        assert!(!out.contains("post-processor for voice transcripts"));
        assert!(out.contains("Rewrite in Spanish as a casual Slack reply."));
        assert!(out.contains("ack"));
    }

    #[test]
    fn test_prompt_library_serde_roundtrip() {
        use crate::ai::prompts::{BuiltinId, Prompt, PromptKind, PromptLibrary};

        let original = PromptLibrary {
            version: 1,
            active_prompt_id: "custom:abc".to_string(),
            prompts: vec![
                Prompt {
                    id: "builtin:default".to_string(),
                    kind: PromptKind::Builtin,
                    builtin_id: Some(BuiltinId::Default),
                    name: "Default".to_string(),
                    icon: "FileText".to_string(),
                    prompt_text: "".to_string(),
                },
                Prompt {
                    id: "custom:abc".to_string(),
                    kind: PromptKind::Custom,
                    builtin_id: None,
                    name: "X".to_string(),
                    icon: "Sparkles".to_string(),
                    prompt_text: "Y".to_string(),
                },
            ],
        };

        let value = serde_json::to_value(&original).expect("serialize");
        let roundtripped: PromptLibrary =
            serde_json::from_value(value).expect("deserialize");
        assert_eq!(roundtripped, original);
    }

    #[test]
    fn test_validate_prompt_fields_rejection_paths() {
        use crate::ai::prompts::{validate_prompt_fields, MAX_PROMPT_NAME_LEN};

        // Empty name
        assert!(validate_prompt_fields("", "FileText", "ok").is_err());
        assert!(validate_prompt_fields("   ", "FileText", "ok").is_err());

        // Long name
        let long = "x".repeat(MAX_PROMPT_NAME_LEN + 1);
        assert!(validate_prompt_fields(&long, "FileText", "ok").is_err());

        // Invalid icon
        assert!(validate_prompt_fields("ok", "BogusIcon", "ok").is_err());

        // Empty / whitespace prompt_text
        assert!(validate_prompt_fields("ok", "FileText", "").is_err());
        assert!(validate_prompt_fields("ok", "FileText", "  \n\t").is_err());

        // Oversize prompt_text
        let huge = "a".repeat(8193);
        assert!(validate_prompt_fields("ok", "FileText", &huge).is_err());

        // Happy path
        assert!(validate_prompt_fields("Ok name", "FileText", "body").is_ok());
    }
}
