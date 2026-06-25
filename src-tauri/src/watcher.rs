use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};
use crate::events::EV_FS_CHANGED;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FsChangedPayload {
    pub vault_id: String,
    pub paths: Vec<String>,
}

/// One file watcher per vault root. Dropping a debouncer releases its
/// OS-level watcher.
pub struct WatcherManager {
    by_vault: Mutex<HashMap<String, Debouncer<notify::RecommendedWatcher>>>,
    /// Path we asked notify to watch for each vault. Makes `watch()`
    /// idempotent (a no-op for the same (id, path)) so rapid vault switches
    /// don't drop in-flight events from the 80ms debounce window.
    paths_by_vault: Mutex<HashMap<String, PathBuf>>,
    app_handle: AppHandle,
}

impl WatcherManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            by_vault: Mutex::new(HashMap::new()),
            paths_by_vault: Mutex::new(HashMap::new()),
            app_handle,
        }
    }

    pub fn watch(&self, vault_id: String, path: PathBuf) -> AppResult<()> {
        if let Some(existing) = self.paths_by_vault.lock().get(&vault_id) {
            if existing == &path {
                return Ok(());
            }
        }
        // Drop the old debouncer OUTSIDE the lock so its callback thread can't
        // re-acquire it during shutdown (deadlock with parking_lot::Mutex).
        let old_debouncer = {
            let mut guard = self.by_vault.lock();
            guard.remove(&vault_id)
        };
        drop(old_debouncer);

        let app = self.app_handle.clone();
        let vid = vault_id.clone();
        // FSEvents on macOS reports CANONICALIZED paths (symlinks/firmlinks
        // resolved: iCloud Documents, /var -> /private/var...). The tree
        // caches dirs under the path we were ASKED to watch. Rewrite each
        // event's canonical prefix back to the requested root, or the
        // frontend's exact-prefix matching never fires and the tree goes dead.
        let requested_root = path.clone();
        let canonical_root = path.canonicalize().unwrap_or_else(|_| path.clone());
        // 80ms: snappy enough that agent-created files pop in immediately,
        // slow enough to coalesce editor-save churn.
        let mut debouncer = new_debouncer(
            Duration::from_millis(80),
            move |res: DebounceEventResult| {
                let events = match res {
                    Ok(events) => events,
                    Err(err) => {
                        eprintln!("[watcher] error: {err}");
                        return;
                    }
                };
                if events.is_empty() {
                    return;
                }
                let mut paths: Vec<String> = events
                    .iter()
                    .map(|e| match e.path.strip_prefix(&canonical_root) {
                        Ok(rel) => requested_root.join(rel).display().to_string(),
                        Err(_) => e.path.display().to_string(),
                    })
                    // App-internal and tool dirs never drive the UI.
                    .filter(|p| {
                        !p.contains("/.git/")
                            && !p.contains("/.obsidian/")
                            && !p.contains("/.paperly/")
                    })
                    .collect();
                paths.sort();
                paths.dedup();
                if paths.is_empty() {
                    return;
                }
                let _ = app.emit(
                    EV_FS_CHANGED,
                    FsChangedPayload {
                        vault_id: vid.clone(),
                        paths,
                    },
                );
            },
        )
        .map_err(|e| AppError::Other(format!("notify debouncer: {e}")))?;

        debouncer
            .watcher()
            .watch(&path, RecursiveMode::Recursive)
            .map_err(|e| AppError::Other(format!("watch {}: {e}", path.display())))?;

        self.paths_by_vault.lock().insert(vault_id.clone(), path);
        self.by_vault.lock().insert(vault_id, debouncer);
        Ok(())
    }

    pub fn unwatch(&self, vault_id: &str) {
        self.paths_by_vault.lock().remove(vault_id);
        let old = {
            let mut guard = self.by_vault.lock();
            guard.remove(vault_id)
        };
        drop(old);
    }
}

pub type SharedWatcher = Arc<WatcherManager>;
