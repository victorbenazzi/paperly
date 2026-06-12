import type { CmdName, DirEntry, SearchResults, TextFile, Vault, VaultsFile } from "./ipc";

/**
 * In-memory IPC mock so the React app runs in a plain browser (vite dev,
 * no Tauri). Used to reproduce and debug UI races with real DevTools.
 * Loaded ONLY when import.meta.env.DEV and the Tauri bridge is absent.
 */

const VAULT = "/vault";

const vault: Vault = {
  id: "v1",
  name: "Mock Vault",
  path: VAULT,
  createdAt: "2026-01-01T00:00:00Z",
  lastOpenedAt: "2026-01-01T00:00:00Z",
  icon: null,
};

const files = new Map<string, string>([
  [`${VAULT}/Home.md`, "---\nicon: \u{1F3E0}\n---\n\n# Home\n\nWelcome. See [[Alpha]] and [[Beta]].\n"],
  [`${VAULT}/Alpha.md`, "# Alpha\n\nAlpha body.\n"],
  [`${VAULT}/Beta.md`, "---\nicon: \u{1F60D}\n---\n\n# Beta\n\nBeta body.\n"],
  [`${VAULT}/Projects.md`, "# Projects\n\nFolder note body.\n"],
  [`${VAULT}/Projects/Roadmap.md`, "# Roadmap\n\nInside projects.\n"],
  [`${VAULT}/Docs/Guide.md`, "# Guide\n\nInside docs.\n"],
]);
const dirs = new Set<string>([VAULT, `${VAULT}/Projects`, `${VAULT}/Docs`]);

let workspaceState: unknown = {
  expanded: [],
  openPath: `${VAULT}/Home.md`,
  treeOrder: {},
};

/** Simulated latency of the workspace-state read (the race under test). */
const LOAD_STATE_DELAY_MS = 800;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const parentOf = (p: string) => p.slice(0, p.lastIndexOf("/"));
const baseOf = (p: string) => p.split("/").pop()!;

function listDir(path: string): DirEntry[] {
  const out: DirEntry[] = [];
  for (const d of dirs) {
    if (parentOf(d) === path) {
      out.push({ name: baseOf(d), path: d, isDir: true, isSymlink: false, size: 0, mtimeMs: 0 });
    }
  }
  for (const f of files.keys()) {
    if (parentOf(f) === path) {
      out.push({
        name: baseOf(f),
        path: f,
        isDir: false,
        isSymlink: false,
        size: files.get(f)!.length,
        mtimeMs: 0,
      });
    }
  }
  return out;
}

function movePrefix(from: string, to: string) {
  for (const [k, v] of [...files]) {
    if (k === from || k.startsWith(`${from}/`)) {
      files.delete(k);
      files.set(to + k.slice(from.length), v);
    }
  }
  for (const d of [...dirs]) {
    if (d === from || d.startsWith(`${from}/`)) {
      dirs.delete(d);
      dirs.add(to + d.slice(from.length));
    }
  }
}

export async function mockIpc<T>(cmd: CmdName, args: Record<string, unknown> = {}): Promise<T> {
  const a = args as Record<string, string>;
  console.log("[mock-ipc]", cmd, args);
  switch (cmd) {
    case "vault_list":
      return { vaults: [vault], lastActiveVaultId: vault.id } satisfies VaultsFile as T;
    case "vault_set_active":
      return null as T;
    case "vault_rename": {
      const newPath = `${parentOf(vault.path)}/${a.name}`;
      movePrefix(vault.path, newPath);
      vault.path = newPath;
      vault.name = a.name;
      return { ...vault } as T;
    }
    case "vault_set_icon":
      vault.icon = (args.icon as string | null) ?? null;
      return { ...vault } as T;
    case "vault_remove":
      return null as T;
    case "load_workspace_state":
      await delay(LOAD_STATE_DELAY_MS);
      return workspaceState as T;
    case "save_workspace_state":
      workspaceState = args.state;
      return null as T;
    case "read_dir":
      return listDir(a.path) as T;
    case "read_file_text": {
      const content = files.get(a.path);
      if (content === undefined) throw { code: "NotFound", message: `no file ${a.path}` };
      return { content, encoding: "utf-8", truncated: false, size: content.length } satisfies TextFile as T;
    }
    case "write_file_text":
      files.set(a.path, a.content);
      return null as T;
    case "create_file": {
      const p = `${a.parent}/${a.name}`;
      files.set(p, "");
      return p as T;
    }
    case "create_dir": {
      const p = `${a.parent}/${a.name}`;
      dirs.add(p);
      return p as T;
    }
    case "rename_path": {
      const to = `${parentOf(a.path)}/${a.newName}`;
      movePrefix(a.path, to);
      return to as T;
    }
    case "move_path": {
      const to = `${a.targetDir}/${baseOf(a.path)}`;
      movePrefix(a.path, to);
      return to as T;
    }
    case "delete_path":
      movePrefix(a.path, "/dev-null");
      for (const k of [...files.keys()]) if (k.startsWith("/dev-null")) files.delete(k);
      for (const d of [...dirs]) if (d.startsWith("/dev-null")) dirs.delete(d);
      return null as T;
    case "list_files":
      return [...files.keys()] as T;
    case "search_in_vault":
      return { files: [], totalMatches: 0, truncated: false, elapsedMs: 1 } satisfies SearchResults as T;
    case "stat":
      return { size: 0, mtimeMs: 0, isDir: dirs.has(a.path), isSymlink: false } as T;
    case "read_file_bytes":
      return { b64: "", mime: null, truncated: false, size: 0 } as T;
    case "watcher_watch":
    case "watcher_unwatch":
    case "reveal_in_finder":
    case "open_with_default_app":
      return null as T;
    default:
      throw { code: "Other", message: `mock-ipc: unhandled command ${cmd}` };
  }
}
