/**
 * Event names emitted by the Rust side, mirrored from
 * `src-tauri/src/events.rs`. Keep both lists in sync.
 */
export const EV = {
  fsChanged: "fs://changed",
  appCloseRequested: "app://close-requested",
} as const;

export type EventName = (typeof EV)[keyof typeof EV];

/** Payload of `fs://changed`. */
export interface FsChangedPayload {
  vaultId: string;
  paths: string[];
}
