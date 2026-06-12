mod commands;
mod config_paths;
mod error;
mod events;
mod fs_ops;
mod search;
mod util;
mod vaults;
mod watcher;

use std::sync::Arc;

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
        .manage(Arc::new(vaults::VaultsCache::default()))
        .setup(|app| {
            use tauri::Manager;
            // dirs must exist BEFORE anything persists
            config_paths::ensure_dirs()?;
            vaults::hydrate(&app.app_handle().clone())?;
            app.manage(Arc::new(watcher::WatcherManager::new(
                app.app_handle().clone(),
            )));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // settings
            commands::settings::read_settings,
            commands::settings::write_settings,
            // vaults
            commands::vaults::vault_list,
            commands::vaults::vault_add,
            commands::vaults::vault_create,
            commands::vaults::vault_remove,
            commands::vaults::vault_rename,
            commands::vaults::vault_set_active,
            // filesystem
            commands::filesystem::read_dir,
            commands::filesystem::stat,
            commands::filesystem::read_file_text,
            commands::filesystem::write_file_text,
            commands::filesystem::create_file,
            commands::filesystem::create_dir,
            commands::filesystem::rename_path,
            commands::filesystem::delete_path,
            commands::filesystem::move_path,
            commands::filesystem::reveal_in_finder,
            commands::filesystem::read_file_bytes,
            commands::filesystem::vault_save_asset,
            commands::filesystem::open_with_default_app,
            // workspace
            commands::workspace::save_workspace_state,
            commands::workspace::load_workspace_state,
            // watcher
            commands::watcher::watcher_watch,
            commands::watcher::watcher_unwatch,
            // search
            commands::search::search_in_vault,
            commands::search::list_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
