use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::search::{self, SearchOptions, SearchResults};
use crate::vaults::VaultsCache;

#[tauri::command]
pub async fn search_in_vault(
    vault_id: String,
    query: String,
    options: Option<SearchOptions>,
    app: AppHandle,
) -> AppResult<SearchResults> {
    let root = app.state::<Arc<VaultsCache>>().require_path(&vault_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        search::search(&root, &query, options.unwrap_or_default())
    })
    .await
    .map_err(|e| AppError::Other(format!("join: {e}")))?
}

#[tauri::command]
pub async fn list_files(vault_id: String, max: Option<usize>, app: AppHandle) -> AppResult<Vec<String>> {
    let root = app.state::<Arc<VaultsCache>>().require_path(&vault_id)?;
    tauri::async_runtime::spawn_blocking(move || search::list_files(&root, max.unwrap_or(5000)))
        .await
        .map_err(|e| AppError::Other(format!("join: {e}")))?
}
