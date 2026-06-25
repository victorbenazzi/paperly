use std::path::{Path, PathBuf};

use crate::error::AppError;

/// Normalize a path by collapsing redundant `.` and `..` and removing trailing slashes.
/// Does not touch the filesystem. Use the canonical helpers below before any
/// operation that follows symlinks.
pub fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in p.components() {
        match component {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            c => out.push(c.as_os_str()),
        }
    }
    out
}

/// Returns true if `child` is `root` or a descendant of `root`. Both are normalized first.
pub fn is_within(root: &Path, child: &Path) -> bool {
    let root_n = normalize(root);
    let child_n = normalize(child);
    child_n.starts_with(&root_n)
}

/// Reject a path that doesn't sit inside any of the registered vault roots.
pub fn ensure_within_roots(target: &str, roots: &[String]) -> Result<(), AppError> {
    let target = Path::new(target);
    if roots.iter().any(|r| is_within(Path::new(r), target)) {
        Ok(())
    } else {
        Err(AppError::PathNotAllowed(target.display().to_string()))
    }
}

fn canonical_roots(roots: &[String]) -> Vec<PathBuf> {
    roots
        .iter()
        .filter_map(|r| std::fs::canonicalize(r).ok())
        .collect()
}

fn ensure_canonical_within_roots(target: &Path, roots: &[String]) -> Result<(), AppError> {
    let roots = canonical_roots(roots);
    if roots.is_empty() {
        return Err(AppError::PathNotAllowed(
            "no readable vault roots registered yet".into(),
        ));
    }
    if roots.iter().any(|r| target.starts_with(r)) {
        Ok(())
    } else {
        Err(AppError::PathNotAllowed(target.display().to_string()))
    }
}

/// Reject an existing path unless its real filesystem target is inside a vault.
/// This closes the symlink escape where `/vault/link` points outside `/vault`.
pub fn ensure_existing_within_roots(target: &str, roots: &[String]) -> Result<(), AppError> {
    let target = std::fs::canonicalize(target).map_err(AppError::Io)?;
    ensure_canonical_within_roots(&target, roots)
}

/// Reject a new write target unless its existing parent resolves inside a vault.
/// Use this for creates and atomic writes where the leaf may not exist yet.
pub fn ensure_parent_within_roots(target: &str, roots: &[String]) -> Result<(), AppError> {
    let target = Path::new(target);
    let parent = target.parent().ok_or_else(|| {
        AppError::PathNotAllowed(format!("path has no parent: {}", target.display()))
    })?;
    let parent = std::fs::canonicalize(parent).map_err(AppError::Io)?;
    ensure_canonical_within_roots(&parent, roots)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn within_accepts_root_and_children() {
        assert!(is_within(Path::new("/a/b"), Path::new("/a/b")));
        assert!(is_within(Path::new("/a/b"), Path::new("/a/b/c.md")));
    }

    #[test]
    fn within_rejects_escapes() {
        assert!(!is_within(Path::new("/a/b"), Path::new("/a/b/../c")));
        assert!(!is_within(Path::new("/a/b"), Path::new("/etc/hosts")));
    }
}
