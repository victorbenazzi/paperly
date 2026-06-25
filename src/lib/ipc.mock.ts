import type {
  BytesFile,
  CmdName,
  DirEntry,
  FileMeta,
  PagePaths,
  SearchResults,
  TextFile,
  Vault,
  VaultsFile,
} from "./ipc";

/**
 * In-memory IPC mock so the React app runs in a plain browser (vite dev,
 * no Tauri). Keep this exhaustive: every command in CMD needs a handler here.
 */

const INITIAL_VAULT = "/vault";

let vaults: Vault[] = [
  {
    id: "v1",
    name: "Mock Vault",
    path: INITIAL_VAULT,
    createdAt: "2026-01-01T00:00:00Z",
    lastOpenedAt: "2026-01-01T00:00:00Z",
    icon: null,
  },
];
let activeVaultId: string | null = "v1";
let nextVaultId = 2;

const files = new Map<string, string>([
  [`${INITIAL_VAULT}/Home.md`, "---\nicon: \u{1F3E0}\n---\n\n# Home\n\nWelcome. See [[Alpha]] and [[Beta]].\n"],
  [`${INITIAL_VAULT}/Alpha.md`, "# Alpha\n\nAlpha body.\n"],
  [`${INITIAL_VAULT}/Beta.md`, "---\nicon: \u{1F60D}\n---\n\n# Beta\n\nBeta body.\n"],
  [`${INITIAL_VAULT}/Projects.md`, "# Projects\n\nFolder note body.\n"],
  [`${INITIAL_VAULT}/Projects/Roadmap.md`, "# Roadmap\n\nInside projects.\n"],
  [`${INITIAL_VAULT}/Docs/Guide.md`, "# Guide\n\nInside docs.\n"],
]);
const dirs = new Set<string>([INITIAL_VAULT, `${INITIAL_VAULT}/Projects`, `${INITIAL_VAULT}/Docs`]);

let settingsState: unknown = {};
let workspaceState: unknown = {
  expanded: [],
  openPath: `${INITIAL_VAULT}/Home.md`,
  treeOrder: {},
};

/** Simulated latency of the workspace-state read (the race under test). */
const LOAD_STATE_DELAY_MS = 800;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const parentOf = (p: string) => p.slice(0, p.lastIndexOf("/")) || "/";
const baseOf = (p: string) => p.split("/").pop()!;
const isMarkdown = (name: string) => /\.(md|markdown)$/i.test(name);

function activeVault(): Vault {
  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];
  if (!vault) throw { code: "NotFound", message: "no mock vault" };
  return vault;
}

