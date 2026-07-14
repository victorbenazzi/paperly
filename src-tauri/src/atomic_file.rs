use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::error::AppResult;

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

fn temporary_path(path: &Path) -> PathBuf {
    let sequence = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("paperly");
    path.with_file_name(format!(
        "{file_name}.paperly.tmp.{}.{sequence}",
        std::process::id()
    ))
}

#[cfg(not(windows))]
fn replace_file(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::rename(from, to)
}

#[cfg(windows)]
fn replace_file(from: &Path, to: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn write_with_hook<F>(path: &Path, bytes: &[u8], before_replace: F) -> AppResult<()>
where
    F: FnOnce() -> std::io::Result<()>,
{
    let temp_path = temporary_path(path);
    let result = (|| -> std::io::Result<()> {
        let mut temp = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)?;
        temp.write_all(bytes)?;
        temp.sync_all()?;
        drop(temp);
        before_replace()?;
        replace_file(&temp_path, path)?;

        #[cfg(unix)]
        if let Some(parent) = path.parent() {
            if let Ok(directory) = fs::File::open(parent) {
                let _ = directory.sync_all();
            }
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result.map_err(Into::into)
}

pub fn write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    write_with_hook(path, bytes, || Ok(()))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::{Arc, Barrier};
    use std::thread;

    use super::*;

    fn test_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "paperly-{name}-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn replaces_an_existing_file_completely() {
        let dir = test_dir("atomic-replace");
        let path = dir.join("note.md");
        fs::write(&path, "old").unwrap();

        write(&path, b"complete replacement").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "complete replacement");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn concurrent_writers_never_publish_partial_content() {
        let dir = test_dir("atomic-concurrent");
        let path = dir.join("note.md");
        fs::write(&path, "initial").unwrap();
        let barrier = Arc::new(Barrier::new(3));

        let handles = ["alpha".repeat(20_000), "beta".repeat(20_000)].map(|content| {
            let path = path.clone();
            let barrier = barrier.clone();
            thread::spawn(move || {
                barrier.wait();
                write(&path, content.as_bytes()).unwrap();
                content
            })
        });
        barrier.wait();
        let expected = handles.map(|handle| handle.join().unwrap());
        let actual = fs::read_to_string(&path).unwrap();

        assert!(expected.contains(&actual));
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn preserves_the_original_and_cleans_up_when_replacement_fails() {
        let dir = test_dir("atomic-failure");
        let path = dir.join("note.md");
        fs::write(&path, "original").unwrap();

        let result = write_with_hook(&path, b"new content", || {
            Err(std::io::Error::other("simulated disk full"))
        });

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }
}
