use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::error::AppResult;
use crate::util::paths;
use crate::vaults::VaultsCache;
use crate::watcher::SharedWatcher;

#[tauri::command]
pub async fn watcher_watch(vault_id: String, path: String, app: AppHandle) -> AppResult<()> {
    let cache = app.state::<Arc<VaultsCache>>();
    paths::ensure_existing_within_roots(&path, &cache.roots())?;
    let manager = app.state::<SharedWatcher>();
    manager.watch(vault_id, PathBuf::from(path))
}

#[tauri::command]
pub async fn watcher_unwatch(vault_id: String, app: AppHandle) -> AppResult<()> {
    let manager = app.state::<SharedWatcher>();
    manager.unwatch(&vault_id);
    Ok(())
}
