//! Migration v1: legacy `enhancement_options` + `custom_prompts` → unified
//! `prompts` library blob. Idempotent. Leaves legacy keys in place for
//! forensics; new code never reads them after this runs.

use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::ai::prompts::{
    BuiltinId, Prompt, PromptKind, PromptLibrary, BUILTIN_DEFAULT_ID, BUILTIN_PROMPT_DEFAULTS,
    PROMPT_LIBRARY_VERSION,
};

const PROMPTS_KEY: &str = "prompts";
const LEGACY_ENHANCEMENT_OPTIONS: &str = "enhancement_options";
const LEGACY_CUSTOM_PROMPTS: &str = "custom_prompts";

/// Run the migration on the `settings` store. Idempotent.
pub fn migrate(app: &AppHandle) -> Result<(), String> {
    let store = app.store("settings").map_err(|e| e.to_string())?;

    if let Some(existing) = store.get(PROMPTS_KEY) {
        if let Some(version) = existing.get("version").and_then(|v| v.as_u64()) {
            if version >= PROMPT_LIBRARY_VERSION as u64 {
                return Ok(());
            }
        }
    }

    let legacy_options = store.get(LEGACY_ENHANCEMENT_OPTIONS);
    let legacy_custom = store.get(LEGACY_CUSTOM_PROMPTS);

    let library = derive_library_v1(legacy_options.as_ref(), legacy_custom.as_ref());

    let blob = serde_json::to_value(&library)
        .map_err(|e| format!("failed to serialize prompt library: {}", e))?;
    store.set(PROMPTS_KEY, blob);
    store
        .save()
        .map_err(|e| format!("failed to persist prompt library: {}", e))?;

    Ok(())
}

