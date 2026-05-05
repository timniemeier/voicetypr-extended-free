use crate::commands::audio::{
    start_recording, stop_recording, RecorderState, PTT_START_ABORTED_AFTER_RELEASE,
};
use crate::recording::cycle_actions::{
    next_language, next_preset, preset_label, LanguageCycleOutcome,
};
use crate::recording::escape_handler::handle_escape_key_press;
use crate::{get_recording_state, update_recording_state, AppState, RecordingMode, RecordingState};
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

/// Handle global shortcut events for recording
///
/// This is the main entry point for all global shortcut handling.
/// It determines the recording mode and dispatches to the appropriate handler.
pub fn handle_global_shortcut(
    app: &tauri::AppHandle,
    shortcut: &Shortcut,
    event_state: ShortcutState,
) {
    log::debug!(
        "Global shortcut triggered: {:?} - State: {:?}",
        shortcut,
        event_state
    );

    let Some(app_state) = app.try_state::<AppState>() else {
        log::warn!("Global shortcut triggered before AppState initialized");
        return;
    };

    let recording_mode = {
        if let Ok(mode_guard) = app_state.recording_mode.lock() {
            *mode_guard
        } else {
            RecordingMode::Toggle
        }
    };

    let is_recording_shortcut = {
        if let Ok(shortcut_guard) = app_state.recording_shortcut.lock() {
            if let Some(ref recording_shortcut) = *shortcut_guard {
                shortcut == recording_shortcut
            } else {
                false
            }
        } else {
            false
        }
    };

    let is_ptt_shortcut = {
        if let Ok(ptt_guard) = app_state.ptt_shortcut.lock() {
            if let Some(ref ptt_shortcut) = *ptt_guard {
                shortcut == ptt_shortcut
            } else {
                false
            }
        } else {
            false
        }
    };

    let is_cycle_preset_shortcut = {
        if let Ok(guard) = app_state.cycle_preset_shortcut.lock() {
            if let Some(ref cycle_shortcut) = *guard {
                shortcut == cycle_shortcut
            } else {
                false
            }
        } else {
            false
        }
    };

    let is_cycle_language_shortcut = {
        if let Ok(guard) = app_state.cycle_language_shortcut.lock() {
            if let Some(ref cycle_shortcut) = *guard {
                shortcut == cycle_shortcut
            } else {
                false
            }
        } else {
            false
        }
    };

    let should_handle = match recording_mode {
        RecordingMode::Toggle => is_recording_shortcut && event_state == ShortcutState::Pressed,
        RecordingMode::PushToTalk => is_recording_shortcut || is_ptt_shortcut,
    };

    if should_handle {
        let current_state = get_recording_state(app);
        handle_recording_shortcut(app, &app_state, recording_mode, current_state, event_state);
    } else if is_cycle_preset_shortcut {
        // Cycle the active formatting preset on key press only (ignore release).
        if event_state == ShortcutState::Pressed {
            handle_cycle_preset_shortcut(app);
        }
    } else if is_cycle_language_shortcut {
        // Cycle the active spoken language on key press only.
        if event_state == ShortcutState::Pressed {
            handle_cycle_language_shortcut(app);
        }
    } else if !is_recording_shortcut && !is_ptt_shortcut {
        handle_non_recording_shortcut(app, shortcut, event_state);
    }
}

/// Cycle the active formatting preset forward one step and emit
/// `active-preset-changed { preset }` so the overlay (and the Enhancements UI)
/// can stay in sync. Reuses the existing `get_enhancement_options` /
/// `update_enhancement_options` code path so there is one source of truth.
fn handle_cycle_preset_shortcut(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let current = match crate::commands::ai::get_enhancement_options(app_handle.clone()).await {
            Ok(options) => options,
            Err(e) => {
                log::warn!("cycle-preset: failed to read enhancement options: {}", e);
                return;
            }
        };

        let next = crate::ai::prompts::EnhancementOptions {
            preset: next_preset(&current.preset),
        };
        let label = preset_label(&next.preset).to_string();

        if let Err(e) =
            crate::commands::ai::update_enhancement_options(next, app_handle.clone()).await
        {
            log::warn!("cycle-preset: failed to persist next preset: {}", e);
            return;
        }

        if let Err(e) = app_handle.emit(
            "active-preset-changed",
            serde_json::json!({ "preset": label }),
        ) {
            log::warn!("cycle-preset: failed to emit active-preset-changed: {}", e);
        } else {
            log::info!("cycle-preset: advanced to {}", label);
        }
    });
}

