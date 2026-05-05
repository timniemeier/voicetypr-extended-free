//! One-shot persistent-storage migrations. Run during the Tauri `setup` hook
//! so the new code path always sees the v1+ shape.
//!
//! Each migration is idempotent and safe to run on every startup.

use tauri::AppHandle;

pub mod prompt_library_v1;
pub mod prompt_library_v2_cleanup;

/// Run every registered migration in order. Errors are logged but do not abort
/// startup — degrade to shipped defaults instead.
pub fn run_all_migrations(app: &AppHandle) -> Result<(), String> {
    // v1 must run first: it produces the unified `prompts` library blob that
    // v2's cleanup pre-conditions key off.
    let v1_ok = match prompt_library_v1::migrate(app) {
        Err(e) => {
            log::warn!("prompt_library_v1 migration failed: {}", e);
            false
        }
        Ok(()) => {
            log::info!("prompt_library_v1: ok");
            true
        }
    };

    // v2 only runs if v1 produced (or had previously produced) a sane blob.
    // Even if v1 failed this run, v2's own pre-conditions (version >= 1,
    // built-ins present, active id resolves) double-check the state, so a
    // transient v1 failure can't cause v2 to delete forensic data.
    if v1_ok {
        if let Err(e) = prompt_library_v2_cleanup::migrate(app) {
            log::warn!("prompt_library_v2_cleanup migration failed: {}", e);
        } else {
            log::info!("prompt_library_v2_cleanup: ok");
        }
    } else {
        log::warn!(
            "prompt_library_v2_cleanup skipped: v1 reported an error this run"
        );
    }

    Ok(())
}
