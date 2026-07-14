import { invoke as tauriInvoke } from "@tauri-apps/api/core";

/**
 * Every Tauri command name, mirrored from `src-tauri/src/lib.rs::invoke_handler!`.
 * Adding a new command requires editing BOTH files; treat that as a rule.
 */
export const CMD = {
  // app lifecycle
  appCloseAfterFlush: "app_close_after_flush",
  // settings
  readSettings: "read_settings",
  writeSettings: "write_settings",
  // vaults
  vaultList: "vault_list",
  vaultAdd: "vault_add",
  vaultCreate: "vault_create",
  vaultRemove: "vault_remove",
  vaultRename: "vault_rename",
  vaultSetIcon: "vault_set_icon",
  vaultSetActive: "vault_set_active",
  // filesystem
  readDir: "read_dir",
  stat: "stat",
  readFileText: "read_file_text",
  writeFileText: "write_file_text",
  createFile: "create_file",
  createDir: "create_dir",
  renamePath: "rename_path",
  deletePath: "delete_path",
  movePath: "move_path",
  revealInFinder: "reveal_in_finder",
  readFileBytes: "read_file_bytes",
  vaultSaveAsset: "vault_save_asset",
  openWithDefaultApp: "open_with_default_app",
  // pages
  renamePage: "rename_page",
  movePage: "move_page",
  deletePage: "delete_page",
  // workspace
  saveWorkspaceState: "save_workspace_state",
  loadWorkspaceState: "load_workspace_state",
  // watcher
  watcherWatch: "watcher_watch",
  watcherUnwatch: "watcher_unwatch",
  // search
  searchInVault: "search_in_vault",
  listFiles: "list_files",
} as const;

export type CmdName = (typeof CMD)[keyof typeof CMD];

/** Plain-browser dev (vite without Tauri): route IPC to the in-memory mock. */
export const usingMockIpc = import.meta.env.DEV && !("__TAURI_INTERNALS__" in window);

export async function ipc<T = unknown>(
  cmd: CmdName,
  args?: Record<string, unknown>,
): Promise<T> {
  if (usingMockIpc) return (await import("./ipc.mock")).mockIpc<T>(cmd, args);
  return tauriInvoke<T>(cmd, args);
}

/** Error shape serialized by the Rust `AppError`. */
export interface AppError {
  code:
    | "NotFound"
    | "PermissionDenied"
    | "PathNotAllowed"
    | "FileTooLarge"
    | "Io"
    | "Other";
  message: string;
}

export function isAppError(err: unknown): err is AppError {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as AppError).code === "string" &&
    typeof (err as AppError).message === "string"
  );
}

export function errorMessage(err: unknown): string {
  if (isAppError(err)) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/* Shared payload types, mirrored from the Rust structs (camelCase serde). */

export interface Vault {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
  /** Emoji shown in the switcher instead of the initial letter. */
  icon: string | null;
}

export interface VaultsFile {
  vaults: Vault[];
  lastActiveVaultId: string | null;
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  mtimeMs: number;
}

export interface FileMeta {
  size: number;
  mtimeMs: number;
  isDir: boolean;
  isSymlink: boolean;
}

export interface TextFile {
  content: string;
  encoding: string;
  truncated: boolean;
  size: number;
}

export interface BytesFile {
  b64: string;
  mime: string | null;
  truncated: boolean;
  size: number;
}

export interface PagePaths {
  path: string;
  dirPath: string | null;
}

export type DeletePageOutcome =
  | { kind: "deleted"; deletedPaths: string[] }
  | { kind: "failed"; remainingPaths: string[]; message: string }
  | {
      kind: "partial";
      deletedPaths: string[];
      remainingPaths: string[];
      message: string;
    };

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  maxMatches?: number;
}

export interface SearchMatch {
  line: number;
  start: number;
  end: number;
  lineText: string;
}

export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}

export interface SearchResults {
  files: SearchFileResult[];
  totalMatches: number;
  truncated: boolean;
  elapsedMs: number;
}