/// Cycle the active spoken language forward one step (per spec 002 — US2).
///
/// Reads the persisted `Settings` (active language, enabled set, model),
/// applies the gate logic from [`next_language`], and:
///   * On `SingleLanguageNoop` / `EnglishOnlyModelNoop`: emits
///     `cycle-language-noop { reason: ... }` and stops. `Settings.language`
///     is NOT mutated (per FR-011 + SC-005).
///   * On `Advanced(next)`: persists `Settings.language = next` via the
///     existing `save_settings` flow and emits `active-language-changed
///     { language: next }`.
fn handle_cycle_language_shortcut(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let settings = match crate::commands::settings::get_settings(app_handle.clone()).await {
            Ok(s) => s,
            Err(e) => {
                log::warn!("cycle-language: failed to read settings: {}", e);
                return;
            }
        };

        let outcome = next_language(
            &settings.enabled_languages,
            &settings.language,
            &settings.current_model_engine,
            &settings.current_model,
        );

        match outcome {
            LanguageCycleOutcome::SingleLanguageNoop => {
                if let Err(e) = app_handle.emit(
                    "cycle-language-noop",
                    serde_json::json!({ "reason": "single_language" }),
                ) {
                    log::warn!(
                        "cycle-language: failed to emit single-language noop: {}",
                        e
                    );
                } else {
                    log::info!("cycle-language: noop (single_language)");
                }
            }
            LanguageCycleOutcome::EnglishOnlyModelNoop => {
                if let Err(e) = app_handle.emit(
                    "cycle-language-noop",
                    serde_json::json!({ "reason": "english_only_model" }),
                ) {
                    log::warn!(
                        "cycle-language: failed to emit english-only noop: {}",
                        e
                    );
                } else {
                    log::info!("cycle-language: noop (english_only_model)");
                }
            }
            LanguageCycleOutcome::Advanced(next) => {
                let mut updated = settings;
                updated.language = next.clone();

                if let Err(e) =
                    crate::commands::settings::save_settings(app_handle.clone(), updated).await
                {
                    log::warn!("cycle-language: failed to persist next language: {}", e);
                    return;
                }

                if let Err(e) = app_handle.emit(
                    "active-language-changed",
                    serde_json::json!({ "language": next }),
                ) {
                    log::warn!(
                        "cycle-language: failed to emit active-language-changed: {}",
                        e
                    );
                } else {
                    log::info!("cycle-language: advanced to {}", next);
                }
            }
        }
    });
}

/// Handle recording-related shortcuts (toggle or PTT)
fn handle_recording_shortcut(
    app: &tauri::AppHandle,
    app_state: &AppState,
    recording_mode: RecordingMode,
    current_state: RecordingState,
    event_state: ShortcutState,
) {
    match recording_mode {
        RecordingMode::Toggle => {
            handle_toggle_mode(app, app_state, current_state, event_state);
        }
        RecordingMode::PushToTalk => {
            handle_ptt_mode(app, app_state, current_state, event_state);
        }
    }
}

/// Handle toggle mode recording (click to start/stop)
fn handle_toggle_mode(
    app: &tauri::AppHandle,
    app_state: &AppState,
    current_state: RecordingState,
    event_state: ShortcutState,
) {
    if event_state != ShortcutState::Pressed {
        return;
    }

    let should_throttle = {
        let now = std::time::Instant::now();
        match app_state.last_toggle_press.lock() {
            Ok(mut last_press) => {
                if let Some(last) = *last_press {
                    if now.duration_since(last).as_millis() < 300 {
                        log::debug!("Toggle: Throttling hotkey press (too fast)");
                        true
                    } else {
                        *last_press = Some(now);
                        false
                    }
                } else {
                    *last_press = Some(now);
                    false
                }
            }
            Err(e) => {
                log::error!("Failed to lock last_toggle_press: {}", e);
                false
            }
        }
    };

    if should_throttle {
        crate::commands::audio::pill_toast(app, "Hold on...", 1000);
        return;
    }

    match current_state {
        RecordingState::Idle | RecordingState::Error => {
            log::info!("Toggle: Starting recording via hotkey");
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let recorder_state = app_handle.state::<RecorderState>();
                match start_recording(app_handle.clone(), recorder_state).await {
                    Ok(_) => log::info!("Toggle: Recording started successfully"),
                    Err(e) => {
                        log::error!("Toggle: Error starting recording: {}", e);
                        update_recording_state(&app_handle, RecordingState::Error, Some(e));
                    }
                }
            });
        }
        RecordingState::Starting => {
            log::info!("Toggle: stop requested while starting; will stop after start completes");
            app_state
                .pending_stop_after_start
                .store(true, Ordering::SeqCst);
        }
        RecordingState::Recording => {
            log::info!("Toggle: Stopping recording via hotkey");
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let recorder_state = app_handle.state::<RecorderState>();
                match stop_recording(app_handle.clone(), recorder_state).await {
                    Ok(_) => log::info!("Toggle: Recording stopped successfully"),
                    Err(e) => log::error!("Toggle: Error stopping recording: {}", e),
                }
            });
        }
        _ => log::debug!("Toggle: Ignoring hotkey in state {:?}", current_state),
    }
}

