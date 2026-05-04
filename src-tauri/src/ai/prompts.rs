use serde::{Deserialize, Serialize};

// Base prompt template with {language} placeholder
pub const BASE_PROMPT_TEMPLATE: &str = r#"You are a post-processor for voice transcripts.

Resolve self-corrections and intent changes: delete the retracted part and keep only the final intended phrasing (last-intent wins).
Tie-breakers:
- Prefer the last explicit affirmative directive ("we will", "let's", "I'll").
- For conflicting recipients/places/dates/numbers, keep the last stated value.
- Remove "or/maybe" alternatives that precede a final choice.
- If still uncertain, output the safest minimal intent without adding details.

Rewrite into clear, natural written {language} while preserving meaning and tone.
Remove fillers/false starts; fix grammar, punctuation, capitalization, and spacing.
Normalize obvious names/brands/terms when unambiguous; if uncertain, don't guess—keep generic.
Format numbers/dates/times as spoken. Handle dictation commands only when explicitly said (e.g., "period", "new line").
Output only the polished text."#;

/// Convert ISO 639-1 language code to full language name
pub fn get_language_name(code: &str) -> &'static str {
    match code.to_lowercase().as_str() {
        "en" => "English",
        "es" => "Spanish",
        "fr" => "French",
        "de" => "German",
        "it" => "Italian",
        "pt" => "Portuguese",
        "nl" => "Dutch",
        "pl" => "Polish",
        "ru" => "Russian",
        "ja" => "Japanese",
        "ko" => "Korean",
        "zh" => "Chinese",
        "ar" => "Arabic",
        "hi" => "Hindi",
        "tr" => "Turkish",
        "vi" => "Vietnamese",
        "th" => "Thai",
        "id" => "Indonesian",
        "ms" => "Malay",
        "sv" => "Swedish",
        "da" => "Danish",
        "no" => "Norwegian",
        "fi" => "Finnish",
        "cs" => "Czech",
        "sk" => "Slovak",
        "uk" => "Ukrainian",
        "el" => "Greek",
        "he" => "Hebrew",
        "ro" => "Romanian",
        "hu" => "Hungarian",
        "bg" => "Bulgarian",
        "hr" => "Croatian",
        "sr" => "Serbian",
        "sl" => "Slovenian",
        "lt" => "Lithuanian",
        "lv" => "Latvian",
        "et" => "Estonian",
        "bn" => "Bengali",
        "ta" => "Tamil",
        "te" => "Telugu",
        "mr" => "Marathi",
        "gu" => "Gujarati",
        "kn" => "Kannada",
        "ml" => "Malayalam",
        "pa" => "Punjabi",
        "ur" => "Urdu",
        "fa" => "Persian",
        "sw" => "Swahili",
        "af" => "Afrikaans",
        "ca" => "Catalan",
        "eu" => "Basque",
        "gl" => "Galician",
        "cy" => "Welsh",
        "is" => "Icelandic",
        "mt" => "Maltese",
        "sq" => "Albanian",
        "mk" => "Macedonian",
        "be" => "Belarusian",
        "ka" => "Georgian",
        "hy" => "Armenian",
        "az" => "Azerbaijani",
        "kk" => "Kazakh",
        "uz" => "Uzbek",
        "tl" => "Tagalog",
        "ne" => "Nepali",
        "si" => "Sinhala",
        "km" => "Khmer",
        "lo" => "Lao",
        "my" => "Burmese",
        "mn" => "Mongolian",
        _ => "English", // Default fallback
    }
}

