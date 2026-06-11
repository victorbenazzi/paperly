import { invoke as tauriInvoke } from "@tauri-apps/api/core";

/**
 * Every Tauri command name, mirrored from `src-tauri/src/lib.rs::invoke_handler!`.
 * Adding a new command requires editing BOTH files; treat that as a rule.
 */
export const CMD = {
  // settings
  readSettings: "read_settings",
  writeSettings: "write_settings",
} as const;

export type CmdName = (typeof CMD)[keyof typeof CMD];

export async function ipc<T = unknown>(
  cmd: CmdName,
  args?: Record<string, unknown>,
): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

/** Error shape serialized by the Rust `AppError`. */
export interface AppError {
  code:
    | "NotFound"
    | "PermissionDenied"
    | "PathNotAllowed"
    | "FileTooLarge"
    | "Store"
    | "Agent"
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