/// Handle push-to-talk mode recording (hold to record, release to stop)
fn handle_ptt_mode(
    app: &tauri::AppHandle,
    app_state: &AppState,
    current_state: RecordingState,
    event_state: ShortcutState,
) {
    match event_state {
        ShortcutState::Pressed => {
            log::info!("PTT: Key pressed");
            app_state.ptt_key_held.store(true, Ordering::Relaxed);

            if matches!(current_state, RecordingState::Idle | RecordingState::Error) {
                log::info!("PTT: Starting recording");
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let recorder_state = app_handle.state::<RecorderState>();
                    match start_recording(app_handle.clone(), recorder_state).await {
                        Ok(_) => log::info!("PTT: Recording started successfully"),
                        Err(e) if e == PTT_START_ABORTED_AFTER_RELEASE => {
                            log::info!("PTT: Recording start cancelled after key release");
                            update_recording_state(&app_handle, RecordingState::Idle, None);
                        }
                        Err(e) => {
                            log::error!("PTT: Error starting recording: {}", e);
                            update_recording_state(&app_handle, RecordingState::Error, Some(e));
                        }
                    }
                });
            }
        }
        ShortcutState::Released => {
            log::info!("PTT: Key released");

            // Debounce: swap returns previous value, skip if already false (duplicate release)
            // This prevents race conditions when multiple release events fire rapidly
            if !app_state.ptt_key_held.swap(false, Ordering::SeqCst) {
                log::debug!("PTT: Ignoring duplicate key release");
                return;
            }

            match current_state {
                RecordingState::Recording => {
                    log::info!("PTT: Stopping recording");
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let recorder_state = app_handle.state::<RecorderState>();
                        match stop_recording(app_handle.clone(), recorder_state).await {
                            Ok(_) => log::info!("PTT: Recording stopped successfully"),
                            Err(e) => log::error!("PTT: Error stopping recording: {}", e),
                        }
                    });
                }
                RecordingState::Starting => {
                    // Key released while recording is still starting up.
                    // Set the pending flag so start_recording() can honor the stop
                    // as soon as it reaches the Recording state. This prevents
                    // recording from continuing after the user released PTT.
                    log::info!(
                        "PTT: Key released while Starting; setting pending_stop_after_start"
                    );
                    app_state
                        .pending_stop_after_start
                        .store(true, Ordering::SeqCst);
                }
                _ => {
                    log::debug!("PTT: Key released in state {:?}; no action", current_state);
                }
            }
        }
    }
}

/// Handle non-recording shortcuts (e.g., ESC key)
fn handle_non_recording_shortcut(
    app: &tauri::AppHandle,
    shortcut: &Shortcut,
    event_state: ShortcutState,
) {
    log::debug!("Non-recording shortcut triggered: {:?}", shortcut);

    let escape_shortcut: Shortcut = match "Escape".parse() {
        Ok(s) => s,
        Err(e) => {
            log::error!("Failed to parse Escape shortcut: {:?}", e);
            return;
        }
    };

    log::debug!(
        "Comparing shortcuts - received: {:?}, escape: {:?}",
        shortcut,
        escape_shortcut
    );

    if shortcut == &escape_shortcut {
        log::info!("ESC key detected in global handler");

        let app_handle = app.clone();

        tauri::async_runtime::spawn(async move {
            let app_state = app_handle.state::<AppState>();
            handle_escape_key_press(&app_state, &app_handle, event_state).await;
        });
    }
}