/// Build the base prompt with the specified language, applying `{language}` substitution
/// to whichever template string is provided (override or default).
fn apply_language(template: &str, language: Option<&str>) -> String {
    let lang_name = language.map(get_language_name).unwrap_or("English");
    template.replace("{language}", lang_name)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EnhancementPreset {
    Default,
    Prompts,
    Email,
    Commit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancementOptions {
    pub preset: EnhancementPreset,
}

impl Default for EnhancementOptions {
    fn default() -> Self {
        Self {
            preset: EnhancementPreset::Default,
        }
    }
}

/// Maximum length, in bytes, of any single user-supplied prompt override.
/// Beyond this we reject the update to keep token cost and store size bounded.
pub const MAX_CUSTOM_PROMPT_LEN: usize = 8192;

/// User-supplied prompt overrides. Each field is `None` (or empty string) when the
/// built-in default should be used.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CustomPrompts {
    #[serde(default)]
    pub base: Option<String>,
    #[serde(default)]
    pub prompts: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub commit: Option<String>,
}

impl CustomPrompts {
    /// Return the built-in defaults populated as `Some(...)` for every field.
    /// Useful for the UI to pre-fill textareas without duplicating strings in TS.
    pub fn defaults() -> Self {
        Self {
            base: Some(BASE_PROMPT_TEMPLATE.to_string()),
            prompts: Some(PROMPTS_TRANSFORM.to_string()),
            email: Some(EMAIL_TRANSFORM.to_string()),
            commit: Some(COMMIT_TRANSFORM.to_string()),
        }
    }
}

/// Validate that no override exceeds `MAX_CUSTOM_PROMPT_LEN`. Returns the offending
/// field name in the error so the UI can surface it to the user.
pub fn validate_custom_prompts(prompts: &CustomPrompts) -> Result<(), String> {
    let fields: [(&str, Option<&String>); 4] = [
        ("base", prompts.base.as_ref()),
        ("prompts", prompts.prompts.as_ref()),
        ("email", prompts.email.as_ref()),
        ("commit", prompts.commit.as_ref()),
    ];
    for (name, value) in fields {
        if let Some(s) = value {
            if s.len() > MAX_CUSTOM_PROMPT_LEN {
                return Err(format!(
                    "Prompt '{}' exceeds maximum length of {} characters",
                    name, MAX_CUSTOM_PROMPT_LEN
                ));
            }
        }
    }
    Ok(())
}

/// Resolve a single override: use `Some(non-empty)` when present, else fall back
/// to the built-in default.
fn resolve_override<'a>(override_value: Option<&'a String>, default: &'a str) -> &'a str {
    match override_value {
        Some(s) if !s.is_empty() => s.as_str(),
        _ => default,
    }
}

pub fn build_enhancement_prompt(
    text: &str,
    context: Option<&str>,
    options: &EnhancementOptions,
    language: Option<&str>,
    custom_prompts: &CustomPrompts,
) -> String {
    // Resolve base template (override or default), then apply language substitution.
    let base_template = resolve_override(custom_prompts.base.as_ref(), BASE_PROMPT_TEMPLATE);
    let base_prompt = apply_language(base_template, language);

    // Resolve mode-specific transformation (override or default), if not Default preset.
    let mode_transform: &str = match options.preset {
        EnhancementPreset::Default => "",
        EnhancementPreset::Prompts => {
            resolve_override(custom_prompts.prompts.as_ref(), PROMPTS_TRANSFORM)
        }
        EnhancementPreset::Email => {
            resolve_override(custom_prompts.email.as_ref(), EMAIL_TRANSFORM)
        }
        EnhancementPreset::Commit => {
            resolve_override(custom_prompts.commit.as_ref(), COMMIT_TRANSFORM)
        }
    };

    // Build the complete prompt
    let mut prompt = if mode_transform.is_empty() {
        // Default preset: just base processing
        format!("{}\n\nTranscribed text:\n{}", base_prompt, text.trim())
    } else {
        // Other presets: base + transform
        format!(
            "{}\n\n{}\n\nTranscribed text:\n{}",
            base_prompt,
            mode_transform,
            text.trim()
        )
    };

    // Add context if provided
    if let Some(ctx) = context {
        prompt.push_str(&format!("\n\nContext: {}", ctx));
    }

    prompt
}

// Minimal transformation layer for Prompts preset
pub const PROMPTS_TRANSFORM: &str = r#"Now transform the cleaned text into a concise AI prompt:
- Classify as Request, Question, or Task.
- Add only essential missing what/how/why.
- Include constraints and success criteria if relevant.
- Specify output format when helpful.
- Preserve all technical details; do not invent any.
Return only the enhanced prompt."#;

// Minimal transformation layer for Email preset
pub const EMAIL_TRANSFORM: &str = r#"Now format the cleaned text as an email:
- Subject: specific and action-oriented.
- Greeting: Hi/Dear/Hello [Name].
- Body: short paragraphs; lead with the key info or ask.
- If it's a request, include action items and deadlines if present.
- Match tone (formal/casual) to the source.
- Closing: appropriate sign-off; use [Your Name].
Return only the formatted email."#;

// Minimal transformation layer for Commit preset
pub const COMMIT_TRANSFORM: &str = r#"Now convert the cleaned text to a Conventional Commit:
Format: type(scope): description
Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci
Rules: present tense, no period, ≤72 chars; add ! for breaking changes.
Return only the commit message."#;
