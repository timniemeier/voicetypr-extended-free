use serde::{Deserialize, Serialize};

/// Allowed icon names for prompt entries. Mirrors `src/lib/prompts/icon-allowlist.ts`.
pub const ALLOWED_ICONS: &[&str] = &[
    "FileText",
    "Sparkles",
    "Mail",
    "GitCommit",
    "Pencil",
    "BookOpen",
    "List",
    "MessageSquare",
    "Briefcase",
    "Hash",
    "Scissors",
    "Type",
    "StickyNote",
    "Terminal",
    "Star",
    "Zap",
];

/// Maximum length, in chars, of a prompt's display name.
pub const MAX_PROMPT_NAME_LEN: usize = 64;

/// Schema version for the persisted PromptLibrary blob.
pub const PROMPT_LIBRARY_VERSION: u32 = 1;

/// Stable id of the Default built-in. Used as the fallback active prompt id.
pub const BUILTIN_DEFAULT_ID: &str = "builtin:default";

/// Discriminator for a prompt entry: shipped built-in (with overrides) or user-created.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PromptKind {
    Builtin,
    Custom,
}

/// Stable enum tag for built-in prompts. Used by `build_enhancement_prompt` to
/// route language-aware base assembly. Persisted on the wire as snake_case.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BuiltinId {
    Default,
    Prompts,
    Email,
    Commit,
}

impl BuiltinId {
    pub fn as_str(&self) -> &'static str {
        match self {
            BuiltinId::Default => "default",
            BuiltinId::Prompts => "prompts",
            BuiltinId::Email => "email",
            BuiltinId::Commit => "commit",
        }
    }

    /// Stable persistent id, e.g. `"builtin:email"`.
    pub fn prompt_id(&self) -> String {
        format!("builtin:{}", self.as_str())
    }

    pub fn from_str(s: &str) -> Option<BuiltinId> {
        match s {
            "default" => Some(BuiltinId::Default),
            "prompts" => Some(BuiltinId::Prompts),
            "email" => Some(BuiltinId::Email),
            "commit" => Some(BuiltinId::Commit),
            _ => None,
        }
    }

    /// Canonical order for sidebar rendering and migration.
    pub fn canonical_order() -> [BuiltinId; 4] {
        [
            BuiltinId::Default,
            BuiltinId::Prompts,
            BuiltinId::Email,
            BuiltinId::Commit,
        ]
    }
}

/// One entry in the prompt library. Either a built-in (with an immutable
/// `builtin_id`) or a user-authored custom prompt.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Prompt {
    pub id: String,
    pub kind: PromptKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub builtin_id: Option<BuiltinId>,
    pub name: String,
    pub icon: String,
    pub prompt_text: String,
}

/// Persistent prompt library blob.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PromptLibrary {
    pub version: u32,
    pub active_prompt_id: String,
    pub prompts: Vec<Prompt>,
}

impl Default for PromptLibrary {
    fn default() -> Self {
        let prompts: Vec<Prompt> = BuiltinId::canonical_order()
            .iter()
            .map(|id| BUILTIN_PROMPT_DEFAULTS.get(id).expect("default exists").to_prompt())
            .collect();
        Self {
            version: PROMPT_LIBRARY_VERSION,
            active_prompt_id: BUILTIN_DEFAULT_ID.to_string(),
            prompts,
        }
    }
}

/// Validate a `Prompt`'s user-mutable fields. Used by both create and update paths.
pub fn validate_prompt_fields(name: &str, icon: &str, prompt_text: &str) -> Result<(), String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("name must be non-empty".to_string());
    }
    if trimmed_name.chars().count() > MAX_PROMPT_NAME_LEN {
        return Err(format!(
            "name exceeds maximum length of {} characters",
            MAX_PROMPT_NAME_LEN
        ));
    }
    if !ALLOWED_ICONS.contains(&icon) {
        return Err("icon not in allowlist".to_string());
    }
    if prompt_text.trim().is_empty() {
        return Err("prompt_text must be non-empty".to_string());
    }
    if prompt_text.len() > MAX_CUSTOM_PROMPT_LEN {
        return Err(format!(
            "prompt_text exceeds {} bytes",
            MAX_CUSTOM_PROMPT_LEN
        ));
    }
    Ok(())
}

/// Shipped defaults for one built-in. The `prompt_text` is the full transform
/// body (no separate base template); `build_enhancement_prompt` still wraps it
/// in the language-aware base for built-ins.
pub struct BuiltinDefault {
    pub builtin_id: BuiltinId,
    pub name: &'static str,
    pub icon: &'static str,
    pub prompt_text: &'static str,
}

