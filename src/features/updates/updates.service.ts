import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

import { useUpdatesStore } from "./updates.store";

let cachedUpdate: Update | null = null;

/**
 * Boot-time silent probe. In `tauri dev` (and in the browser-mock mode) the
 * updater has no installed app to compare against and `check()` throws, so we
 * skip the call entirely. Any other failure (network down, malformed
 * manifest) is swallowed: the absence of a pill is the user-visible signal.
 */
export async function checkSilent(): Promise<void> {
  if (import.meta.env.DEV) return;
  const store = useUpdatesStore.getState();
  const kind = store.status.kind;
  // Never stomp an in-flight check/install or an already-offered update.
  if (
    kind === "checking" ||
    kind === "available" ||
    kind === "downloading" ||
    kind === "installing"
  )
    return;

  store.setStatus({ kind: "checking" });
  try {
    const update = await check();
    if (!update) {
      store.setStatus({ kind: "idle" });
      cachedUpdate = null;
      return;
    }
    cachedUpdate = update;
    store.setStatus({
      kind: "available",
      version: update.version,
      notes: update.body,
    });
  } catch {
    store.setStatus({ kind: "idle" });
    cachedUpdate = null;
  }
}

/**
 * Explicit "Check for updates" from Settings. Unlike checkSilent, every
 * outcome is surfaced: "upToDate" and "checkError" exist only for this flow
 * (the pill hides both; the Settings row renders them). The DEV guard stays
 * because in dev there is no installed bundle to diff against, and a real
 * check could offer (and install) a release over the dev build.
 */
export async function checkManual(): Promise<void> {
  const store = useUpdatesStore.getState();
  const kind = store.status.kind;
  if (kind === "checking" || kind === "downloading" || kind === "installing") {
    return;
  }

  if (import.meta.env.DEV) {
    store.setStatus({
      kind: "checkError",
      message: "updater is disabled in dev builds",
    });
    return;
  }

  store.setStatus({ kind: "checking" });
  try {
    const update = await check();
    if (!update) {
      cachedUpdate = null;
      useUpdatesStore.getState().setStatus({ kind: "upToDate" });
      return;
    }
    cachedUpdate = update;
    useUpdatesStore.getState().setStatus({
      kind: "available",
      version: update.version,
      notes: update.body,
    });
  } catch (err) {
    cachedUpdate = null;
    useUpdatesStore.getState().setStatus({
      kind: "checkError",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * User clicked the pill. Drives downloadAndInstall, streaming progress into
 * the store; on completion we relaunch the app so the new binary boots clean.
 * On failure we surface a terse error; clicking again retries.
 */
export async function startInstall(): Promise<void> {
  const store = useUpdatesStore.getState();
  const update = cachedUpdate;
  if (!update) {
    store.setStatus({ kind: "idle" });
    return;
  }

  let downloaded = 0;
  let total: number | null = null;

  store.setStatus({
    kind: "downloading",
    version: update.version,
    downloaded: 0,
    total: null,
  });

  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? null;
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
      } else if (event.event === "Finished") {
        useUpdatesStore.getState().setStatus({
          kind: "installing",
          version: update.version,
        });
        return;
      }
      // Throttle store writes: only emit when state actually changed.
      const current = useUpdatesStore.getState().status;
      if (
        current.kind === "downloading" &&
        (current.downloaded !== downloaded || current.total !== total)
      ) {
        useUpdatesStore.getState().setStatus({
          kind: "downloading",
          version: update.version,
          downloaded,
          total,
        });
      }
    });
    // Plugin handles the actual install; relaunch hands control to the new
    // binary. If relaunch itself throws, we leave the pill in "installing".
    await relaunch();
  } catch (err) {
    useUpdatesStore.getState().setStatus({
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
