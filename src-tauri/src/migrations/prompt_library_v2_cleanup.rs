//! Migration v2: delete legacy `enhancement_options` and `custom_prompts`
//! store keys after the v1 migration has stabilized. The v1 migration
//! deliberately left them in place as a forensic trail for one release;
//! this migration cleans them up now that the new prompt library is
//! battle-tested.
//!
//! Idempotent + conditional: only runs when:
//! 1. The new `prompts` key exists with `version >= 1`
//! 2. The library has the four canonical built-ins
//! 3. `active_prompt_id` resolves to a prompt in the library
//!
//! On success, bumps `prompts.version` to 2 and removes the legacy keys.

use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::ai::prompts::BuiltinId;

const PROMPTS_KEY: &str = "prompts";
const LEGACY_ENHANCEMENT_OPTIONS: &str = "enhancement_options";
const LEGACY_CUSTOM_PROMPTS: &str = "custom_prompts";

/// Schema version this migration upgrades the library to.
pub const PROMPT_LIBRARY_V2_VERSION: u32 = 2;

/// Outcome of evaluating the in-memory store state. Returned by the pure-data
/// helper so unit tests can assert behaviour without instantiating a Tauri
/// `Store`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CleanupDecision {
    /// Run the cleanup: rewrite `prompts` with `bumped_library` and delete the
    /// two legacy keys.
    Apply { bumped_library: Value },
    /// Already at v2 (or higher) — nothing to do.
    AlreadyApplied,
    /// Pre-conditions not met — leave everything as-is. Held back so a
    /// half-migrated user never ends up with the new shape minus the safety
    /// net of legacy keys.
    Skip { reason: SkipReason },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SkipReason {
    /// `prompts` key missing entirely.
    LibraryMissing,
    /// `prompts.version` is not parseable / is `< 1`.
    LibraryVersionTooLow,
    /// `prompts.prompts` is missing, not an array, or doesn't contain all
    /// four canonical built-ins.
    BuiltinsIncomplete,
    /// `prompts.active_prompt_id` is missing or doesn't resolve to any
    /// prompt in the library.
    ActiveIdUnresolved,
}

/// Run the migration on the `settings` store. Idempotent.
pub fn migrate(app: &AppHandle) -> Result<(), String> {
    let store = app.store("settings").map_err(|e| e.to_string())?;

    let library_value = store.get(PROMPTS_KEY);
    let decision = decide(library_value.as_ref());

    match decision {
        CleanupDecision::AlreadyApplied => {
            log::debug!("prompt_library_v2_cleanup: already at v{}, no-op", PROMPT_LIBRARY_V2_VERSION);
            Ok(())
        }
        CleanupDecision::Skip { reason } => {
            log::info!(
                "prompt_library_v2_cleanup: skipping (reason: {:?}); legacy keys retained",
                reason
            );
            Ok(())
        }
        CleanupDecision::Apply { bumped_library } => {
            store.set(PROMPTS_KEY, bumped_library);
            // `delete` is a no-op when the key doesn't exist, so we don't
            // need to check existence first.
            store.delete(LEGACY_ENHANCEMENT_OPTIONS);
            store.delete(LEGACY_CUSTOM_PROMPTS);
            store
                .save()
                .map_err(|e| format!("failed to persist v2 cleanup: {}", e))?;
            log::info!(
                "prompt_library_v2_cleanup: bumped library to v{}, removed legacy keys",
                PROMPT_LIBRARY_V2_VERSION
            );
            Ok(())
        }
    }
}

