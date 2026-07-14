//! Filesystem operations, all sandboxed to the registered vault roots.
//! Public functions validate either the real existing path or the real parent
//! directory before touching disk; if you add a new one, it MUST do the same.

use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::time::SystemTime;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::util::paths;
use crate::vaults::VaultsCache;

const DEFAULT_TEXT_LIMIT: u64 = 25 * 1024 * 1024; // 25 MiB
const DEFAULT_BYTES_LIMIT: u64 = 50 * 1024 * 1024; // 50 MiB

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub mtime_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMeta {
    pub size: u64,
    pub mtime_ms: i64,
    pub is_dir: bool,
    pub is_symlink: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    pub content: String,
    pub encoding: String,
    pub truncated: bool,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BytesFile {
    pub b64: String,
    pub mime: Option<String>,
    pub truncated: bool,
    pub size: u64,
}

pub fn guess_mime(path: &str) -> Option<String> {
    let ext = Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())?;
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "pdf" => "application/pdf",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        _ => return None,
    };
    Some(mime.to_string())
}

fn io_error(ctx: &str, e: std::io::Error) -> AppError {
    match e.kind() {
        std::io::ErrorKind::NotFound => AppError::NotFound(format!("{ctx}: {e}")),
        std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied(format!("{ctx}: {e}")),
        _ => AppError::Io(e),
    }
}

fn require_existing_within_roots(app: &AppHandle, path: &str) -> AppResult<()> {
    let cache = app.state::<Arc<VaultsCache>>();
    let roots = cache.roots();
    if roots.is_empty() {
        return Err(AppError::PathNotAllowed(
            "no vault roots registered yet".into(),
        ));
    }
    paths::ensure_existing_within_roots(path, &roots)
}

fn require_parent_within_roots(app: &AppHandle, path: &str) -> AppResult<()> {
    let cache = app.state::<Arc<VaultsCache>>();
    let roots = cache.roots();
    if roots.is_empty() {
        return Err(AppError::PathNotAllowed(
            "no vault roots registered yet".into(),
        ));
    }
    paths::ensure_parent_within_roots(path, &roots)
}

fn refuse_vault_root(app: &AppHandle, path: &Path, action: &str) -> AppResult<()> {
    let normalized = paths::normalize(path);
    let cache = app.state::<Arc<VaultsCache>>();
    if cache
        .roots()
        .iter()
        .any(|r| paths::normalize(Path::new(r)) == normalized)
    {
        return Err(AppError::PathNotAllowed(format!(
            "refusing to {action} a vault root: {}",
            path.display()
        )));
    }
    Ok(())
}

fn mtime_ms(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Read up to `limit` bytes, reporting truncation and the on-disk size.
fn read_capped(path: &str, ctx: &str, limit: u64) -> AppResult<(Vec<u8>, bool, u64)> {
    let meta = Path::new(path).metadata().map_err(|e| io_error(ctx, e))?;
    let truncated = meta.len() > limit;
    let bytes = if truncated {
        let mut f = fs::File::open(path).map_err(|e| io_error("open", e))?;
        let mut buf = vec![0u8; limit as usize];
        use std::io::Read;
        let n = f.read(&mut buf).map_err(|e| io_error("read", e))?;
        buf.truncate(n);
        buf
    } else {
        fs::read(path).map_err(|e| io_error("read", e))?
    };
    Ok((bytes, truncated, meta.len()))
}

fn bytes_to_text(bytes: Vec<u8>, truncated: bool, size: u64) -> TextFile {
    let (content, encoding) = match String::from_utf8(bytes) {
        Ok(s) => (s, "utf-8".to_string()),
        Err(e) => (
            String::from_utf8_lossy(e.as_bytes()).into_owned(),
            "lossy".to_string(),
        ),
    };
    TextFile {
        content,
        encoding,
        truncated,
        size,
    }
}

pub fn read_dir(app: &AppHandle, path: &str) -> AppResult<Vec<DirEntry>> {
    require_existing_within_roots(app, path)?;
    let read = fs::read_dir(Path::new(path)).map_err(|e| io_error("read_dir", e))?;

    let mut out: Vec<DirEntry> = Vec::with_capacity(64);
    for entry in read {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // skip unreadable entries; don't fail the listing
        };
        let name = entry.file_name().to_string_lossy().to_string();
        // Hide dotfiles (.git, .obsidian, .DS_Store...): a vault is user notes.
        if name.starts_with('.') {
            continue;
        }
        let path_s = entry.path().to_string_lossy().to_string();
        // symlink_metadata so symlinks report as symlinks, not the target type
        let meta = match entry.path().symlink_metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        out.push(DirEntry {
            name,
            path: path_s,
            is_dir: meta.is_dir(),
            is_symlink: meta.file_type().is_symlink(),
            size: meta.len(),
            mtime_ms: mtime_ms(&meta),
        });
    }

    // Folders first, then files; both case-insensitive alphabetical.
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(out)
}

