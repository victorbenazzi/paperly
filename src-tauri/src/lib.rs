mod commands;
mod config_paths;
mod error;
mod util;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Single instance only in release builds: in debug, `pnpm tauri dev` must
    // open its own window instead of being routed to the installed app.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .setup(|_app| {
            config_paths::ensure_dirs()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::read_settings,
            commands::settings::write_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