/// Pure-data decision helper. Exposed for unit tests.
///
/// Inspects the in-memory `prompts` blob and decides whether to apply the
/// cleanup. Does not touch the legacy keys directly — the caller deletes them
/// unconditionally on `Apply` (idempotent: deleting an absent key is a no-op).
pub fn decide(library_value: Option<&Value>) -> CleanupDecision {
    let library = match library_value {
        Some(v) => v,
        None => {
            return CleanupDecision::Skip {
                reason: SkipReason::LibraryMissing,
            };
        }
    };

    let version = library.get("version").and_then(|v| v.as_u64()).unwrap_or(0);
    if version >= PROMPT_LIBRARY_V2_VERSION as u64 {
        return CleanupDecision::AlreadyApplied;
    }
    if version < 1 {
        return CleanupDecision::Skip {
            reason: SkipReason::LibraryVersionTooLow,
        };
    }

    // Sanity-check shape: four canonical built-ins present.
    let prompts_array = match library.get("prompts").and_then(|v| v.as_array()) {
        Some(a) => a,
        None => {
            return CleanupDecision::Skip {
                reason: SkipReason::BuiltinsIncomplete,
            };
        }
    };
    if !has_all_four_builtins(prompts_array) {
        return CleanupDecision::Skip {
            reason: SkipReason::BuiltinsIncomplete,
        };
    }

    // Sanity-check shape: active_prompt_id resolves to an existing prompt.
    let active_id = library
        .get("active_prompt_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if active_id.is_empty() || !active_id_resolves(prompts_array, active_id) {
        return CleanupDecision::Skip {
            reason: SkipReason::ActiveIdUnresolved,
        };
    }

    // All checks passed — produce the bumped blob.
    let mut bumped = library.clone();
    if let Some(obj) = bumped.as_object_mut() {
        obj.insert(
            "version".to_string(),
            Value::from(PROMPT_LIBRARY_V2_VERSION),
        );
    }
    CleanupDecision::Apply { bumped_library: bumped }
}

fn has_all_four_builtins(prompts_array: &[Value]) -> bool {
    let expected_ids: Vec<String> = BuiltinId::canonical_order()
        .iter()
        .map(|id| id.prompt_id())
        .collect();
    expected_ids.iter().all(|expected| {
        prompts_array
            .iter()
            .any(|p| p.get("id").and_then(|v| v.as_str()) == Some(expected.as_str()))
    })
}