function listDir(path: string): DirEntry[] {
  const out: DirEntry[] = [];
  for (const d of dirs) {
    if (d !== path && parentOf(d) === path) {
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

function ensureDir(path: string) {
  if (!dirs.has(path)) throw { code: "NotFound", message: `no folder ${path}` };
}

function createVault(path: string, name = baseOf(path)): Vault {
  const now = new Date().toISOString();
  const existing = vaults.find((v) => v.path === path);
  if (existing) {
    existing.lastOpenedAt = now;
    activeVaultId = existing.id;
    return { ...existing };
  }
  dirs.add(path);
  const vault: Vault = {
    id: `v${nextVaultId++}`,
    name,
    path,
    createdAt: now,
    lastOpenedAt: now,
    icon: null,
  };
  vaults = [...vaults, vault];
  activeVaultId = vault.id;
  return { ...vault };
}

function renamePage(path: string, dirPath: string | null, newDisplayName: string): PagePaths {
  const newPath = `${parentOf(path)}/${newDisplayName}.md`;
  movePrefix(path, newPath);
  let nextDirPath: string | null = null;
  if (dirPath && dirs.has(dirPath)) {
    nextDirPath = `${parentOf(dirPath)}/${newDisplayName}`;
    movePrefix(dirPath, nextDirPath);
  }
  return { path: newPath, dirPath: nextDirPath };
}

function movePage(path: string, dirPath: string | null, targetDir: string): PagePaths {
  const newPath = `${targetDir}/${baseOf(path)}`;
  movePrefix(path, newPath);
  let nextDirPath: string | null = null;
  if (dirPath && dirs.has(dirPath)) {
    nextDirPath = `${targetDir}/${baseOf(dirPath)}`;
    movePrefix(dirPath, nextDirPath);
  }
  return { path: newPath, dirPath: nextDirPath };
}

const handlers = {
  read_settings: async () => settingsState,
  write_settings: async (args) => {
    settingsState = args.value;
    return null;
  },
  vault_list: async () =>
    ({
      vaults: vaults.map((v) => ({ ...v })),
      lastActiveVaultId: activeVaultId,
    }) satisfies VaultsFile,
  vault_add: async (args) => createVault(String(args.path ?? INITIAL_VAULT)),
  vault_create: async (args) => {
    const directory = String(args.directory ?? "/");
    const name = String(args.name ?? "Mock Vault");
    return createVault(`${directory.replace(/\/$/, "")}/${name}`, name);
  },
  vault_remove: async (args) => {
    vaults = vaults.filter((v) => v.id !== args.id);
    if (activeVaultId === args.id) activeVaultId = vaults[0]?.id ?? null;
    return null;
  },
  vault_rename: async (args) => {
    const vault = vaults.find((v) => v.id === args.id);
    if (!vault) throw { code: "NotFound", message: `vault ${String(args.id)}` };
    const newPath = `${parentOf(vault.path)}/${String(args.name)}`;
    movePrefix(vault.path, newPath);
    vault.path = newPath;
    vault.name = String(args.name);
    return { ...vault };
  },
  vault_set_icon: async (args) => {
    const vault = vaults.find((v) => v.id === args.id);
    if (!vault) throw { code: "NotFound", message: `vault ${String(args.id)}` };
    vault.icon = (args.icon as string | null) ?? null;
    return { ...vault };
  },
  vault_set_active: async (args) => {
    if (!vaults.some((v) => v.id === args.id)) {
      throw { code: "NotFound", message: `vault ${String(args.id)}` };
    }
    activeVaultId = String(args.id);
    return null;
  },
  read_dir: async (args) => listDir(String(args.path)),
  stat: async (args) => {
    const path = String(args.path);
    const content = files.get(path);
    if (dirs.has(path)) return { size: 0, mtimeMs: 0, isDir: true, isSymlink: false } satisfies FileMeta;
    if (content !== undefined) {
      return { size: content.length, mtimeMs: 0, isDir: false, isSymlink: false } satisfies FileMeta;
    }
    throw { code: "NotFound", message: `no path ${path}` };
  },
  read_file_text: async (args) => {
    const path = String(args.path);
    const content = files.get(path);
    if (content === undefined) throw { code: "NotFound", message: `no file ${path}` };
    return { content, encoding: "utf-8", truncated: false, size: content.length } satisfies TextFile;
  },
  write_file_text: async (args) => {
    files.set(String(args.path), String(args.content));
    return null;
  },
  create_file: async (args) => {
    const parent = String(args.parent);
    ensureDir(parent);
    const path = `${parent}/${String(args.name)}`;
    if (files.has(path) || dirs.has(path)) throw { code: "Other", message: `already exists ${path}` };
    files.set(path, "");
    return path;
  },
  create_dir: async (args) => {
    const parent = String(args.parent);
    ensureDir(parent);
    const path = `${parent}/${String(args.name)}`;
    if (files.has(path) || dirs.has(path)) throw { code: "Other", message: `already exists ${path}` };
    dirs.add(path);
    return path;
  },
  rename_path: async (args) => {
    const to = `${parentOf(String(args.path))}/${String(args.newName)}`;
    movePrefix(String(args.path), to);
    return to;
  },
  delete_path: async (args) => {
    movePrefix(String(args.path), "/dev-null");
    for (const k of [...files.keys()]) if (k.startsWith("/dev-null")) files.delete(k);
    for (const d of [...dirs]) if (d.startsWith("/dev-null")) dirs.delete(d);
    return null;
  },
  move_path: async (args) => {
    const to = `${String(args.targetDir)}/${baseOf(String(args.path))}`;
    movePrefix(String(args.path), to);
    return to;
  },
  reveal_in_finder: async () => null,
  read_file_bytes: async () => ({ b64: "", mime: null, truncated: false, size: 0 }) satisfies BytesFile,
  vault_save_asset: async (args) => {
    const vault = activeVault();
    dirs.add(`${vault.path}/assets`);
    const rawName = baseOf(String(args.fileName || "pasted"));
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]+/g, "-") || "asset.bin";
    const rel = `assets/${Date.now()}-${safeName}`;
    files.set(`${vault.path}/${rel}`, String(args.bytesB64 ?? ""));
    return rel;
  },
  open_with_default_app: async () => null,
  rename_page: async (args) =>
    renamePage(
      String(args.path),
      (args.dirPath as string | null | undefined) ?? null,
      String(args.newDisplayName),
    ),
  move_page: async (args) =>
    movePage(
      String(args.path),
      (args.dirPath as string | null | undefined) ?? null,
      String(args.targetDir),
    ),
  delete_page: async (args) => {
    await handlers.delete_path({ path: args.path });
    const dirPath = args.dirPath as string | null | undefined;
    if (dirPath) await handlers.delete_path({ path: dirPath });
    return null;
  },
  save_workspace_state: async (args) => {
    workspaceState = args.state;
    return null;
  },
  load_workspace_state: async () => {
    await delay(LOAD_STATE_DELAY_MS);
    return workspaceState;
  },
  watcher_watch: async () => null,
  watcher_unwatch: async () => null,
  search_in_vault: async () =>
    ({ files: [], totalMatches: 0, truncated: false, elapsedMs: 1 }) satisfies SearchResults,
  list_files: async () => [...files.keys()].filter((f) => isMarkdown(baseOf(f))),
} satisfies Record<CmdName, (args: Record<string, unknown>) => Promise<unknown>>;

export async function mockIpc<T>(cmd: CmdName, args: Record<string, unknown> = {}): Promise<T> {
  console.log("[mock-ipc]", cmd, args);
  return (await handlers[cmd](args)) as T;
}
