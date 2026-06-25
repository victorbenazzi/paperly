use std::path::Path;

use grep_matcher::Matcher;
use grep_regex::{RegexMatcher, RegexMatcherBuilder};
use grep_searcher::{BinaryDetection, Searcher, SearcherBuilder, SinkMatch};
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default)]
    pub regex: bool,
    /// Maximum total matches before truncation kicks in.
    #[serde(default = "default_max")]
    pub max_matches: usize,
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            case_sensitive: false,
            whole_word: false,
            regex: false,
            max_matches: default_max(),
        }
    }
}

fn default_max() -> usize {
    500
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub line: u64,
    /// UTF-16 code unit offsets into `line_text` where the first match on the
    /// line starts/ends, so the webview can slice the string directly.
    pub start: u32,
    pub end: u32,
    pub line_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFileResult {
    pub path: String,
    pub matches: Vec<SearchMatch>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub files: Vec<SearchFileResult>,
    pub total_matches: u64,
    pub truncated: bool,
    pub elapsed_ms: u64,
}

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref(),
        Some("md") | Some("markdown")
    )
}

/// List files under `root` as absolute paths, respecting .gitignore and hidden
/// rules, capped at `max`. Powers the quick switcher. Read-only.
pub fn list_files(root: &str, max: usize) -> AppResult<Vec<String>> {
    let limit = max.max(1);
    let mut out: Vec<String> = Vec::new();
    let walker = WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .require_git(false)
        .ignore(true)
        .build();
    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        match entry.file_type() {
            Some(ft) if ft.is_file() => {}
            _ => continue,
        }
        out.push(entry.path().to_string_lossy().into_owned());
        if out.len() >= limit {
            break;
        }
    }
    Ok(out)
}

pub fn search(root: &str, query: &str, options: SearchOptions) -> AppResult<SearchResults> {
    let started = std::time::Instant::now();
    if query.is_empty() {
        return Ok(SearchResults {
            files: Vec::new(),
            total_matches: 0,
            truncated: false,
            elapsed_ms: 0,
        });
    }

    // `fixed_strings` makes the builder treat the query as a literal, so no
    // hand-rolled escaping (which broke on non-ASCII like "não") is needed.
    let matcher: RegexMatcher = RegexMatcherBuilder::new()
        .case_insensitive(!options.case_sensitive)
        .word(options.whole_word)
        .fixed_strings(!options.regex)
        .build(query)
        .map_err(|e| AppError::Other(format!("invalid pattern: {e}")))?;

    let mut searcher: Searcher = SearcherBuilder::new()
        .line_number(true)
        .multi_line(false)
        .binary_detection(BinaryDetection::quit(b'\x00'))
        .build();

    let mut files: Vec<SearchFileResult> = Vec::new();
    let mut total: u64 = 0;
    let mut truncated = false;
    let limit = options.max_matches.max(1);

    let walker = WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .require_git(false)
        .ignore(true)
        .max_filesize(Some(2 * 1024 * 1024)) // skip files > 2 MiB
        .build();

    for entry in walker {
        if truncated {
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() || !is_markdown(path) {
            continue;
        }

        let mut matches: Vec<SearchMatch> = Vec::new();
        let res = searcher.search_path(
            &matcher,
            path,
            CollectSink {
                matcher: &matcher,
                matches: &mut matches,
                cap_remaining: limit.saturating_sub(total as usize),
            },
        );
        if res.is_err() {
            continue; // unreadable file; ignore
        }

        if !matches.is_empty() {
            total += matches.len() as u64;
            files.push(SearchFileResult {
                path: path.to_string_lossy().into_owned(),
                matches,
            });
            if total as usize >= limit {
                truncated = true;
            }
        }
    }

    Ok(SearchResults {
        files,
        total_matches: total,
        truncated,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

struct CollectSink<'a> {
    matcher: &'a RegexMatcher,
    matches: &'a mut Vec<SearchMatch>,
    cap_remaining: usize,
}

impl grep_searcher::Sink for CollectSink<'_> {
    type Error = std::io::Error;

    fn matched(&mut self, _searcher: &Searcher, mat: &SinkMatch<'_>) -> Result<bool, Self::Error> {
        if self.cap_remaining == 0 {
            return Ok(false);
        }
        let line = mat.line_number().unwrap_or(0);
        let bytes = mat.bytes();
        let line_text = String::from_utf8_lossy(bytes).trim_end().to_string();

        // Byte offsets of the first match, converted to UTF-16 code units so
        // the frontend can highlight by slicing line_text directly.
        let (start, end) = match self.matcher.find(bytes) {
            Ok(Some(m)) => (
                byte_to_utf16(bytes, m.start()),
                byte_to_utf16(bytes, m.end()),
            ),
            _ => (0, 0),
        };

        self.matches.push(SearchMatch {
            line,
            start,
            end,
            line_text,
        });
        self.cap_remaining -= 1;
        Ok(self.cap_remaining > 0)
    }
}

fn byte_to_utf16(bytes: &[u8], byte_offset: usize) -> u32 {
    let upto = byte_offset.min(bytes.len());
    String::from_utf8_lossy(&bytes[..upto])
        .encode_utf16()
        .count() as u32
}