fn active_id_resolves(prompts_array: &[Value], active_id: &str) -> bool {
    prompts_array
        .iter()
        .any(|p| p.get("id").and_then(|v| v.as_str()) == Some(active_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::prompts::BUILTIN_DEFAULT_ID;
    use serde_json::json;

    fn canonical_v1_library() -> Value {
        json!({
            "version": 1,
            "active_prompt_id": BUILTIN_DEFAULT_ID,
            "prompts": [
                { "id": "builtin:default", "kind": "builtin", "builtin_id": "default",
                  "name": "Default", "icon": "FileText", "prompt_text": "..." },
                { "id": "builtin:prompts", "kind": "builtin", "builtin_id": "prompts",
                  "name": "Prompts", "icon": "Sparkles", "prompt_text": "..." },
                { "id": "builtin:email",   "kind": "builtin", "builtin_id": "email",
                  "name": "Email",   "icon": "Mail",     "prompt_text": "..." },
                { "id": "builtin:commit",  "kind": "builtin", "builtin_id": "commit",
                  "name": "Commit",  "icon": "GitCommit","prompt_text": "..." },
            ],
        })
    }

    /// In-memory store harness. Mirrors the relevant subset of the Tauri store
    /// (get/set/delete on JSON values) so we can exercise the full
    /// `decide → apply` flow without spinning up a Tauri runtime.
    #[derive(Debug, Default)]
    struct InMemoryStore {
        keys: std::collections::HashMap<String, Value>,
    }

    impl InMemoryStore {
        fn get(&self, key: &str) -> Option<Value> {
            self.keys.get(key).cloned()
        }
        fn set(&mut self, key: &str, value: Value) {
            self.keys.insert(key.to_string(), value);
        }
        fn delete(&mut self, key: &str) {
            self.keys.remove(key);
        }
        fn has(&self, key: &str) -> bool {
            self.keys.contains_key(key)
        }
    }

    /// Apply the migration against the in-memory store. Mirrors `migrate`'s
    /// real-store behaviour bit-for-bit.
    fn run_migration(store: &mut InMemoryStore) -> CleanupDecision {
        let library = store.get(PROMPTS_KEY);
        let decision = decide(library.as_ref());
        if let CleanupDecision::Apply { ref bumped_library } = decision {
            store.set(PROMPTS_KEY, bumped_library.clone());
            store.delete(LEGACY_ENHANCEMENT_OPTIONS);
            store.delete(LEGACY_CUSTOM_PROMPTS);
        }
        decision
    }

    // (a) Happy path: v1 library + legacy keys → v2 library, legacy gone.
    #[test]
    fn happy_path_v1_with_legacy_keys() {
        let mut store = InMemoryStore::default();
        store.set(PROMPTS_KEY, canonical_v1_library());
        store.set(LEGACY_ENHANCEMENT_OPTIONS, json!({ "preset": "Email" }));
        store.set(
            LEGACY_CUSTOM_PROMPTS,
            json!({ "base": null, "prompts": "X", "email": "Y", "commit": null }),
        );

        let decision = run_migration(&mut store);
        assert!(matches!(decision, CleanupDecision::Apply { .. }));

        // Library is bumped to v2.
        let lib = store.get(PROMPTS_KEY).expect("library present");
        assert_eq!(
            lib.get("version").and_then(|v| v.as_u64()),
            Some(PROMPT_LIBRARY_V2_VERSION as u64)
        );
        // active_prompt_id and prompts array preserved verbatim.
        assert_eq!(
            lib.get("active_prompt_id").and_then(|v| v.as_str()),
            Some(BUILTIN_DEFAULT_ID)
        );
        assert_eq!(lib.get("prompts").and_then(|v| v.as_array()).unwrap().len(), 4);

        // Legacy keys are gone.
        assert!(!store.has(LEGACY_ENHANCEMENT_OPTIONS));
        assert!(!store.has(LEGACY_CUSTOM_PROMPTS));
    }

    // (b) Idempotent: running twice produces the same state, second run is a
    // no-op (AlreadyApplied).
    #[test]
    fn idempotent_running_twice() {
        let mut store = InMemoryStore::default();
        store.set(PROMPTS_KEY, canonical_v1_library());
        store.set(LEGACY_ENHANCEMENT_OPTIONS, json!({ "preset": "Default" }));

        let first = run_migration(&mut store);
        assert!(matches!(first, CleanupDecision::Apply { .. }));
        let snapshot_after_first = store.get(PROMPTS_KEY).unwrap();

        let second = run_migration(&mut store);
        assert!(matches!(second, CleanupDecision::AlreadyApplied));

        // No change between first and second run.
        assert_eq!(store.get(PROMPTS_KEY).unwrap(), snapshot_after_first);
        assert!(!store.has(LEGACY_ENHANCEMENT_OPTIONS));
        assert!(!store.has(LEGACY_CUSTOM_PROMPTS));
    }

    // (c) Bail safe: prompts key missing → don't delete legacy keys.
    #[test]
    fn bails_when_prompts_key_missing() {
        let mut store = InMemoryStore::default();
        store.set(LEGACY_ENHANCEMENT_OPTIONS, json!({ "preset": "Default" }));
        store.set(LEGACY_CUSTOM_PROMPTS, json!({ "prompts": "P" }));

        let decision = run_migration(&mut store);
        assert_eq!(
            decision,
            CleanupDecision::Skip {
                reason: SkipReason::LibraryMissing
            }
        );

        // Legacy keys must NOT be touched — they're our recovery floor.
        assert!(store.has(LEGACY_ENHANCEMENT_OPTIONS));
        assert!(store.has(LEGACY_CUSTOM_PROMPTS));
    }

    // (c) Bail safe: version < 1.
    #[test]
    fn bails_when_version_too_low() {
        let mut store = InMemoryStore::default();
        let mut lib = canonical_v1_library();
        lib.as_object_mut().unwrap().insert("version".to_string(), json!(0));
        store.set(PROMPTS_KEY, lib);
        store.set(LEGACY_ENHANCEMENT_OPTIONS, json!({ "preset": "Default" }));

        let decision = run_migration(&mut store);
        assert_eq!(
            decision,
            CleanupDecision::Skip {
                reason: SkipReason::LibraryVersionTooLow
            }
        );
        assert!(store.has(LEGACY_ENHANCEMENT_OPTIONS));
    }

    // (d) Bail safe: built-ins missing → leave legacy keys.
    #[test]
    fn bails_when_builtins_missing() {
        let mut store = InMemoryStore::default();
        // Library with only 3 of the 4 canonical built-ins.
        let lib = json!({
            "version": 1,
            "active_prompt_id": "builtin:default",
            "prompts": [
                { "id": "builtin:default", "kind": "builtin", "builtin_id": "default",
                  "name": "Default", "icon": "FileText", "prompt_text": "..." },
                { "id": "builtin:prompts", "kind": "builtin", "builtin_id": "prompts",
                  "name": "Prompts", "icon": "Sparkles", "prompt_text": "..." },
                { "id": "builtin:email",   "kind": "builtin", "builtin_id": "email",
                  "name": "Email",   "icon": "Mail",     "prompt_text": "..." },
                // `builtin:commit` is missing
            ],
        });
        store.set(PROMPTS_KEY, lib);
        store.set(LEGACY_CUSTOM_PROMPTS, json!({ "prompts": "P" }));

        let decision = run_migration(&mut store);
        assert_eq!(
            decision,
            CleanupDecision::Skip {
                reason: SkipReason::BuiltinsIncomplete
            }
        );
        assert!(store.has(LEGACY_CUSTOM_PROMPTS));
    }

    // (d) Bail safe: active_prompt_id doesn't resolve.
    #[test]
    fn bails_when_active_id_unresolved() {
        let mut store = InMemoryStore::default();
        let mut lib = canonical_v1_library();
        lib.as_object_mut()
            .unwrap()
            .insert("active_prompt_id".to_string(), json!("builtin:nonexistent"));
        store.set(PROMPTS_KEY, lib);
        store.set(LEGACY_ENHANCEMENT_OPTIONS, json!({ "preset": "Default" }));

        let decision = run_migration(&mut store);
        assert_eq!(
            decision,
            CleanupDecision::Skip {
                reason: SkipReason::ActiveIdUnresolved
            }
        );
        assert!(store.has(LEGACY_ENHANCEMENT_OPTIONS));
    }

    // (e) No-op when legacy keys already absent — fresh installs where v1
    // ran but the legacy keys never existed. Cleanup still bumps version.
    #[test]
    fn no_op_when_legacy_keys_absent() {
        let mut store = InMemoryStore::default();
        store.set(PROMPTS_KEY, canonical_v1_library());
        // No legacy keys set.

        let decision = run_migration(&mut store);
        assert!(matches!(decision, CleanupDecision::Apply { .. }));

        // Library is still bumped to v2.
        let lib = store.get(PROMPTS_KEY).unwrap();
        assert_eq!(
            lib.get("version").and_then(|v| v.as_u64()),
            Some(PROMPT_LIBRARY_V2_VERSION as u64)
        );

        // Legacy keys remain absent (not an error; delete is a no-op).
        assert!(!store.has(LEGACY_ENHANCEMENT_OPTIONS));
        assert!(!store.has(LEGACY_CUSTOM_PROMPTS));
    }

    // Sanity: AlreadyApplied is returned when the library is already at v2.
    #[test]
    fn returns_already_applied_when_at_v2() {
        let mut store = InMemoryStore::default();
        let mut lib = canonical_v1_library();
        lib.as_object_mut()
            .unwrap()
            .insert("version".to_string(), json!(PROMPT_LIBRARY_V2_VERSION));
        store.set(PROMPTS_KEY, lib);

        let decision = run_migration(&mut store);
        assert_eq!(decision, CleanupDecision::AlreadyApplied);
    }
}
