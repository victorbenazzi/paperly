//! Thin async wrappers over `fs_ops`. All path arguments are validated against
//! the registered vault roots inside `fs_ops`; commands stay declarative.

use tauri::AppHandle;

use crate::error::AppResult;
use crate::fs_ops::{self, BytesFile, DirEntry, FileMeta, TextFile};

#[tauri::command]
pub async fn read_dir(path: String, app: AppHandle) -> AppResult<Vec<DirEntry>> {
    tauri::async_runtime::spawn_blocking(move || fs_ops::read_dir(&app, &path))
        .await
        .map_err(|e| crate::error::AppError::Other(format!("join: {e}")))?
}

#[tauri::command]
pub async fn stat(path: String, app: AppHandle) -> AppResult<FileMeta> {
    fs_ops::stat(&app, &path)
}

#[tauri::command]
pub async fn read_file_text(
    path: String,
    max_bytes: Option<u64>,
    app: AppHandle,
) -> AppResult<TextFile> {
    tauri::async_runtime::spawn_blocking(move || fs_ops::read_file_text(&app, &path, max_bytes))
        .await
        .map_err(|e| crate::error::AppError::Other(format!("join: {e}")))?
}

#[tauri::command]
pub async fn write_file_text(path: String, content: String, app: AppHandle) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || fs_ops::write_file_text(&app, &path, &content))
        .await
        .map_err(|e| crate::error::AppError::Other(format!("join: {e}")))?
}

#[tauri::command]
pub async fn read_file_bytes(
    path: String,
    max_bytes: Option<u64>,
    app: AppHandle,
) -> AppResult<BytesFile> {
    tauri::async_runtime::spawn_blocking(move || fs_ops::read_file_bytes(&app, &path, max_bytes))
        .await
        .map_err(|e| crate::error::AppError::Other(format!("join: {e}")))?
}

#[tauri::command]
pub async fn vault_save_asset(
    vault_id: String,
    file_name: String,
    bytes_b64: String,
    app: AppHandle,
) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        fs_ops::save_asset(&app, &vault_id, &file_name, &bytes_b64)
    })
    .await
    .map_err(|e| crate::error::AppError::Other(format!("join: {e}")))?
}

#[tauri::command]
pub async fn open_with_default_app(path: String, app: AppHandle) -> AppResult<()> {
    use std::sync::Arc;
    use tauri::Manager;
    let cache = app.state::<Arc<crate::vaults::VaultsCache>>();
    crate::util::paths::ensure_within_roots(&path, &cache.roots())?;
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| crate::error::AppError::Other(format!("open: {e}")))?;
    Ok(())
}

#[tauri::command]
pub async fn create_file(parent: String, name: String, app: AppHandle) -> AppResult<String> {
    fs_ops::create_file(&app, &parent, &name)
}

#[tauri::command]
pub async fn create_dir(parent: String, name: String, app: AppHandle) -> AppResult<String> {
    fs_ops::create_dir(&app, &parent, &name)
}

#[tauri::command]
pub async fn rename_path(path: String, new_name: String, app: AppHandle) -> AppResult<String> {
    fs_ops::rename_path(&app, &path, &new_name)
}

#[tauri::command]
pub async fn delete_path(path: String, app: AppHandle) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || fs_ops::delete_path(&app, &path))
        .await
        .map_err(|e| crate::error::AppError::Other(format!("join: {e}")))?
}

#[tauri::command]
pub async fn move_path(path: String, target_dir: String, app: AppHandle) -> AppResult<String> {
    fs_ops::move_path(&app, &path, &target_dir)
}

#[tauri::command]
pub async fn reveal_in_finder(path: String, app: AppHandle) -> AppResult<()> {
    use std::sync::Arc;
    use tauri::Manager;
    // Reveal is read-only, but keep it sandboxed anyway.
    let cache = app.state::<Arc<crate::vaults::VaultsCache>>();
    crate::util::paths::ensure_within_roots(&path, &cache.roots())?;
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| crate::error::AppError::Other(format!("reveal: {e}")))?;
    Ok(())
}
