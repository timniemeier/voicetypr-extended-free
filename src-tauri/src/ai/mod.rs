use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub mod anthropic;
pub mod config;
pub mod gemini;
pub mod openai;
pub mod prompts;

pub use config::MAX_TEXT_LENGTH;
#[allow(deprecated)]
pub use prompts::{CustomPrompts, EnhancementOptions};
#[allow(unused_imports)]
pub use prompts::{
    BuiltinId, Prompt, PromptKind, PromptLibrary, BUILTIN_PROMPT_DEFAULTS, BUILTIN_DEFAULT_ID,
};

#[cfg(test)]
mod tests;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProviderConfig {
    pub provider: String,
    pub model: String,
    #[serde(skip_serializing)] // Don't serialize API key
    pub api_key: String,
    pub enabled: bool,
    #[serde(default)]
    pub options: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(deprecated)]
pub struct AIEnhancementRequest {
    pub text: String,
    pub context: Option<String>,
    /// Resolved active prompt (preferred). When `Some`, providers route through
    /// `build_enhancement_prompt_for_active` and ignore `options`/`custom_prompts`.
    #[serde(default)]
    pub active_prompt: Option<Prompt>,
    /// Legacy: pre-prompts-restructure preset selector. Honored only when
    /// `active_prompt` is `None`.
    #[serde(default)]
    pub options: Option<EnhancementOptions>,
    /// ISO 639-1 language code for output language (e.g., "en", "es", "fr")
    #[serde(default)]
    pub language: Option<String>,
    /// Legacy user-supplied prompt overrides. Honored only when `active_prompt`
    /// is `None`.
    #[serde(default)]
    pub custom_prompts: Option<CustomPrompts>,
}

impl AIEnhancementRequest {
    pub fn validate(&self) -> Result<(), AIError> {
        if self.text.trim().is_empty() {
            return Err(AIError::ValidationError("Text cannot be empty".to_string()));
        }

        if self.text.len() > MAX_TEXT_LENGTH {
            return Err(AIError::ValidationError(format!(
                "Text exceeds maximum length of {} characters",
                MAX_TEXT_LENGTH
            )));
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIEnhancementResponse {
    pub enhanced_text: String,
    pub original_text: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AIError {
    #[error("API error: {0}")]
    ApiError(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("Provider not found: {0}")]
    ProviderNotFound(String),

    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Rate limit exceeded")]
    RateLimitExceeded,
}

#[async_trait]
pub trait AIProvider: Send + Sync {
    async fn enhance_text(
        &self,
        request: AIEnhancementRequest,
    ) -> Result<AIEnhancementResponse, AIError>;

    fn name(&self) -> &str;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct AIModel {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

pub struct AIProviderFactory;

impl AIProviderFactory {
    pub fn create(config: &AIProviderConfig) -> Result<Box<dyn AIProvider>, AIError> {
        // Validate provider name
        if !Self::is_valid_provider(&config.provider) {
            return Err(AIError::ProviderNotFound(config.provider.clone()));
        }

        match config.provider.as_str() {
            "gemini" => Ok(Box::new(gemini::GeminiProvider::new(
                config.api_key.clone(),
                config.model.clone(),
                config.options.clone(),
            )?)),
            "openai" => Ok(Box::new(openai::OpenAIProvider::new(
                config.api_key.clone(),
                config.model.clone(),
                config.options.clone(),
            )?)),
            "anthropic" => Ok(Box::new(anthropic::AnthropicProvider::new(
                config.api_key.clone(),
                config.model.clone(),
                config.options.clone(),
            )?)),
            "ollama" => {
                let mut options = config.options.clone();
                options
                    .entry("base_url".to_string())
                    .or_insert_with(|| serde_json::Value::String(
                        "http://localhost:11434/v1".to_string(),
                    ));
                options
                    .entry("no_auth".to_string())
                    .or_insert(serde_json::Value::Bool(true));
                Ok(Box::new(openai::OpenAIProvider::new(
                    config.api_key.clone(),
                    config.model.clone(),
                    options,
                )?))
            }
            provider => Err(AIError::ProviderNotFound(provider.to_string())),
        }
    }

    fn is_valid_provider(provider: &str) -> bool {
        matches!(provider, "gemini" | "openai" | "anthropic" | "ollama")
    }
}
