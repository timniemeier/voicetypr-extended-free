//! One-shot persistent-storage migrations. Run during the Tauri `setup` hook
//! so the new code path always sees the v1+ shape.
//!
//! Each migration is idempotent and safe to run on every startup.

use tauri::AppHandle;

pub mod prompt_library_v1;

/// Run every registered migration in order. Errors are logged but do not abort
/// startup — degrade to shipped defaults instead.
pub fn run_all_migrations(app: &AppHandle) -> Result<(), String> {
    if let Err(e) = prompt_library_v1::migrate(app) {
        log::warn!("prompt_library_v1 migration failed: {}", e);
    } else {
        log::info!("prompt_library_v1: ok");
    }
    Ok(())
}