impl BuiltinDefault {
    pub fn to_prompt(&self) -> Prompt {
        Prompt {
            id: self.builtin_id.prompt_id(),
            kind: PromptKind::Builtin,
            builtin_id: Some(self.builtin_id),
            name: self.name.to_string(),
            icon: self.icon.to_string(),
            prompt_text: self.prompt_text.to_string(),
        }
    }
}

/// Lazy lookup of shipped defaults by `BuiltinId`.
pub struct BuiltinDefaults;

impl BuiltinDefaults {
    pub fn get(&self, id: &BuiltinId) -> Option<&'static BuiltinDefault> {
        match id {
            BuiltinId::Default => Some(&DEFAULT_BUILTIN),
            BuiltinId::Prompts => Some(&PROMPTS_BUILTIN),
            BuiltinId::Email => Some(&EMAIL_BUILTIN),
            BuiltinId::Commit => Some(&COMMIT_BUILTIN),
        }
    }
}

pub const BUILTIN_PROMPT_DEFAULTS: BuiltinDefaults = BuiltinDefaults;

/// Default built-in: empty transform; base prompt only.
const DEFAULT_BUILTIN_PROMPT_TEXT: &str = "";

const DEFAULT_BUILTIN: BuiltinDefault = BuiltinDefault {
    builtin_id: BuiltinId::Default,
    name: "Default",
    icon: "FileText",
    prompt_text: DEFAULT_BUILTIN_PROMPT_TEXT,
};

const PROMPTS_BUILTIN: BuiltinDefault = BuiltinDefault {
    builtin_id: BuiltinId::Prompts,
    name: "Prompts",
    icon: "Sparkles",
    prompt_text: PROMPTS_TRANSFORM,
};

const EMAIL_BUILTIN: BuiltinDefault = BuiltinDefault {
    builtin_id: BuiltinId::Email,
    name: "Email",
    icon: "Mail",
    prompt_text: EMAIL_TRANSFORM,
};

const COMMIT_BUILTIN: BuiltinDefault = BuiltinDefault {
    builtin_id: BuiltinId::Commit,
    name: "Commit",
    icon: "GitCommit",
    prompt_text: COMMIT_TRANSFORM,
};

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

/// Legacy entry point: takes the old `EnhancementOptions` + `CustomPrompts` shape.
/// Retained only for the deprecated cmd surface during the one-release transition.
/// New code paths route through `build_enhancement_prompt_for_active`.
#[deprecated(note = "use build_enhancement_prompt_for_active")]
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

    assemble_prompt(&base_prompt, mode_transform, text, context)
}

/// New entry point: takes a fully-resolved active `Prompt`. Built-ins keep the
/// language-aware base + transform structure (via `builtin_id`); custom prompts
/// use `prompt_text` directly with optional `{language}` substitution.
pub fn build_enhancement_prompt_for_active(
    text: &str,
    context: Option<&str>,
    active_prompt: &Prompt,
    language: Option<&str>,
) -> String {
    match active_prompt.kind {
        PromptKind::Builtin => {
            // For built-ins we always wrap the active prompt's text as the
            // mode-specific transform on top of the shared base template.
            // The `prompt_text` is what the user (or shipped default) edited.
            let base_prompt = apply_language(BASE_PROMPT_TEMPLATE, language);
            let transform = active_prompt.prompt_text.as_str();
            assemble_prompt(&base_prompt, transform, text, context)
        }
        PromptKind::Custom => {
            // Custom prompts replace the entire prompt body. Honor the
            // {language} placeholder if the user used it.
            let body = apply_language(active_prompt.prompt_text.as_str(), language);
            let mut prompt = format!("{}\n\nTranscribed text:\n{}", body, text.trim());
            if let Some(ctx) = context {
                prompt.push_str(&format!("\n\nContext: {}", ctx));
            }
            prompt
        }
    }
}

fn assemble_prompt(base: &str, transform: &str, text: &str, context: Option<&str>) -> String {
    let trimmed_transform = transform.trim();
    let mut prompt = if trimmed_transform.is_empty() {
        format!("{}\n\nTranscribed text:\n{}", base, text.trim())
    } else {
        format!(
            "{}\n\n{}\n\nTranscribed text:\n{}",
            base,
            trimmed_transform,
            text.trim()
        )
    };

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
