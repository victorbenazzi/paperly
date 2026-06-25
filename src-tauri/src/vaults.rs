//! Vault registry: the folders Paperly is allowed to touch. Persisted to
//! `~/.paperly/state/vaults.json`; mirrored in-memory (`VaultsCache`) so fs
//! commands can validate path containment without re-reading JSON per request.

use chrono::Utc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::config_paths;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vault {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub last_opened_at: String,
    /// Emoji shown in the switcher instead of the initial letter.
    #[serde(default)]
    pub icon: Option<String>,
}

/// On-disk shape of `state/vaults.json`: registry + last-active id in one
/// document so they stay atomic together.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VaultsFile {
    #[serde(default)]
    pub vaults: Vec<Vault>,
    #[serde(default)]
    pub last_active_vault_id: Option<String>,
}

/// In-memory cache of the vault list. Source of the sandbox roots.
#[derive(Default)]
pub struct VaultsCache {
    inner: RwLock<Vec<Vault>>,
}

impl VaultsCache {
    pub fn replace(&self, vaults: Vec<Vault>) {
        *self.inner.write() = vaults;
    }
    pub fn snapshot(&self) -> Vec<Vault> {
        self.inner.read().clone()
    }
    pub fn roots(&self) -> Vec<String> {
        self.inner.read().iter().map(|v| v.path.clone()).collect()
    }
    pub fn path_of(&self, id: &str) -> Option<String> {
        self.inner
            .read()
            .iter()
            .find(|v| v.id == id)
            .map(|v| v.path.clone())
    }
    /// `path_of` for command handlers: unknown id becomes a NotFound error.
    pub fn require_path(&self, id: &str) -> AppResult<String> {
        self.path_of(id)
            .ok_or_else(|| AppError::NotFound(format!("vault {id}")))
    }
}

fn load_file() -> AppResult<VaultsFile> {
    let path = config_paths::vaults_file()?;
    config_paths::read_json::<VaultsFile>(&path)
}

fn save_file(file: &VaultsFile) -> AppResult<()> {
    let path = config_paths::vaults_file()?;
    config_paths::write_json_atomic(&path, file)
}

/// Read the persisted vaults from disk and warm the cache. Runs in setup.
pub fn hydrate(app: &AppHandle) -> AppResult<()> {
    let file = load_file()?;
    let cache = app.state::<Arc<VaultsCache>>();
    cache.replace(file.vaults);
    Ok(())
}

/// Generate a 12-char id similar to nanoid.
fn new_id() -> String {
    use uuid::Uuid;
    Uuid::new_v4()
        .to_string()
        .replace('-', "")
        .chars()
        .take(12)
        .collect()
}

fn basename(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(path)
        .to_string()
}

pub fn list() -> AppResult<VaultsFile> {
    load_file()
}

/// Register an existing folder as a vault. Opening the same folder twice
/// refreshes `last_opened_at` instead of duplicating.
pub fn add(app: &AppHandle, path: String) -> AppResult<Vault> {
    let path = path.trim_end_matches('/').to_string();
    if path.is_empty() {
        return Err(AppError::Other("empty path".into()));
    }
    if !std::path::Path::new(&path).is_dir() {
        return Err(AppError::NotFound(format!("not a directory: {path}")));
    }

    let mut file = load_file()?;
    if let Some(existing) = file.vaults.iter().find(|v| v.path == path) {
        let id = existing.id.clone();
        let now = Utc::now().to_rfc3339();
        for v in file.vaults.iter_mut() {
            if v.id == id {
                v.last_opened_at = now.clone();
            }
        }
        file.last_active_vault_id = Some(id.clone());
        save_file(&file)?;
        app.state::<Arc<VaultsCache>>().replace(file.vaults.clone());
        return Ok(file.vaults.into_iter().find(|v| v.id == id).unwrap());
    }

    let now = Utc::now().to_rfc3339();
    let vault = Vault {
        id: new_id(),
        name: basename(&path),
        path: path.clone(),
        created_at: now.clone(),
        last_opened_at: now,
        icon: None,
    };
    file.vaults.push(vault.clone());
    file.last_active_vault_id = Some(vault.id.clone());
    save_file(&file)?;
    app.state::<Arc<VaultsCache>>().replace(file.vaults);
    Ok(vault)
}

