#[cfg(test)]
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
            options: None,
            language: None,
            custom_prompts: None,
        };
        assert!(request.validate().is_err());

        // Whitespace only
        let request = AIEnhancementRequest {
            text: "   \n\t  ".to_string(),
            context: None,
            options: None,
            language: None,
            custom_prompts: None,
        };
        assert!(request.validate().is_err());

        // Valid text
        let request = AIEnhancementRequest {
            text: "Hello, world!".to_string(),
            context: None,
            options: None,
            language: None,
            custom_prompts: None,
        };
        assert!(request.validate().is_ok());

        // Text at max length
        let request = AIEnhancementRequest {
            text: "a".repeat(MAX_TEXT_LENGTH),
            context: None,
            options: None,
            language: None,
            custom_prompts: None,
        };
        assert!(request.validate().is_ok());

        // Text exceeding max length
        let request = AIEnhancementRequest {
            text: "a".repeat(MAX_TEXT_LENGTH + 1),
            context: None,
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
}
