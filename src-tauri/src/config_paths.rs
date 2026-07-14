//! Resolves and manages Paperly's on-disk config + state under `~/.paperly`.
//!
//! Layout:
//! ```text
//! ~/.paperly/
//! ├── settings.json          # user prefs (hand-editable)
//! └── state/
//!     ├── vaults.json         # { vaults, lastActiveVaultId }
//!     └── workspace/
//!         └── {vaultId}.json  # per-vault UI state (expanded dirs, open note)
//! ```
//!
//! All persistence writes plain, pretty-printed JSON directly so the config
//! files stay readable and survive hand-edits.

use std::fs;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::{AppError, AppResult};

/// Root of all Paperly config + state: `~/.paperly`.
///
/// Honors `PAPERLY_HOME` when set + non-empty, so a dev build can run with an
/// isolated state dir (e.g. `PAPERLY_HOME=~/.paperly-dev pnpm tauri dev`)
/// without clobbering an installed Paperly's vaults/settings.
pub fn config_root() -> AppResult<PathBuf> {
    if let Ok(dir) = std::env::var("PAPERLY_HOME") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    dirs::home_dir()
        .map(|h| h.join(".paperly"))
        .ok_or_else(|| AppError::Other("could not resolve home directory".into()))
}

/// `~/.paperly/settings.json`, user preferences, hand-editable.
pub fn settings_file() -> AppResult<PathBuf> {
    Ok(config_root()?.join("settings.json"))
}

/// `~/.paperly/state`, app-managed state (not meant for hand-editing).
pub fn state_dir() -> AppResult<PathBuf> {
    Ok(config_root()?.join("state"))
}

/// `~/.paperly/state/vaults.json`, the vault registry + active id.
pub fn vaults_file() -> AppResult<PathBuf> {
    Ok(state_dir()?.join("vaults.json"))
}

/// `~/.paperly/state/workspace`, one file per vault.
pub fn workspace_dir() -> AppResult<PathBuf> {
    Ok(state_dir()?.join("workspace"))
}

/// Path to a single vault's workspace file: `state/workspace/{id}.json`.
///
/// Guards the id (which is server-generated, but belt-and-suspenders) so a
/// malformed value can never escape the workspace directory.
pub fn workspace_file(vault_id: &str) -> AppResult<PathBuf> {
    if vault_id.is_empty()
        || vault_id.starts_with('.')
        || vault_id.contains('/')
        || vault_id.contains('\\')
        || vault_id.contains("..")
        || vault_id.contains('\0')
    {
        return Err(AppError::Other(format!(
            "invalid vault id for workspace file: {vault_id:?}"
        )));
    }
    Ok(workspace_dir()?.join(format!("{vault_id}.json")))
}

/// Create the `~/.paperly` tree (root + state + workspace). Idempotent.
/// Creating the deepest dir (`workspace`) implies its ancestors.
pub fn ensure_dirs() -> AppResult<()> {
    fs::create_dir_all(workspace_dir()?)?;
    Ok(())
}

/// Read + deserialize a JSON config file.
///
/// - Absent file: `T::default()` (first run, not an error).
/// - Parse failure (corrupt / hand-edited): `T::default()` + log; never crash.
/// - Real IO errors (e.g. permission denied): propagate.
pub fn read_json<T: DeserializeOwned + Default>(path: &Path) -> AppResult<T> {
    match fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<T>(&raw) {
            Ok(value) => Ok(value),
            Err(e) => {
                eprintln!(
                    "[paperly] config parse failed for {}: {e}; using defaults",
                    path.display()
                );
                Ok(T::default())
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(T::default()),
        Err(e) => Err(AppError::Io(e)),
    }
}

/// Like [`read_json`] but returns `None` for an absent file, matching callers
/// whose contract is `Option<T>` (e.g. `load_workspace_state`). A corrupt file
/// is treated as `None` + log.
pub fn read_json_opt<T: DeserializeOwned>(path: &Path) -> AppResult<Option<T>> {
    match fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<T>(&raw) {
            Ok(value) => Ok(Some(value)),
            Err(e) => {
                eprintln!(
                    "[paperly] config parse failed for {}: {e}; ignoring",
                    path.display()
                );
                Ok(None)
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::Io(e)),
    }
}

/// Atomic, pretty-printed JSON write: serialize, write `<file>.paperly.tmp`,
/// rename. Creates parent directories as needed.
///
/// SECURITY: unlike the fs commands in `fs_ops`, this deliberately does NOT call
/// `paths::ensure_within_roots`. These files live under `~/.paperly`, outside
/// every registered vault root, so the roots check would reject them. It is
/// safe because the destination path is always app-derived: read commands take
/// no path argument, and write commands take only opaque JSON or a guarded
/// vault id (see [`workspace_file`]). The webview can never inject an arbitrary
/// path here.
pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(value)
        .map_err(|e| AppError::Other(format!("serialize config: {e}")))?;
    crate::atomic_file::write(path, json.as_bytes())
}
