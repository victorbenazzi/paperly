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

#[tauri::command]
pub async fn delete_page(path: String, dir_path: Option<String>, app: AppHandle) -> AppResult<()> {
    if !is_markdown_path(&path) {
        return Err(AppError::Other(format!("not a markdown page: {path}")));
    }

    fs_ops::delete_path(&app, &path)?;
    if let Some(dir) = dir_path.filter(|dir| dir != &path) {
        match fs_ops::delete_path(&app, &dir) {
            Ok(()) | Err(AppError::NotFound(_)) => {}
            Err(err) => return Err(err),
        }
    }
    Ok(())
}
