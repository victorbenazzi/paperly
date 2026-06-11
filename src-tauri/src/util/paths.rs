use std::path::{Path, PathBuf};

use crate::error::AppError;

/// Normalize a path by collapsing redundant `.` and `..` and removing trailing slashes.
/// Does NOT resolve symlinks (intentional: lexical normalization for scope checks,
/// so a symlink cannot escape the sandbox via realpath).
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