/// Create a brand-new folder under `directory` and register it as a vault.
///
// SECURITY: this creates a directory outside the registered roots (a vault
// doesn't exist yet, so it can't go through ensure_within_roots). Mitigated:
// `directory` comes from the native folder dialog (an explicit OS-level user
// grant, same trust model as `add`), and `name` must be a single safe path
// segment (no separators, no traversal).
pub fn create(app: &AppHandle, directory: String, name: String) -> AppResult<Vault> {
    let directory = directory.trim_end_matches('/').to_string();
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Other("empty vault name".into()));
    }
    if name.contains('/') || name.contains('\\') || name == "." || name == ".." {
        return Err(AppError::Other("invalid vault name".into()));
    }
    if !std::path::Path::new(&directory).is_dir() {
        return Err(AppError::NotFound(format!("not a directory: {directory}")));
    }
    let full = std::path::Path::new(&directory).join(&name);
    if full.exists() {
        return Err(AppError::Other(format!(
            "already exists: {}",
            full.display()
        )));
    }
    std::fs::create_dir(&full).map_err(|e| AppError::Other(format!("create vault dir: {e}")))?;
    add(app, full.to_string_lossy().into_owned())
}

/// Unregister a vault. Never touches the folder on disk.
pub fn remove(app: &AppHandle, id: &str) -> AppResult<()> {
    let mut file = load_file()?;
    let initial = file.vaults.len();
    file.vaults.retain(|v| v.id != id);
    if file.vaults.len() == initial {
        return Err(AppError::NotFound(format!("vault {id}")));
    }
    if file.last_active_vault_id.as_deref() == Some(id) {
        file.last_active_vault_id = None;
    }
    save_file(&file)?;
    app.state::<Arc<VaultsCache>>().replace(file.vaults);
    Ok(())
}

/// Rename a vault: the FOLDER on disk moves with it (name and basename stay
/// coupled, same as `add`). The watcher self-heals because the frontend
/// re-watches when the vault's path changes.
pub fn rename(app: &AppHandle, id: &str, name: String) -> AppResult<Vault> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::Other("name cannot be empty".into()));
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed == "." || trimmed == ".." {
        return Err(AppError::Other("invalid vault name".into()));
    }
    let mut file = load_file()?;
    let idx = file
        .vaults
        .iter()
        .position(|v| v.id == id)
        .ok_or_else(|| AppError::NotFound(format!("vault {id}")))?;

    let old_path = std::path::PathBuf::from(&file.vaults[idx].path);
    if old_path.file_name().and_then(|s| s.to_str()) != Some(trimmed.as_str()) {
        let parent = old_path
            .parent()
            .ok_or_else(|| AppError::Other("vault has no parent directory".into()))?;
        let new_path = parent.join(&trimmed);
        if new_path.exists() {
            return Err(AppError::Other(format!(
                "already exists: {}",
                new_path.display()
            )));
        }
        std::fs::rename(&old_path, &new_path)
            .map_err(|e| AppError::Other(format!("rename vault dir: {e}")))?;
        file.vaults[idx].path = new_path.to_string_lossy().into_owned();
    }
    file.vaults[idx].name = trimmed;
    save_file(&file)?;
    app.state::<Arc<VaultsCache>>().replace(file.vaults.clone());
    Ok(file.vaults.into_iter().nth(idx).unwrap())
}

pub fn set_icon(app: &AppHandle, id: &str, icon: Option<String>) -> AppResult<Vault> {
    let mut file = load_file()?;
    let idx = file
        .vaults
        .iter()
        .position(|v| v.id == id)
        .ok_or_else(|| AppError::NotFound(format!("vault {id}")))?;
    file.vaults[idx].icon = icon.filter(|s| !s.trim().is_empty());
    save_file(&file)?;
    app.state::<Arc<VaultsCache>>().replace(file.vaults.clone());
    Ok(file.vaults.into_iter().nth(idx).unwrap())
}

pub fn set_active(app: &AppHandle, id: &str) -> AppResult<()> {
    let mut file = load_file()?;
    let idx = file
        .vaults
        .iter()
        .position(|v| v.id == id)
        .ok_or_else(|| AppError::NotFound(format!("vault {id}")))?;
    file.vaults[idx].last_opened_at = Utc::now().to_rfc3339();
    file.last_active_vault_id = Some(id.to_string());
    save_file(&file)?;
    app.state::<Arc<VaultsCache>>().replace(file.vaults);
    Ok(())
}
