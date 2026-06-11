use tauri::AppHandle;

use crate::error::AppResult;
use crate::vaults::{self, Vault, VaultsFile};

#[tauri::command]
pub async fn vault_list() -> AppResult<VaultsFile> {
    vaults::list()
}

#[tauri::command]
pub async fn vault_add(path: String, app: AppHandle) -> AppResult<Vault> {
    vaults::add(&app, path)
}

#[tauri::command]
pub async fn vault_create(directory: String, name: String, app: AppHandle) -> AppResult<Vault> {
    vaults::create(&app, directory, name)
}

#[tauri::command]
pub async fn vault_remove(id: String, app: AppHandle) -> AppResult<()> {
    vaults::remove(&app, &id)
}

#[tauri::command]
pub async fn vault_rename(id: String, name: String, app: AppHandle) -> AppResult<Vault> {
    vaults::rename(&app, &id, name)
}

#[tauri::command]
pub async fn vault_set_active(id: String, app: AppHandle) -> AppResult<()> {
    vaults::set_active(&app, &id)
}