/// Pure-data migration helper. Exposed for unit tests; takes already-parsed JSON
/// to avoid mocking the Tauri store layer.
pub fn derive_library_v1(legacy_options: Option<&Value>, legacy_custom: Option<&Value>) -> PromptLibrary {
    // Resolve active id from preset enum.
    let preset = legacy_options
        .and_then(|v| v.get("preset"))
        .and_then(|v| v.as_str())
        .unwrap_or("Default");
    let active_id = preset_to_id(preset);

    // Map legacy custom_prompts overrides onto built-in prompt_text.
    // `base` is intentionally dropped — see data-model.md.
    let prompts_override = legacy_custom
        .and_then(|v| v.get("prompts"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());
    let email_override = legacy_custom
        .and_then(|v| v.get("email"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());
    let commit_override = legacy_custom
        .and_then(|v| v.get("commit"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());

    let mut prompts: Vec<Prompt> = Vec::with_capacity(4);
    for id in BuiltinId::canonical_order() {
        let default = BUILTIN_PROMPT_DEFAULTS
            .get(&id)
            .expect("default exists for canonical built-in");
        let override_text: Option<&str> = match id {
            BuiltinId::Default => None,
            BuiltinId::Prompts => prompts_override,
            BuiltinId::Email => email_override,
            BuiltinId::Commit => commit_override,
        };
        let prompt_text = override_text
            .map(|s| s.to_string())
            .unwrap_or_else(|| default.prompt_text());
        prompts.push(Prompt {
            id: id.prompt_id(),
            kind: PromptKind::Builtin,
            builtin_id: Some(id),
            name: default.name.to_string(),
            icon: default.icon.to_string(),
            prompt_text,
        });
    }

    PromptLibrary {
        version: PROMPT_LIBRARY_VERSION,
        active_prompt_id: active_id,
        prompts,
    }
}

fn preset_to_id(preset: &str) -> String {
    let lower = preset.to_lowercase();
    match lower.as_str() {
        "default" | "prompts" | "email" | "commit" => format!("builtin:{}", lower),
        _ => BUILTIN_DEFAULT_ID.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn no_legacy_keys_yields_shipped_defaults() {
        let lib = derive_library_v1(None, None);
        assert_eq!(lib.version, PROMPT_LIBRARY_VERSION);
        assert_eq!(lib.active_prompt_id, BUILTIN_DEFAULT_ID);
        assert_eq!(lib.prompts.len(), 4);

        // Canonical order
        let ids: Vec<_> = lib.prompts.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(
            ids,
            vec![
                "builtin:default",
                "builtin:prompts",
                "builtin:email",
                "builtin:commit"
            ]
        );

        // All prompt_text matches shipped default
        for p in &lib.prompts {
            let bid = p.builtin_id.unwrap();
            let default = BUILTIN_PROMPT_DEFAULTS.get(&bid).unwrap();
            assert_eq!(p.prompt_text, default.prompt_text());
            assert_eq!(p.name, default.name);
            assert_eq!(p.icon, default.icon);
            assert_eq!(p.kind, PromptKind::Builtin);
        }
    }

    #[test]
    fn preset_email_maps_to_builtin_email_active() {
        let opts = json!({ "preset": "Email" });
        let lib = derive_library_v1(Some(&opts), None);
        assert_eq!(lib.active_prompt_id, "builtin:email");

        // No overrides → all prompt_text are shipped defaults
        for p in &lib.prompts {
            let bid = p.builtin_id.unwrap();
            let default = BUILTIN_PROMPT_DEFAULTS.get(&bid).unwrap();
            assert_eq!(p.prompt_text, default.prompt_text());
        }
    }

    #[test]
    fn email_override_replaces_email_text() {
        let custom = json!({ "email": "FOO BAR" });
        let lib = derive_library_v1(None, Some(&custom));
        let email = lib
            .prompts
            .iter()
            .find(|p| p.builtin_id == Some(BuiltinId::Email))
            .unwrap();
        assert_eq!(email.prompt_text, "FOO BAR");

        // Others remain shipped defaults
        for p in &lib.prompts {
            let bid = p.builtin_id.unwrap();
            if bid == BuiltinId::Email {
                continue;
            }
            let default = BUILTIN_PROMPT_DEFAULTS.get(&bid).unwrap();
            assert_eq!(p.prompt_text, default.prompt_text());
        }
    }

    #[test]
    fn base_override_is_dropped() {
        let custom = json!({ "base": "DROP ME" });
        let lib = derive_library_v1(None, Some(&custom));
        // Migration must not invent a "base" prompt and must not put the value
        // anywhere in the four built-ins.
        for p in &lib.prompts {
            let bid = p.builtin_id.unwrap();
            let default = BUILTIN_PROMPT_DEFAULTS.get(&bid).unwrap();
            assert_eq!(p.prompt_text, default.prompt_text());
        }
        assert_eq!(lib.prompts.len(), 4);
    }

    #[test]
    fn idempotency_running_twice_yields_identical_blob() {
        let opts = json!({ "preset": "Commit" });
        let custom = json!({ "prompts": "X", "email": "Y" });
        let first = derive_library_v1(Some(&opts), Some(&custom));
        let second = derive_library_v1(Some(&opts), Some(&custom));
        assert_eq!(first, second);
    }

    #[test]
    fn re_derivation_after_blob_deletion_reproduces_state() {
        // Simulate: prompts key wiped, legacy keys still present → next run
        // recreates the library from legacy keys.
        let opts = json!({ "preset": "Prompts" });
        let custom = json!({ "prompts": "PROMPTS-X" });
        let lib = derive_library_v1(Some(&opts), Some(&custom));
        assert_eq!(lib.active_prompt_id, "builtin:prompts");
        let p = lib
            .prompts
            .iter()
            .find(|p| p.builtin_id == Some(BuiltinId::Prompts))
            .unwrap();
        assert_eq!(p.prompt_text, "PROMPTS-X");
    }

    #[test]
    fn empty_string_overrides_treated_as_no_override() {
        let custom = json!({ "email": "", "prompts": "", "commit": "" });
        let lib = derive_library_v1(None, Some(&custom));
        for p in &lib.prompts {
            let bid = p.builtin_id.unwrap();
            let default = BUILTIN_PROMPT_DEFAULTS.get(&bid).unwrap();
            assert_eq!(p.prompt_text, default.prompt_text());
        }
    }

    #[test]
    fn unknown_preset_maps_to_default() {
        let opts = json!({ "preset": "Bogus" });
        let lib = derive_library_v1(Some(&opts), None);
        assert_eq!(lib.active_prompt_id, BUILTIN_DEFAULT_ID);
    }
}
