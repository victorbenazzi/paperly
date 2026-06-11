//! Settings persistence commands. The payload is an opaque `serde_json::Value`:
//! the frontend owns the schema + validation, so adding a preference needs no
//! Rust recompile.

use crate::config_paths;
use crate::error::AppResult;

#[tauri::command]
pub async fn read_settings() -> AppResult<serde_json::Value> {
    let path = config_paths::settings_file()?;
    config_paths::read_json::<serde_json::Value>(&path)
}

#[tauri::command]
pub async fn write_settings(value: serde_json::Value) -> AppResult<()> {
    let path = config_paths::settings_file()?;
    config_paths::write_json_atomic(&path, &value)
}
