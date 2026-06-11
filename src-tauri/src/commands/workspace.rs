//! Per-vault UI state (expanded dirs, open note, sidebar width). The payload
//! is opaque JSON: the frontend owns the schema.

use crate::config_paths;
use crate::error::AppResult;

#[tauri::command]
pub async fn save_workspace_state(vault_id: String, state: serde_json::Value) -> AppResult<()> {
    let path = config_paths::workspace_file(&vault_id)?;
    config_paths::write_json_atomic(&path, &state)
}

#[tauri::command]
pub async fn load_workspace_state(vault_id: String) -> AppResult<Option<serde_json::Value>> {
    let path = config_paths::workspace_file(&vault_id)?;
    config_paths::read_json_opt(&path)
}