pub fn stat(app: &AppHandle, path: &str) -> AppResult<FileMeta> {
    require_existing_within_roots(app, path)?;
    let meta = Path::new(path)
        .symlink_metadata()
        .map_err(|e| io_error("stat", e))?;
    Ok(FileMeta {
        size: meta.len(),
        mtime_ms: mtime_ms(&meta),
        is_dir: meta.is_dir(),
        is_symlink: meta.file_type().is_symlink(),
    })
}

pub fn read_file_text(app: &AppHandle, path: &str, max_bytes: Option<u64>) -> AppResult<TextFile> {
    require_existing_within_roots(app, path)?;
    let limit = max_bytes.unwrap_or(DEFAULT_TEXT_LIMIT);
    let (bytes, truncated, size) = read_capped(path, "read_file_text", limit)?;
    Ok(bytes_to_text(bytes, truncated, size))
}

pub fn read_file_bytes(
    app: &AppHandle,
    path: &str,
    max_bytes: Option<u64>,
) -> AppResult<BytesFile> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    require_existing_within_roots(app, path)?;
    let limit = max_bytes.unwrap_or(DEFAULT_BYTES_LIMIT);
    let meta = Path::new(path)
        .metadata()
        .map_err(|e| io_error("read_file_bytes", e))?;
    if meta.len() > limit {
        return Err(AppError::FileTooLarge(format!(
            "{path}: {} bytes (max {limit})",
            meta.len()
        )));
    }
    let bytes = fs::read(path).map_err(|e| io_error("read", e))?;
    Ok(BytesFile {
        b64: STANDARD.encode(&bytes),
        mime: guess_mime(path),
        truncated: false,
        size: meta.len(),
    })
}

/// Persist pasted/dropped bytes into `<vault>/assets/`, returning the
/// vault-relative path that goes into the markdown (`assets/<name>`).
/// The stored name is `<slug>-<6 random chars>.<ext>` to avoid collisions.
pub fn save_asset(
    app: &AppHandle,
    vault_id: &str,
    file_name: &str,
    bytes_b64: &str,
) -> AppResult<String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let cache = app.state::<Arc<VaultsCache>>();
    let root = cache
        .path_of(vault_id)
        .ok_or_else(|| AppError::NotFound(format!("vault {vault_id}")))?;

    let bytes = STANDARD
        .decode(bytes_b64)
        .map_err(|e| AppError::Other(format!("invalid base64: {e}")))?;
    if bytes.len() as u64 > DEFAULT_BYTES_LIMIT {
        return Err(AppError::FileTooLarge(format!(
            "asset: {} bytes (max {DEFAULT_BYTES_LIMIT})",
            bytes.len()
        )));
    }

    // Sanitize to a flat basename: keep the extension, slugify the stem.
    let base = Path::new(file_name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("asset");
    let (stem, ext) = match base.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s, e.to_lowercase()),
        _ => (base, "bin".to_string()),
    };
    let slug: String = stem
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(40)
        .collect();
    let slug = if slug.is_empty() {
        "asset".to_string()
    } else {
        slug
    };
    let suffix: String = uuid::Uuid::new_v4()
        .to_string()
        .replace('-', "")
        .chars()
        .take(6)
        .collect();
    let name = format!("{slug}-{suffix}.{ext}");

    let assets_dir = Path::new(&root).join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| io_error("save_asset: mkdir", e))?;
    let target = assets_dir.join(&name);
    let target_str = target.to_string_lossy().to_string();
    require_parent_within_roots(app, &target_str)?;
    atomic_write(&target, &bytes)?;
    Ok(format!("assets/{name}"))
}

/// Atomic write: `<path>.<ext>.paperly.tmp` then rename.
pub fn write_file_text(app: &AppHandle, path: &str, content: &str) -> AppResult<()> {
    require_parent_within_roots(app, path)?;
    atomic_write(Path::new(path), content.as_bytes())
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    crate::atomic_file::write(path, bytes)
}

/// Validate a user-supplied name component used for create/rename.
/// Reject traversal, separators and absolute/empty inputs.
fn validate_name(name: &str) -> AppResult<()> {
    if name.is_empty() || name == "." || name == ".." {
        return Err(AppError::Other(format!("invalid name: {name:?}")));
    }
    if name.contains('\0') || name.starts_with('/') || name.starts_with('\\') {
        return Err(AppError::Other(format!("invalid name: {name:?}")));
    }
    if name.contains('/') || name.contains('\\') {
        return Err(AppError::Other(format!(
            "invalid name (no separators allowed): {name:?}"
        )));
    }
    Ok(())
}

/// Create an empty file `name` inside `parent`. Refuses to overwrite.
pub fn create_file(app: &AppHandle, parent: &str, name: &str) -> AppResult<String> {
    require_existing_within_roots(app, parent)?;
    validate_name(name)?;

    let target = Path::new(parent).join(name);
    let target_str = target.to_string_lossy().to_string();
    require_parent_within_roots(app, &target_str)?;

    if target.symlink_metadata().is_ok() {
        return Err(AppError::Other(format!("already exists: {target_str}")));
    }
    // Create exclusively so a race can't clobber an existing file.
    use std::fs::OpenOptions;
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|e| io_error("create_file", e))?;
    Ok(target_str)
}

