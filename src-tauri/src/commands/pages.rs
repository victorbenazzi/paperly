use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::fs_ops;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PagePaths {
    pub path: String,
    pub dir_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum DeletePageOutcome {
    Deleted {
        deleted_paths: Vec<String>,
    },
    Failed {
        remaining_paths: Vec<String>,
        message: String,
    },
    Partial {
        deleted_paths: Vec<String>,
        remaining_paths: Vec<String>,
        message: String,
    },
}

fn basename(path: &str) -> AppResult<&str> {
    path.rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Other(format!("path has no file name: {path}")))
}

fn parent_of(path: &str) -> AppResult<&str> {
    path.rsplit_once('/')
        .map(|(parent, _)| parent)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Other(format!("path has no parent: {path}")))
}

fn is_markdown_path(path: &str) -> bool {
    let name = basename(path).unwrap_or("");
    let ext = name
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase());
    matches!(ext.as_deref(), Some("md") | Some("markdown"))
}

fn validate_companion(path: &str, dir_path: Option<&str>) -> AppResult<()> {
    let Some(dir_path) = dir_path else {
        return Ok(());
    };
    let expected = Path::new(path).with_extension("");
    if Path::new(dir_path) != expected {
        return Err(AppError::PathNotAllowed(format!(
            "page companion does not match note: {dir_path}"
        )));
    }
    Ok(())
}

fn existing_companion(path: &str, dir_path: Option<&str>) -> AppResult<Option<String>> {
    validate_companion(path, dir_path)?;
    let expected = Path::new(path).with_extension("");
    match expected.symlink_metadata() {
        Ok(metadata) if metadata.is_dir() => Ok(Some(expected.to_string_lossy().into_owned())),
        Ok(_) => Err(AppError::Other(format!(
            "page companion is not a directory: {}",
            expected.display()
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(AppError::Io(error)),
    }
}

#[tauri::command]
pub async fn rename_page(
    path: String,
    dir_path: Option<String>,
    new_display_name: String,
    app: AppHandle,
) -> AppResult<PagePaths> {
    if !is_markdown_path(&path) {
        return Err(AppError::Other(format!("not a markdown page: {path}")));
    }
    let dir_path = existing_companion(&path, dir_path.as_deref())?;

    let next_name = new_display_name.trim();
    if next_name.is_empty() {
        return Err(AppError::Other("page name cannot be empty".into()));
    }

    let old_file_name = basename(&path)?.to_string();
    let new_path = fs_ops::rename_path(&app, &path, &format!("{next_name}.md"))?;

    let new_dir_path = match dir_path {
        Some(dir) if dir != path => match fs_ops::rename_path(&app, &dir, next_name) {
            Ok(new_dir) => Some(new_dir),
            Err(err) => {
                let _ = fs_ops::rename_path(&app, &new_path, &old_file_name);
                return Err(err);
            }
        },
        _ => None,
    };

    Ok(PagePaths {
        path: new_path,
        dir_path: new_dir_path,
    })
}

#[tauri::command]
pub async fn move_page(
    path: String,
    dir_path: Option<String>,
    target_dir: String,
    app: AppHandle,
) -> AppResult<PagePaths> {
    if !is_markdown_path(&path) {
        return Err(AppError::Other(format!("not a markdown page: {path}")));
    }
    let dir_path = existing_companion(&path, dir_path.as_deref())?;

    let old_parent = parent_of(&path)?.to_string();
    let new_path = fs_ops::move_path(&app, &path, &target_dir)?;

    let new_dir_path = match dir_path {
        Some(dir) if dir != path => match fs_ops::move_path(&app, &dir, &target_dir) {
            Ok(new_dir) => Some(new_dir),
            Err(err) => {
                let _ = fs_ops::move_path(&app, &new_path, &old_parent);
                return Err(err);
            }
        },
        _ => None,
    };

    Ok(PagePaths {
        path: new_path,
        dir_path: new_dir_path,
    })
}

fn delete_page_blocking(
    path: String,
    dir_path: Option<String>,
    app: AppHandle,
) -> AppResult<DeletePageOutcome> {
    if !is_markdown_path(&path) {
        return Err(AppError::Other(format!("not a markdown page: {path}")));
    }
    let dir_path = existing_companion(&path, dir_path.as_deref())?;

    fs_ops::validate_delete_path(&app, &path)?;
    let mut targets = vec![PathBuf::from(&path)];
    if let Some(dir) = dir_path.filter(|dir| dir != &path) {
        if Path::new(&dir).symlink_metadata().is_ok() {
            fs_ops::validate_delete_path(&app, &dir)?;
            targets.push(PathBuf::from(dir));
        }
    }

    let original: Vec<String> = targets
        .iter()
        .map(|target| target.to_string_lossy().into_owned())
        .collect();
    match trash::delete_all(&targets) {
        Ok(()) => Ok(DeletePageOutcome::Deleted {
            deleted_paths: original,
        }),
        Err(err) => Ok(classify_delete_error(
            original,
            format!("move to trash: {err}"),
            |target| Path::new(target).symlink_metadata().is_ok(),
        )),
    }
}

fn classify_delete_error<F>(
    original: Vec<String>,
    message: String,
    still_exists: F,
) -> DeletePageOutcome
where
    F: Fn(&str) -> bool,
{
    let (remaining_paths, deleted_paths): (Vec<_>, Vec<_>) = original
        .into_iter()
        .partition(|target| still_exists(target));
    if deleted_paths.is_empty() {
        DeletePageOutcome::Failed {
            remaining_paths,
            message,
        }
    } else if remaining_paths.is_empty() {
        DeletePageOutcome::Deleted { deleted_paths }
    } else {
        DeletePageOutcome::Partial {
            deleted_paths,
            remaining_paths,
            message,
        }
    }
}

#[tauri::command]
pub async fn delete_page(
    path: String,
    dir_path: Option<String>,
    app: AppHandle,
) -> AppResult<DeletePageOutcome> {
    tauri::async_runtime::spawn_blocking(move || delete_page_blocking(path, dir_path, app))
        .await
        .map_err(|e| AppError::Other(format!("join: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_complete_delete_after_a_backend_error() {
        let outcome = classify_delete_error(
            vec!["note.md".into(), "note".into()],
            "trash failed".into(),
            |_| false,
        );
        assert!(matches!(outcome, DeletePageOutcome::Deleted { .. }));
    }

    #[test]
    fn accepts_only_the_note_companion_directory() {
        assert!(validate_companion("/vault/Page.md", Some("/vault/Page")).is_ok());
        assert!(validate_companion("/vault/Page.markdown", None).is_ok());
        assert!(validate_companion("/vault/Page.md", Some("/vault/Other")).is_err());
    }

    #[test]
    fn classifies_failed_delete_when_every_path_remains() {
        let outcome = classify_delete_error(
            vec!["note.md".into(), "note".into()],
            "trash failed".into(),
            |_| true,
        );
        assert!(matches!(outcome, DeletePageOutcome::Failed { .. }));
    }

    #[test]
    fn classifies_partial_delete_with_exact_remaining_paths() {
        let outcome = classify_delete_error(
            vec!["note.md".into(), "note".into()],
            "trash failed".into(),
            |path| path == "note",
        );
        match outcome {
            DeletePageOutcome::Partial {
                deleted_paths,
                remaining_paths,
                ..
            } => {
                assert_eq!(deleted_paths, vec!["note.md"]);
                assert_eq!(remaining_paths, vec!["note"]);
            }
            _ => panic!("expected a partial outcome"),
        }
    }
}
