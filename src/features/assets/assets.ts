import { CMD, ipc, type BytesFile } from "@/lib/ipc";

/**
 * Vault file bytes as object URLs, cached by absolute path. Images render
 * through here instead of the Tauri asset protocol: no dynamic-scope
 * bookkeeping, same sandbox as every other fs command.
 */
const urlCache = new Map<string, Promise<string>>();

export function fileObjectUrl(absPath: string): Promise<string> {
  const cached = urlCache.get(absPath);
  if (cached) return cached;
  const promise = ipc<BytesFile>(CMD.readFileBytes, { path: absPath }).then((file) => {
    const bin = atob(file.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: file.mime ?? "application/octet-stream" });
    return URL.createObjectURL(blob);
  });
  urlCache.set(absPath, promise);
  promise.catch(() => urlCache.delete(absPath));
  return promise;
}

/** Drop a cached object URL (e.g. after the watcher reports the file changed). */
export function invalidateFileUrl(absPath: string) {
  const cached = urlCache.get(absPath);
  urlCache.delete(absPath);
  void cached?.then((url) => URL.revokeObjectURL(url)).catch(() => {});
}

/** Drop cached URLs for exact paths or directories reported by the watcher. */
export function invalidateFileUrls(paths: string[]) {
  for (const key of [...urlCache.keys()]) {
    if (paths.some((p) => key === p || key.startsWith(`${p}/`))) {
      invalidateFileUrl(key);
    }
  }
}

/**
 * BlockNote `uploadFile`: pasted/dropped bytes go to `<vault>/assets/` and the
 * block keeps the VAULT-RELATIVE path (`assets/x.png`), which is exactly what
 * lands in the markdown. `resolveFileUrl` turns it back into something the
 * webview can display.
 */
export async function uploadAssetToVault(vaultId: string, file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const b64 = btoa(bin);
  return ipc<string>(CMD.vaultSaveAsset, {
    vaultId,
    fileName: file.name || "pasted",
    bytesB64: b64,
  });
}

/**
 * BlockNote `resolveFileUrl`: external URLs pass through; vault-relative
 * paths resolve against the vault root and come back as object URLs.
 */
export async function resolveVaultFileUrl(vaultRoot: string, url: string): Promise<string> {
  if (/^(https?:|data:|blob:|asset:)/i.test(url)) return url;
  const abs = url.startsWith("/") ? url : `${vaultRoot}/${url}`;
  try {
    return await fileObjectUrl(abs);
  } catch {
    return url;
  }
}