/// Create directory `name` inside `parent`. Refuses if the leaf already exists.
pub fn create_dir(app: &AppHandle, parent: &str, name: &str) -> AppResult<String> {
    require_existing_within_roots(app, parent)?;
    validate_name(name)?;

    let target = Path::new(parent).join(name);
    let target_str = target.to_string_lossy().to_string();
    require_parent_within_roots(app, &target_str)?;

    if target.symlink_metadata().is_ok() {
        return Err(AppError::Other(format!("already exists: {target_str}")));
    }
    fs::create_dir_all(&target).map_err(|e| io_error("create_dir", e))?;
    Ok(target_str)
}

/// Move a file or folder to the macOS Trash (recoverable). Notes are user
/// data: never permanently delete from the UI.
pub fn delete_path(app: &AppHandle, path: &str) -> AppResult<()> {
    validate_delete_path(app, path)?;
    let target = Path::new(path);
    trash::delete(target).map_err(|e| AppError::Other(format!("move to trash: {e}")))?;
    Ok(())
}

pub fn validate_delete_path(app: &AppHandle, path: &str) -> AppResult<()> {
    require_existing_within_roots(app, path)?;
    let target = Path::new(path);
    refuse_vault_root(app, target, "delete")?;
    target
        .symlink_metadata()
        .map_err(|e| io_error("delete: stat", e))?;
    Ok(())
}

/// Rename within the same parent directory. `new_name` is a basename.
pub fn rename_path(app: &AppHandle, from: &str, new_name: &str) -> AppResult<String> {
    require_existing_within_roots(app, from)?;
    validate_name(new_name)?;

    let from_path = Path::new(from);
    refuse_vault_root(app, from_path, "rename")?;

    let parent = from_path.parent().ok_or_else(|| {
        AppError::Other(format!(
            "cannot rename top-level path without parent: {from}"
        ))
    })?;
    let to_path = parent.join(new_name);
    let to_str = to_path.to_string_lossy().to_string();
    require_parent_within_roots(app, &to_str)?;

    if to_path.symlink_metadata().is_ok() {
        return Err(AppError::Other(format!(
            "destination already exists: {to_str}"
        )));
    }

    fs::rename(from_path, &to_path).map_err(|e| io_error("rename", e))?;
    Ok(to_str)
}

fn is_cross_device(e: &std::io::Error) -> bool {
    // EXDEV is raw os error 18 on macOS/Linux.
    e.raw_os_error() == Some(18)
}

fn move_file_cross_device(from: &Path, to: &Path) -> AppResult<()> {
    match fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(e) if is_cross_device(&e) => {
            fs::copy(from, to).map_err(|e| io_error("move: copy (cross-device)", e))?;
            fs::remove_file(from).map_err(|e| {
                let _ = fs::remove_file(to);
                io_error("move: remove src (cross-device)", e)
            })
        }
        Err(e) => Err(io_error("move", e)),
    }
}

fn ensure_is_dir(path: &Path, ctx: &str) -> AppResult<()> {
    match path.symlink_metadata() {
        Ok(m) if m.is_dir() => Ok(()),
        Ok(_) => Err(AppError::Other(format!(
            "{ctx}: not a folder: {}",
            path.display()
        ))),
        Err(e) => Err(io_error(ctx, e)),
    }
}

/// Move `from` into directory `to_dir`, preserving the basename.
/// Refuses no-ops, circular moves and conflicts.
pub fn move_path(app: &AppHandle, from: &str, to_dir: &str) -> AppResult<String> {
    require_existing_within_roots(app, from)?;
    require_existing_within_roots(app, to_dir)?;

    let from_path = Path::new(from);
    refuse_vault_root(app, from_path, "move")?;
    let normalized_from = paths::normalize(from_path);

    let base = from_path
        .file_name()
        .ok_or_else(|| AppError::Other(format!("cannot move path without a name: {from}")))?;
    let to_dir_path = Path::new(to_dir);
    let normalized_to_dir = paths::normalize(to_dir_path);

    if normalized_from.parent() == Some(normalized_to_dir.as_path()) {
        return Err(AppError::Other(
            "item is already in the destination folder".into(),
        ));
    }
    if normalized_to_dir == normalized_from || normalized_to_dir.starts_with(&normalized_from) {
        return Err(AppError::Other(
            "cannot move a folder into itself or its own subfolder".into(),
        ));
    }

    let dest = to_dir_path.join(base);
    let dest_str = dest.to_string_lossy().to_string();
    require_parent_within_roots(app, &dest_str)?;

    if dest.symlink_metadata().is_ok() {
        return Err(AppError::Other(format!(
            "destination already exists: {dest_str}"
        )));
    }
    ensure_is_dir(to_dir_path, "move: dest dir")?;

    move_file_cross_device(from_path, &dest)?;
    Ok(dest_str)
}
